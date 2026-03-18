import React, { useState, useEffect, useRef } from "react";
import { Monitor, Tv, Share2, Play, StopCircle, Copy, Check, Info, Maximize, Minimize, Volume2, VolumeX, UserPlus, X, ShieldCheck, Pause, EyeOff, Eye, Users, RefreshCw, LogOut } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const STUN_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

// Munge SDP to prefer H246 (Essential for older TV hardware decoders)
const preferH264 = (sdp: string) => {
  const lines = sdp.split("\r\n");
  const mLineIndex = lines.findIndex(l => l.startsWith("m=video"));
  if (mLineIndex === -1) return sdp;

  const mLineParts = lines[mLineIndex].split(" ");
  const h264Payloads: string[] = [];
  
  // Find all H264 payload types
  lines.forEach(l => {
    if (l.startsWith("a=rtpmap:") && l.includes("H264/90000")) {
      const match = l.match(/a=rtpmap:(\d+)/);
      if (match) h264Payloads.push(match[1]);
    }
  });

  if (h264Payloads.length > 0) {
    const otherPayloads = mLineParts.slice(3).filter(p => !h264Payloads.includes(p));
    lines[mLineIndex] = mLineParts.slice(0, 3).join(" ") + " " + h264Payloads.join(" ") + " " + otherPayloads.join(" ");
  }
  
  return lines.join("\r\n");
};

type Mode = "home" | "share" | "watch";

export default function App() {
  const [mode, setMode] = useState<Mode>("home");
  const [roomId, setRoomId] = useState("");
  const [isSharing, setIsSharing] = useState(false);
  const [status, setStatus] = useState("Listo para conectar");
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(true); // Start muted to ensure autoplay works on all browsers
  const [hasAudio, setHasAudio] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  const [pendingRequests, setPendingRequests] = useState<{id: string, name: string}[]>([]);
  const [accessStatus, setAccessStatus] = useState<"idle" | "requesting" | "granted" | "denied">("idle");
  const [isConnected, setIsConnected] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [participants, setParticipants] = useState<{id: string, name: string}[]>([]);
  
  const isSharingRef = useRef(false);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const socketRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    // Keep a cleaner console for remaining app-level noise
    const handleRejection = (event: PromiseRejectionEvent) => {
      const msg = String(event.reason || "").toLowerCase();
      if (msg.includes("websocket") || msg.includes("receiving end")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("unhandledrejection", handleRejection);
    return () => window.removeEventListener("unhandledrejection", handleRejection);
  }, []);

  // Monitoring for frozen video on TV
  useEffect(() => {
    let checkInterval: number;
    if (mode === "watch" && remoteVideoRef.current) {
      let lastTime = 0;
      let freezeCount = 0;
      
      checkInterval = window.setInterval(() => {
        const video = remoteVideoRef.current;
        if (!video || video.paused || video.ended || video.readyState < 2) return;
        
        if (video.currentTime === lastTime && status.includes("Conectado")) {
           freezeCount++;
           if (freezeCount > 6) { // ~3 seconds frozen
             console.log("[mira] Detectada imagen estática, re-activando...");
             video.play().catch(() => {});
             freezeCount = 0;
           }
        } else {
          freezeCount = 0;
        }
        lastTime = video.currentTime;
      }, 500);
    }
    return () => clearInterval(checkInterval);
  }, [mode, status]);

  useEffect(() => {
    let reconnectTimeout: number;
    let initialDelayTimeout: number;

    const connect = () => {
      // Use absolute URL detection to avoid issues on some older TV browsers
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws-signal`;
      console.log(`[mira] Intentando conectar a: ${wsUrl}`);
      
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log("[mira] WebSocket conectado exitosamente");
        setStatus("Conectado al servidor");
        setIsConnected(true);
        reconnectAttempts.current = 0; // Reset attempts on success
        
        // Start Heartbeat to prevent Render/CDN timeouts
        const heartbeat = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "heartbeat" }));
          } else {
            clearInterval(heartbeat);
          }
        }, 30000);
      };

      socket.onmessage = async (event) => {
        // Keep-alive/Heartbeat log (optional, only for debug)
        // console.debug("[mira] Mensaje recibido del servidor");
        try {
          const message = JSON.parse(event.data);
          console.log(`[mira] Mensaje tipo: ${message.type}`);
          
          if (message.type === "your-id") {
            setMyId(message.id);
          } else if (message.type === "signal") {
            await handleSignal(message.data, message.sender);
          } else if (message.type === "leave") {
            if (message.userId) {
              const pc = peerConnections.current.get(message.userId);
               pc?.close();
               peerConnections.current.delete(message.userId);
               setParticipants(prev => prev.filter(p => p.id !== message.userId));
             } else {
              // Broadcaster left the room
              const finalMessage = "Transmisión finalizada por el emisor. Volviendo al inicio...";
              setStatus(finalMessage);
              if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
              setHasAudio(false);
              
              // If we are in watch mode, return to home after a few seconds
              if (mode === "watch") {
                setTimeout(() => {
                  setMode("home");
                  setAccessStatus("idle");
                  setStatus("Listo para conectar");
                  if (document.fullscreenElement) {
                    document.exitFullscreen().catch(() => {});
                  }
                }, 3500);
              }
            }
          } else if (message.type === "request-access") {
            setPendingRequests(prev => {
              if (prev.find(r => r.id === message.userId)) {
                // Update name if already exists
                return prev.map(r => r.id === message.userId ? { ...r, name: message.userName } : r);
              }
              return [...prev, { id: message.userId, name: message.userName }];
            });
          } else if (message.type === "access-response") {
            if (message.granted) {
              setAccessStatus("granted");
              setStatus("Acceso concedido. Conectando...");
              createPeerConnection(message.broadcasterId);
            } else {
              setAccessStatus("denied");
              setStatus("Acceso denegado por el emisor");
            }
          } else if (message.type === "user-joined") {
            if (isSharingRef.current) {
              // Proactive fix: If a user joins and we are sharing, 
              // add them to pending immediately so the button appears
              setPendingRequests(prev => {
                if (prev.find(r => r.id === message.userId)) return prev;
                return [...prev, { id: message.userId, name: "Usuario esperando..." }];
              });
              setStatus("Un usuario solicita acceso");
            }
          } else if (message.type === "pause-state") {
            setIsPaused(message.paused);
          } else if (message.type === "user-list") {
            setParticipants(message.participants);
          }
        } catch (err) {
          // Silently handle JSON parse errors
        }
      };

      socket.onerror = (error) => {
        // Suppress the scary 'isTrusted' error log during reconnection
        // It's normal while the server is starting up
        if (socket.readyState === WebSocket.CLOSED) {
          console.debug("WebSocket connection attempt failed, will retry...");
        } else {
          console.error("WebSocket error:", error);
        }
        setStatus("Reconectando...");
      };

      socket.onclose = (event) => {
        setIsConnected(false);
        console.log(`WebSocket closed: ${event.reason || 'No reason'}. Reconnecting in ${Math.min(10000, 3000 + (reconnectAttempts.current * 1000))}ms`);
        reconnectAttempts.current++;
        reconnectTimeout = window.setTimeout(connect, Math.min(10000, 3000 + (reconnectAttempts.current * 1000)));
      };
    };

    const reconnectAttempts = { current: 0 };

    // Wait 2 seconds before first connection to let the server port map correctly
    initialDelayTimeout = window.setTimeout(connect, 2000);

    return () => {
      clearTimeout(initialDelayTimeout);
      clearTimeout(reconnectTimeout);
      if (socketRef.current && (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING)) {
        socketRef.current.close();
      }
      stopSharing();
    };
  }, []);

  // Update ref whenever state changes
  useEffect(() => {
    isSharingRef.current = isSharing;
  }, [isSharing]);

  // Helper to send messages safely
  const safeSend = (data: any) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(data));
      return true;
    }
    return false;
  };

  const handleSignal = async (data: any, senderId: string) => {
    let pc = peerConnections.current.get(senderId);
    
    if (!pc && data.type === "offer") {
      pc = createPeerConnection(senderId);
    }

    if (!pc) return;

    try {
      if (data.type === "offer") {
        await pc.setRemoteDescription(new RTCSessionDescription(data));
        const answer = await pc.createAnswer();
        // Force H264 on the answer
        answer.sdp = preferH264(answer.sdp!);
        await pc.setLocalDescription(answer);
        sendSignal(answer, senderId);
        setStatus("Conectado (Recibiendo)");
      } else if (data.type === "answer") {
        await pc.setRemoteDescription(new RTCSessionDescription(data));
        setStatus("Conectado (Transmitiendo)");
      } else if (data.type === "candidate") {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    } catch (err) {
      console.error("Error handling signal:", err);
    }
  };

  const sendSignal = (data: any, targetId?: string) => {
    safeSend({
      type: "signal",
      room: roomId,
      data: data,
      targetId: targetId
    });
  };

  const createPeerConnection = (targetId: string) => {
    const pc = new RTCPeerConnection(STUN_SERVERS);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal({ type: "candidate", candidate: event.candidate }, targetId);
      }
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      if (state === "disconnected" || state === "failed" || state === "closed") {
        if (mode === "watch") {
          const lostMsg = "Conexión perdida con el emisor. Volviendo al inicio...";
          setStatus(lostMsg);
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
          setHasAudio(false);
          
           // Return to home after delay
           setTimeout(() => {
            if (mode === "watch") {
               setMode("home");
               setAccessStatus("idle");
               setStatus("Listo para conectar");
               if (document.fullscreenElement) {
                document.exitFullscreen().catch(() => {});
               }
            }
          }, 3500);
         }
         peerConnections.current.delete(targetId);
         setParticipants(prev => prev.filter(p => p.id !== targetId));
       }
     };

    pc.ontrack = (event) => {
      console.log("¡Señal detectada! Forzando decodificador...");
      if (remoteVideoRef.current) {
        const video = remoteVideoRef.current;
        video.srcObject = null;
        video.srcObject = event.streams[0];
        
        // THE "LEGACY NUDGE" (V3)
        // High-frequency attempt to wake up old Android/TV decoders
        let attempts = 0;
        const kickstart = () => {
          if (!video || !event.streams[0] || attempts > 10) return;
          attempts++;
          
          video.play().then(() => {
            console.log("[mira] Reproducción iniciada con éxito");
            // Briefly toggle volume to ensure audio engine is also awake
            const v = video.volume;
            video.volume = 0.01;
            setTimeout(() => { video.volume = v; }, 200);
          }).catch(() => {
            console.debug("[mira] Reintentando arranque...");
            setTimeout(kickstart, 1000);
          });
        };
        
        // Some TVs need a tiny delay after setting srcObject
        setTimeout(kickstart, 500);
        
        // Auto-fullscreen logic
        if (mode === "watch" && !document.fullscreenElement && videoContainerRef.current) {
          videoContainerRef.current.requestFullscreen().catch(() => {});
        }

        const audioTracks = event.streams[0].getAudioTracks();
        setHasAudio(audioTracks.length > 0);
      }
    };

    peerConnections.current.set(targetId, pc);
    return pc;
  };

  const startSharing = async () => {
    if (!roomId) {
      alert("Por favor, ingresa un ID de sala");
      return;
    }

    try {
      // First join the room to be ready for incoming requests
      const joinSent = safeSend({ type: "join", room: roomId, name: "Escritorio (Emisor)" });
      if (!joinSent) {
        throw new Error("No se pudo enviar mensaje de unión. Revisa la conexión.");
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { 
          width: { ideal: 1280 }, // 720p is much more stable for TV decoders
          height: { ideal: 720 },
          frameRate: { ideal: 25 }
        } as any,
        audio: true
      });
      
      streamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      setIsSharing(true);
      setStatus("Sala abierta. Esperando solicitudes...");

      stream.getVideoTracks()[0].onended = () => {
        stopSharing();
      };

    } catch (err) {
      console.error("Error starting screen share:", err);
      setStatus("Error al capturar pantalla");
    }
  };

   const approveAccess = async (userId: string) => {
     try {
       const request = pendingRequests.find(r => r.id === userId);
       setPendingRequests(prev => prev.filter(req => req.id !== userId));
       if (request) {
         setParticipants(prev => {
            if (prev.find(p => p.id === userId)) return prev;
            return [...prev, request];
         });
       }
       
       // Send approval
      safeSend({ type: "access-response", targetId: userId, granted: true });
      
      // Prepare WebRTC for this specific user
      if (streamRef.current) {
        const pc = createPeerConnection(userId);
        
        // Implement Simulcast (Adaptive Quality)
        const videoTrack = streamRef.current.getVideoTracks()[0];
        const audioTrack = streamRef.current.getAudioTracks()[0];

        // Use straightforward track adding for max compatibility
        if (audioTrack) pc.addTrack(audioTrack, streamRef.current);
        if (videoTrack) {
          pc.addTransceiver(videoTrack, {
            streams: [streamRef.current],
            sendEncodings: [
              { maxBitrate: 1800000, maxFramerate: 25 } // Single stable stream
            ]
          });
        }

        const offer = await pc.createOffer();
        // Force H264 on the offer
        offer.sdp = preferH264(offer.sdp!);
        await pc.setLocalDescription(offer);
        sendSignal(offer, userId);
      }
    } catch (err) {
      console.error("Error approving access:", err);
      setStatus("Error al conectar con el usuario");
    }
  };

  const denyAccess = (userId: string) => {
    setPendingRequests(prev => prev.filter(req => req.id !== userId));
    safeSend({ type: "access-response", targetId: userId, granted: false });
  };

  const stopSharing = () => {
    safeSend({ type: "leave", room: roomId });
    streamRef.current?.getTracks().forEach(track => track.stop());
    peerConnections.current.forEach(pc => pc.close());
     peerConnections.current.clear();
     setIsSharing(false);
     setIsPaused(false);
     setParticipants([]);
     setStatus("Compartición finalizada");
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
  };

  const togglePause = () => {
    const nextPaused = !isPaused;
    setIsPaused(nextPaused);
    safeSend({ type: "pause-state", room: roomId, paused: nextPaused });
  };

  const requestAccess = () => {
    if (!roomId) {
      alert("Por favor, ingresa un ID de sala");
      return;
    }
    
    setAccessStatus("requesting");
    setStatus("Solicitando acceso al emisor...");
    
    // Requesting fullscreen on the body/document as it's the most reliable for TVs
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {
          console.log("Primer intento de Fullscreen fallido (esperando aprobación)");
        });
    }
    
    if (safeSend({ type: "join", room: roomId, name: "Usuario TV" })) {
      safeSend({ type: "request-access", room: roomId, userName: "Usuario TV" });
    } else {
      setStatus("Error: No hay conexión con el servidor");
      setAccessStatus("idle");
    }
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const generateRoomId = () => {
    const id = Math.random().toString(36).substring(2, 8).toUpperCase();
    setRoomId(id);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (accessStatus === "granted" && !document.fullscreenElement) {
        // Redundant attempt when access is granted
        document.documentElement.requestFullscreen().catch(() => {});
    }
  }, [accessStatus]);

  const reSync = () => {
    if (remoteVideoRef.current) {
      console.log("[mira] Re-sincronización manual solicitada");
      remoteVideoRef.current.play().catch(() => {});
      // Small trick: toggle mute briefly to wake up some audio/video decoders
      const wasMuted = isMuted;
      setIsMuted(true);
      setTimeout(() => setIsMuted(wasMuted), 200);
      setStatus("Sincronizando imagen...");
      setTimeout(() => setStatus("Conectado (Recibiendo)"), 2000);
    }
  };

  return (
    <div 
      style={{ backgroundColor: "#09090b", color: "#f4f4f5", minHeight: "100vh" }}
      className="bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/30"
    >
      {/* Header - Simplified for low resources */}
      <header className="p-4 border-b-2 border-emerald-500/20 bg-zinc-950 sticky top-0 z-50 flex justify-between items-center">
        <div className="flex items-center gap-4 cursor-pointer" onClick={() => setMode("home")}>
          <div className="w-12 h-12 bg-emerald-500 rounded-lg flex items-center justify-center border-2 border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]">
            <Share2 className="text-zinc-950 w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tighter uppercase italic leading-none">MIRA</h1>
            <span className="text-[10px] font-bold text-emerald-500/60 tracking-widest uppercase">Stream Engine</span>
          </div>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg">
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500 shadow-[0_0_10px_#ef4444]'}`} />
          <span className="text-[10px] font-black tracking-widest uppercase text-zinc-400">
            {isConnected ? 'SISTEMA OK' : 'OFFLINE'}
          </span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 md:p-8">
          {mode === "home" && (
            <div className="flex flex-col md:flex-row gap-6 mt-6 md:mt-12 h-[calc(100vh-180px)] md:h-auto">
              <button
                onClick={() => { setMode("share"); generateRoomId(); }}
                className="flex-1 group bg-zinc-900 border-4 border-zinc-800 p-10 rounded-[40px] hover:border-emerald-500 transition-all text-center flex flex-col items-center justify-center gap-6 active:scale-95 active:bg-zinc-800"
              >
                <div className="w-24 h-24 bg-emerald-500 rounded-[32px] flex items-center justify-center shadow-2xl group-hover:rotate-6 transition-transform">
                  <Monitor className="text-zinc-950 w-12 h-12" />
                </div>
                <div>
                  <h2 className="text-4xl font-black mb-2 uppercase tracking-tighter">EMITIR</h2>
                  <p className="text-zinc-500 font-bold text-sm uppercase tracking-widest">Compartir mi pantalla</p>
                </div>
                <div className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-6 py-2 rounded-full font-black text-xs uppercase tracking-widest">
                  Iniciar Sala
                </div>
              </button>

              <button
                onClick={() => setMode("watch")}
                className="flex-1 group bg-zinc-900 border-4 border-zinc-800 p-10 rounded-[40px] hover:border-emerald-500 transition-all text-center flex flex-col items-center justify-center gap-6 active:scale-95 active:bg-zinc-800"
              >
                <div className="w-24 h-24 bg-zinc-100 rounded-[32px] flex items-center justify-center shadow-2xl group-hover:-rotate-6 transition-transform">
                  <Tv className="text-zinc-950 w-12 h-12" />
                </div>
                <div>
                  <h2 className="text-4xl font-black mb-2 uppercase tracking-tighter">RECIBIR</h2>
                  <p className="text-zinc-500 font-bold text-sm uppercase tracking-widest">Ver una transmisión</p>
                </div>
                <div className="bg-white/10 text-white border border-white/20 px-6 py-2 rounded-full font-black text-xs uppercase tracking-widest">
                  Entrar con Código
                </div>
              </button>
            </div>
          )}
          {mode === "share" && (
            <div key="share" className="space-y-6 animate-in fade-in duration-500">
               {/* Header del Panel */}
               <div className="bg-zinc-900 border-4 border-zinc-800 p-6 md:p-8 rounded-[32px] flex flex-col md:flex-row justify-between items-center gap-6">
                  <div className="text-center md:text-left">
                     <h2 className="text-3xl font-black uppercase tracking-tighter">Panel de Emisor</h2>
                     <p className="text-emerald-500/60 font-bold text-xs uppercase tracking-widest">Transmitiendo en vivo</p>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                     <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em]">Código de Sala</span>
                     <div className="bg-zinc-950 border-2 border-emerald-500/30 px-8 py-3 rounded-2xl flex items-center gap-4 shadow-inner">
                        <span className="font-mono text-3xl font-black text-emerald-500 tracking-[0.2em]">{roomId || "------"}</span>
                        <button onClick={copyRoomId} className="p-2 hover:bg-emerald-500/10 rounded-lg transition-all text-emerald-500 active:scale-90" title="Copiar código">
                           {copied ? <Check size={24} /> : <Copy size={24} />}
                        </button>
                     </div>
                  </div>
               </div>

               <div className="grid lg:grid-cols-[1fr,320px] gap-6">
                  {/* MONITOR IZQUIERDO: MONITOR DE EMISIÓN */}
                  <div className="space-y-4">
                     <div className="bg-black border-4 border-zinc-800 rounded-[40px] overflow-hidden relative aspect-video shadow-2xl">
                        <video ref={localVideoRef} autoPlay playsInline muted className={`w-full h-full object-contain ${isPaused ? 'opacity-20 grayscale' : ''}`} />
                        
                        {isPaused && (
                           <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/60">
                              <div className="bg-amber-500 text-amber-950 px-8 py-4 rounded-2xl font-black uppercase tracking-[0.2em] flex items-center gap-3 animate-pulse">
                                 <Pause size={24} /> Vista en Pausa
                              </div>
                           </div>
                        )}
                        
                        {!isSharing && (
                           <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-800">
                              <Monitor size={80} className="mb-4 opacity-10" />
                              <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40">Monitor de Sistema</p>
                           </div>
                        )}

                        {isSharing && !isPaused && (
                           <div className="absolute top-6 left-6 flex items-center gap-2 bg-red-600 px-3 py-1 rounded-lg">
                              <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                              <span className="text-white text-[10px] font-black uppercase">En Vivo</span>
                           </div>
                        )}
                     </div>

                     {/* BOTONES DE ACCIÓN GIGANTES */}
                     <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {!isSharing ? (
                           <button onClick={startSharing} className="col-span-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black py-6 rounded-[24px] text-xl uppercase tracking-tighter flex items-center justify-center gap-3 shadow-xl shadow-emerald-500/10 active:scale-95">
                              <Share2 size={24} /> Empezar a Compartir
                           </button>
                        ) : (
                           <>
                              <button onClick={togglePause} className={`py-6 rounded-[24px] font-black text-lg uppercase tracking-tighter flex items-center justify-center gap-3 transition-all active:scale-95 ${isPaused ? 'bg-amber-500 text-amber-950 shadow-lg' : 'bg-zinc-800 text-white hover:bg-zinc-700'}`}>
                                 {isPaused ? <Play size={24} /> : <Pause size={24} />}
                                 {isPaused ? "Reanudar" : "Pausar"}
                              </button>
                              <button onClick={stopSharing} className="bg-red-500 hover:bg-red-400 text-white font-black py-6 rounded-[24px] text-lg uppercase tracking-tighter flex items-center justify-center gap-3 shadow-xl shadow-red-500/10 active:scale-95">
                                 <StopCircle size={24} /> Detener
                              </button>
                           </>
                        )}
                        <button onClick={() => { stopSharing(); setMode("home"); }} className="bg-zinc-900 border-2 border-zinc-800 text-zinc-400 hover:text-white font-black py-6 rounded-[24px] text-lg uppercase tracking-tighter active:scale-95">
                           Volver
                        </button>
                     </div>
                  </div>

                  {/* LISTA DERECHA: AUDIENCIA */}
                  <div className="bg-zinc-900 border-4 border-zinc-800 rounded-[32px] flex flex-col h-[600px] overflow-hidden shadow-xl">
                     <div className="p-5 border-b-2 border-zinc-800 flex justify-between items-center bg-zinc-800/20">
                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Espectadores ({participants.length})</span>
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                     </div>
                     <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                         {/* Solicitudes de Acceso */}
                         <AnimatePresence>
                           {pendingRequests.map(req => (
                              <motion.div 
                                 key={req.id} 
                                 initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }}
                                 className="bg-emerald-500 p-4 rounded-2xl flex flex-col gap-3 shadow-lg shadow-emerald-500/10"
                              >
                                 <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-zinc-950 rounded-lg flex items-center justify-center text-emerald-500 font-black">{req.name.charAt(0)}</div>
                                    <div className="flex flex-col min-w-0">
                                       <span className="text-xs font-black text-zinc-950 truncate">{req.name}</span>
                                       <span className="text-[8px] font-black text-zinc-950/60 uppercase">Pide acceso</span>
                                    </div>
                                 </div>
                                 <button onClick={() => approveAccess(req.id)} className="bg-zinc-950 text-emerald-500 font-black py-3 rounded-xl text-xs uppercase tracking-widest hover:bg-zinc-900 transition-all border border-zinc-800">Ceder Paso</button>
                              </motion.div>
                           ))}
                         </AnimatePresence>
                         
                         {/* Usuarios Conectados */}
                         {participants.filter(p => p.id !== myId).map(p => (
                            <div key={p.id} className="bg-zinc-950 border-2 border-zinc-800 p-4 rounded-2xl flex items-center gap-3">
                               <div className="w-10 h-10 bg-zinc-900 rounded-lg flex items-center justify-center text-emerald-500 font-bold border border-zinc-800">{p.name.charAt(0)}</div>
                               <div className="flex flex-col flex-1 min-w-0">
                                  <span className="text-xs font-black truncate">{p.name}</span>
                                  <span className="text-[8px] font-bold text-zinc-600 uppercase">En el sistema</span>
                               </div>
                            </div>
                         ))}
                         
                         {participants.filter(p => p.id !== myId).length === 0 && pendingRequests.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-20 opacity-20">
                               <Users size={32} />
                               <span className="text-[8px] font-black uppercase tracking-[0.3em] mt-2">Sala Vacía</span>
                            </div>
                         )}
                     </div>
                     
                     <div className="p-4 bg-zinc-800/10 border-t-2 border-zinc-800 flex items-center justify-center gap-2">
                        <ShieldCheck size={14} className="text-emerald-500/40" />
                        <span className="text-[8px] font-black text-zinc-600 uppercase tracking-widest italic">Cifrado de Extremo a Extremo</span>
                     </div>
                  </div>
               </div>
            </div>
          )}

          {mode === "watch" && (
            <div key="watch" className="animate-in fade-in duration-500">
                {accessStatus !== "granted" ? (
                 <div className="flex items-center justify-center min-h-[calc(100vh-200px)]">
                    <div className="bg-zinc-900 border-4 border-zinc-800 p-6 md:p-8 rounded-[32px] w-full max-w-sm text-center shadow-2xl">
                       <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-xl shadow-emerald-500/10">
                          <Tv className="text-zinc-950 w-8 h-8" />
                       </div>
                       <h2 className="text-3xl font-black mb-1 uppercase tracking-tighter">Entrar a Sala</h2>
                       <p className="text-zinc-500 font-bold text-[10px] uppercase tracking-widest mb-8">Ingresa el código del emisor</p>
                       
                       <div className="space-y-4">
                         <input
                           type="text"
                           value={roomId}
                           onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                           placeholder="CÓDIGO"
                           disabled={accessStatus === "requesting"}
                           className="bg-black border-4 border-zinc-800 focus:border-emerald-500 px-4 py-4 rounded-2xl font-mono text-4xl font-black text-emerald-500 focus:outline-none transition-all w-full text-center tracking-[0.2em] shadow-inner"
                         />
                         
                         {accessStatus === "requesting" ? (
                            <div className="bg-zinc-800 py-4 rounded-2xl text-zinc-400 font-black text-[10px] uppercase tracking-widest animate-pulse border-2 border-zinc-700">
                               Esperando Aprobación...
                            </div>
                         ) : (
                            <button onClick={requestAccess} className="w-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black py-4 rounded-2xl transition-all shadow-xl shadow-emerald-500/10 text-lg uppercase tracking-tighter active:scale-95">
                               Conectar Ahora
                            </button>
                         )}
                         
                         {accessStatus === "denied" && (
                            <p className="text-red-500 font-black bg-red-500/10 p-3 rounded-xl border-2 border-red-500/20 text-[9px] uppercase tracking-widest text-center">Acceso rechazado</p>
                         )}
                         <button onClick={() => setMode("home")} className="text-[9px] text-zinc-600 font-black uppercase tracking-widest hover:text-zinc-400">Volver al inicio</button>
                       </div>
                    </div>
                 </div>
               ) : (
                 <div className={`flex flex-col ${isFullscreen ? '' : 'lg:flex-row'} gap-6 h-[calc(100vh-160px)]`}>
                    <div className="flex-1 relative bg-black rounded-[40px] overflow-hidden border-4 border-zinc-800 group shadow-2xl">
                       <video ref={remoteVideoRef} autoPlay playsInline className={`w-full h-full object-contain ${isPaused ? 'opacity-20 grayscale' : ''}`} />
                       
                       {isPaused && (
                         <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/40">
                            <div className="bg-amber-500 text-amber-950 px-8 py-4 rounded-2xl font-black uppercase tracking-widest animate-pulse">Reproducción en Pausa</div>
                         </div>
                       )}

                       {/* Barra de Controles para Receptor */}
                       <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-zinc-950 border-2 border-zinc-800 px-6 py-3 rounded-full opacity-0 group-hover:opacity-100 transition-all z-20">
                          <button onClick={reSync} className="p-3 bg-emerald-500/20 text-emerald-500 rounded-xl hover:bg-emerald-500/30" title="Sincronizar">
                              <RefreshCw size={20} />
                          </button>
                          <button onClick={() => setIsMuted(!isMuted)} className="p-3 text-white hover:bg-zinc-800 rounded-xl" title="Audio">
                             {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
                          </button>
                          <button onClick={toggleFullscreen} className="p-3 text-white hover:bg-zinc-800 rounded-xl" title="Pantalla Completa">
                             {isFullscreen ? <Minimize size={24} /> : <Maximize size={24} />}
                          </button>
                          <button onClick={() => { stopSharing(); setMode("home"); }} className="p-3 bg-red-500/20 text-red-500 rounded-xl hover:bg-red-500/30" title="Cerrar">
                              <LogOut size={20} />
                          </button>
                       </div>
                    </div>

                    {!isFullscreen && (
                      <div className="w-full lg:w-40 flex flex-col gap-4">
                          <div className="bg-zinc-900 border-4 border-zinc-800 p-4 rounded-[32px] flex flex-col items-center gap-4">
                             <span className="text-[8px] font-black uppercase tracking-widest text-zinc-600">En la sala</span>
                             <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-zinc-950 font-black shadow-lg shadow-emerald-500/10 border-2 border-emerald-400" title="Tú">
                                 TÚ
                             </div>
                             {participants.filter(p => p.id !== myId).map(p => (
                                <div key={p.id} className="w-12 h-12 bg-zinc-950 border-2 border-zinc-800 rounded-2xl flex items-center justify-center text-zinc-500 font-black shadow-inner" title={p.name}>
                                   {p.name?.charAt(0) || "U"}
                                </div>
                             ))}
                          </div>
                      </div>
                    )}
                 </div>
               )}
            </div>
          )}
      </main>

      {/* Footer */}
      <footer className="p-12 text-center text-zinc-600 text-sm">
        <p>© nextappcode • Todos los derechos reservados</p>
      </footer>
    </div>
  );
}
