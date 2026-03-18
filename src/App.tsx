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
    
    // Requesting fullscreen ahead of time to "prime" the user gesture
    // Many browsers allow this if it's within the same click event
    if (videoContainerRef.current && !document.fullscreenElement) {
        videoContainerRef.current.requestFullscreen().catch(() => {
          // Silent fail - we'll try again when the track arrives
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
    if (!videoContainerRef.current) return;

    if (!document.fullscreenElement) {
      videoContainerRef.current.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
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
      {/* Header */}
      <header className="p-6 border-b border-zinc-800/50 backdrop-blur-md sticky top-0 z-50 flex justify-between items-center" style={{ borderBottom: "1px solid #27272a" }}>
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setMode("home")}>
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20" style={{ background: "#10b981", borderRadius: "12px" }}>
            <Share2 className="text-zinc-950 w-6 h-6" style={{ width: "24px", height: "24px", color: "#09090b" }} />
          </div>
          <h1 className="text-xl font-bold tracking-tight">mira</h1>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-zinc-500 bg-zinc-900/50 px-3 py-1.5 rounded-full border border-zinc-800" style={{ padding: "6px 12px", borderRadius: "99px", background: "#18181b", border: "1px solid #27272a" }}>
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} style={{ width: "8px", height: "8px", borderRadius: "50%", background: isConnected ? "#10b981" : "#ef4444" }} />
          {isConnected ? 'SISTEMA ONLINE' : 'CONECTANDO...'}
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6 md:p-12" style={{ maxWidth: "1024px", margin: "0 auto", padding: "24px" }}>
          {mode === "home" && (
            <div
              key="home"
              className="grid md:grid-cols-2 gap-8 mt-12"
              style={{ display: "flex", flexWrap: "wrap", gap: "24px", marginTop: "48px" }}
            >
              <button
                onClick={() => { setMode("share"); generateRoomId(); }}
                className="group relative bg-zinc-900 border border-zinc-800 p-8 rounded-3xl hover:border-emerald-500/50 transition-all duration-500 text-left overflow-hidden"
                style={{ flex: "1", minWidth: "300px", background: "#18181b", border: "1px solid #27272a", borderRadius: "24px", padding: "32px", textAlign: "left", cursor: "pointer", color: "#fff" }}
              >
                <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-6" style={{ width: "56px", height: "56px", background: "rgba(16, 185, 129, 0.1)", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "24px" }}>
                  <Monitor className="text-emerald-500 w-8 h-8" style={{ width: "32px", height: "32px", color: "#10b981" }} />
                </div>
                <h2 className="text-2xl font-bold mb-3" style={{ fontSize: "24px", fontWeight: "bold", margin: "0 0 12px 0" }}>Compartir Pantalla</h2>
                <p className="text-zinc-400 leading-relaxed" style={{ color: "#a1a1aa", margin: "0 0 32px 0" }}>
                  Envía tu pantalla a otro dispositivo.
                </p>
                <div className="mt-8 flex items-center gap-2 text-emerald-500 font-semibold" style={{ display: "flex", alignItems: "center", gap: "8px", color: "#10b981", fontWeight: "600" }}>
                  Empezar ahora <Play size={16} />
                </div>
              </button>

              <button
                onClick={() => setMode("watch")}
                className="group relative bg-zinc-900 border border-zinc-800 p-8 rounded-3xl hover:border-emerald-500/50 transition-all duration-500 text-left overflow-hidden"
                style={{ flex: "1", minWidth: "300px", background: "#18181b", border: "1px solid #27272a", borderRadius: "24px", padding: "32px", textAlign: "left", cursor: "pointer", color: "#fff" }}
              >
                <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-6" style={{ width: "56px", height: "56px", background: "rgba(16, 185, 129, 0.1)", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "24px" }}>
                  <Tv className="text-emerald-500 w-8 h-8" style={{ width: "32px", height: "32px", color: "#10b981" }} />
                </div>
                <h2 className="text-2xl font-bold mb-3" style={{ fontSize: "24px", fontWeight: "bold", margin: "0 0 12px 0" }}>Ver Transmisión</h2>
                <p className="text-zinc-400 leading-relaxed" style={{ color: "#a1a1aa", margin: "0 0 32px 0" }}>
                  Recibe la pantalla de otro dispositivo.
                </p>
                <div className="mt-8 flex items-center gap-2 text-emerald-500 font-semibold" style={{ display: "flex", alignItems: "center", gap: "8px", color: "#10b981", fontWeight: "600" }}>
                  Unirse a sala <Play size={16} />
                </div>
              </button>
            </div>
          )}

          {mode === "share" && (
            <motion.div
              key="share"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="space-y-6"
              style={{ maxWidth: "1200px", margin: "0 auto" }}
            >
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-zinc-900 border border-zinc-800 p-8 rounded-[32px]">
                <div>
                  <h2 className="text-3xl font-bold mb-1 tracking-tight">Panel de Emisión</h2>
                  <p className="text-zinc-500 text-sm">Gestiona tu transmisión y audiencia en tiempo real.</p>
                </div>
                <div className="flex items-center gap-3 bg-zinc-950 p-2 rounded-2xl border border-zinc-800 shadow-inner">
                  <div className="px-5 py-2.5 font-mono text-2xl font-bold text-emerald-500 tracking-[0.2em]">
                    {roomId || "------"}
                  </div>
                  <button 
                    onClick={copyRoomId}
                    className="p-3.5 hover:bg-zinc-800 rounded-xl transition-all text-zinc-400 hover:text-white active:scale-90"
                    title="Copiar código"
                  >
                    {copied ? <Check size={22} className="text-emerald-500" /> : <Copy size={22} />}
                  </button>
                </div>
              </div>

              <div className="grid lg:grid-cols-[1fr,340px] gap-8 items-start">
                {/* LADO IZQUIERDO: MONITOR PRINCIPAL */}
                <div className="space-y-6">
                  <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-[40px] shadow-2xl overflow-hidden relative group">
                    <div className="aspect-video bg-zinc-950 rounded-[28px] border border-zinc-800/50 overflow-hidden relative shadow-inner">
                      <video 
                        ref={localVideoRef} 
                        autoPlay 
                        playsInline 
                        muted 
                        className={`w-full h-full object-contain transition-all duration-1000 ${isPaused ? 'blur-2xl opacity-40 scale-105 grayscale' : ''}`}
                      />
                      {isPaused && (
                        <div className="absolute inset-0 flex items-center justify-center z-20">
                          <motion.div 
                            initial={{ scale: 0.8 }} animate={{ scale: 1 }}
                            className="bg-amber-500/10 backdrop-blur-xl px-10 py-5 rounded-3xl border border-amber-500/30 flex flex-col items-center gap-4 shadow-2xl shadow-amber-500/10"
                          >
                            <div className="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center">
                               <EyeOff className="text-amber-500 w-8 h-8" />
                            </div>
                            <span className="text-amber-500 font-black uppercase tracking-[0.3em] text-xs">Vista en Pausa</span>
                          </motion.div>
                        </div>
                      )}
                      {!isSharing && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-800 z-10">
                          <Monitor size={80} className="mb-6 opacity-10" />
                          <p className="text-xs font-bold uppercase tracking-widest opacity-30">Previsualización de sistema</p>
                        </div>
                      )}
                      
                      {/* Live Badge */}
                      {isSharing && !isPaused && (
                        <div className="absolute top-6 left-6 z-20">
                          <div className="bg-red-500/20 backdrop-blur-md px-3 py-1.5 rounded-full border border-red-500/30 flex items-center gap-2">
                             <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
                             <span className="text-red-500 text-[10px] font-black uppercase tracking-wider">Emitiendo</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-8 flex flex-wrap gap-4 px-2">
                      {!isSharing ? (
                        <button
                          onClick={startSharing}
                          className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black py-5 px-10 rounded-2xl transition-all flex items-center justify-center gap-3 shadow-xl shadow-emerald-500/20 active:scale-[0.98]"
                        >
                          <Share2 size={24} /> EMPEZAR A COMPARTIR
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={togglePause}
                            className={`flex-1 ${isPaused ? 'bg-amber-500 text-amber-950' : 'bg-zinc-800 text-white hover:bg-zinc-700'} font-black py-5 px-6 rounded-2xl transition-all flex items-center justify-center gap-3 shadow-lg active:scale-[0.98]`}
                          >
                            {isPaused ? <Play size={20} /> : <Pause size={20} />}
                            {isPaused ? "REANUDAR VISTA" : "PAUSAR VISTA"}
                          </button>
                          <button
                            onClick={stopSharing}
                            className="flex-1 bg-red-500 hover:bg-red-400 text-white font-black py-5 px-6 rounded-2xl transition-all flex items-center justify-center gap-3 shadow-xl shadow-red-500/20 active:scale-[0.98]"
                          >
                            <StopCircle size={20} /> DETENER
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => { stopSharing(); setMode("home"); }}
                        className="bg-zinc-800 hover:bg-zinc-700 text-white font-black py-5 px-8 rounded-2xl transition-all active:scale-[0.98]"
                      >
                        VOLVER
                      </button>
                    </div>
                  </div>

                  <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-3xl flex items-center gap-5">
                    <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center shrink-0">
                       <Info className="text-emerald-500" size={24} />
                    </div>
                    <div className="text-xs text-zinc-500 leading-relaxed font-medium">
                       Comparte el código de sala con otros dispositivos. Una vez se unan, aparecerán en la lista de la derecha para ser aprobados.
                    </div>
                  </div>
                </div>

                {/* LADO DERECHO: COLUMNA DE USUARIOS */}
                <div className="space-y-6 lg:h-[calc(100vh-280px)] lg:sticky lg:top-32">
                  <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] overflow-hidden flex flex-col h-full shadow-2xl">
                    <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-800/20">
                       <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-2">
                         <Users size={14} className="text-emerald-500" /> Espectadores
                       </h3>
                       <div className="bg-emerald-500/10 px-2 py-0.5 rounded text-[10px] font-bold text-emerald-500 border border-emerald-500/20">
                          {participants.length}
                       </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                       {/* Solicitudes - PRIORIDAD */}
                       <AnimatePresence>
                         {pendingRequests.map(req => (
                           <motion.div 
                              key={req.id}
                              initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }}
                              className="bg-emerald-500/5 border border-emerald-500/20 p-4 rounded-2xl ring-1 ring-emerald-500/10"
                           >
                              <div className="flex items-center gap-3 mb-4">
                                 <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-zinc-950 font-black shadow-lg shadow-emerald-500/30">
                                    {req.name.charAt(0)}
                                 </div>
                                 <div className="flex flex-col min-w-0">
                                    <span className="text-xs font-black truncate text-emerald-500">{req.name}</span>
                                    <span className="text-[9px] text-zinc-500 font-bold">Solicita entrar</span>
                                 </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                 <button 
                                    onClick={() => approveAccess(req.id)}
                                    className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-md shadow-emerald-500/10"
                                 >
                                    Aceptar
                                 </button>
                                 <button 
                                    onClick={() => denyAccess(req.id)}
                                    className="bg-zinc-800 hover:bg-zinc-700 text-white py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider"
                                 >
                                    No
                                 </button>
                              </div>
                           </motion.div>
                         ))}
                       </AnimatePresence>

                       {/* Miembros Activos */}
                       <div className="space-y-3">
                          {participants.filter(p => p.id !== myId).length === 0 && pendingRequests.length === 0 && (
                             <div className="text-center py-20 flex flex-col items-center gap-4 opacity-20">
                                <Users size={40} />
                                <span className="text-[10px] font-black uppercase tracking-widest">Sin actividad</span>
                             </div>
                          )}
                          
                          {participants.filter(p => p.id !== myId).map(p => (
                             <div key={p.id} className="group relative bg-zinc-950 border border-zinc-800 p-3.5 rounded-2xl flex items-center gap-3 transition-all hover:border-emerald-500/30">
                                <div className="w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center text-xs font-black text-emerald-500 border border-zinc-700 shadow-inner">
                                   {p.name.charAt(0)}
                                </div>
                                <div className="flex flex-col min-w-0 flex-1">
                                    <span className="text-xs font-black truncate text-zinc-300 group-hover:text-emerald-500 transition-colors">{p.name}</span>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                       <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                       <span className="text-[9px] text-zinc-600 font-black uppercase tracking-tighter">Viendo ahora</span>
                                    </div>
                                </div>
                             </div>
                          ))}
                       </div>
                    </div>
                    
                    {isSharing && (
                       <div className="p-4 bg-emerald-500/5 border-t border-zinc-800">
                          <div className="bg-emerald-500/20 px-3 py-2 rounded-xl border border-emerald-500/20 flex items-center justify-center gap-2">
                             <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                             <span className="text-[9px] font-black text-emerald-500 uppercase tracking-[0.1em]">CONEXIÓN CIFRADA P2P</span>
                          </div>
                       </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {mode === "watch" && (
            <motion.div
              key="watch"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
              style={{ maxWidth: "1400px", margin: "0 auto", height: isFullscreen ? "100vh" : "calc(100vh - 160px)" }}
            >
              {accessStatus !== "granted" ? (
                <div className="flex items-center justify-center h-full">
                   <div className="bg-zinc-900 border border-zinc-800 p-10 rounded-[40px] w-full max-w-lg text-center shadow-2xl">
                      <div className="w-20 h-20 bg-emerald-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
                         <Tv className="text-emerald-500 w-10 h-10" />
                      </div>
                      <h2 className="text-3xl font-black mb-2 tracking-tight">Ver Transmisión</h2>
                      <p className="text-zinc-500 text-sm mb-8">Ingresa el código para conectarte al televisor remoto</p>
                      
                      <div className="space-y-6">
                        <input
                          type="text"
                          value={roomId}
                          onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                          placeholder="CÓDIGO DE SALA"
                          disabled={accessStatus === "requesting"}
                          className="bg-zinc-950 border-2 border-zinc-800 focus:border-emerald-500 px-8 py-5 rounded-3xl font-mono text-3xl font-black text-emerald-500 focus:outline-none transition-all w-full text-center tracking-[0.3em] shadow-inner"
                        />
                        
                        {accessStatus === "requesting" ? (
                           <div className="flex flex-col gap-4">
                              <div className="bg-zinc-800 p-5 rounded-3xl text-zinc-400 font-bold flex items-center justify-center gap-3 animate-pulse border border-zinc-700">
                                 <ShieldCheck size={24} /> ESPERANDO APROBACIÓN...
                              </div>
                              <button onClick={requestAccess} className="text-[10px] text-emerald-500 font-black uppercase tracking-widest hover:underline text-center">Re-enviar solicitud</button>
                           </div>
                        ) : (
                           <button
                             onClick={requestAccess}
                             className="w-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black py-5 px-8 rounded-3xl transition-all shadow-xl shadow-emerald-500/20 text-lg uppercase active:scale-[0.98]"
                           >
                             UNIRSE AHORA
                           </button>
                        )}
                        
                        {accessStatus === "denied" && (
                           <motion.p initial={{y:10}} animate={{y:0}} className="text-red-500 font-bold bg-red-500/10 p-4 rounded-2xl border border-red-500/20 text-xs text-center">Acceso rechazado por el emisor</motion.p>
                        )}
                      </div>
                   </div>
                </div>
              ) : (
                <div className={`grid ${isFullscreen ? 'grid-cols-1' : 'lg:grid-cols-[1fr,140px]'} gap-4 h-full`}>
                   <div 
                      ref={videoContainerRef}
                      className="relative bg-black rounded-[40px] overflow-hidden shadow-2xl border border-zinc-900 group"
                   >
                      <video 
                        ref={remoteVideoRef} 
                        autoPlay 
                        playsInline 
                        muted={isMuted}
                        style={{ width: "100%", height: "100%", objectFit: "contain" }}
                        className={`transition-all duration-1000 ${isPaused ? "blur-[60px] opacity-30 grayscale scale-110" : ""}`}
                      />
                      
                      {isPaused && (
                         <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
                            <motion.div 
                              initial={{scale:0.9, opacity:0}} animate={{scale:1, opacity:1}}
                              className="bg-zinc-900/40 backdrop-blur-2xl p-12 rounded-[50px] border border-white/5 flex flex-col items-center gap-6"
                            >
                               <div className="w-20 h-20 bg-amber-500/20 rounded-full flex items-center justify-center border border-amber-500/30">
                                  <Pause size={40} className="text-amber-500" />
                               </div>
                               <div className="text-center">
                                  <h3 className="text-2xl font-black text-white uppercase tracking-[0.2em] mb-2">Transmisión en Pausa</h3>
                                  <p className="text-zinc-400 text-xs font-medium">El emisor ha ocultado la vista temporalmente</p>
                               </div>
                            </motion.div>
                         </div>
                      )}
                      
                      <div className="absolute top-8 left-8 flex items-center gap-3">
                         <div className="bg-emerald-500/10 backdrop-blur-md px-4 py-2 rounded-full border border-emerald-500/20 flex items-center gap-2">
                            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_#10b981]" />
                            <span className="text-emerald-500 text-[10px] font-black uppercase tracking-wider">{status}</span>
                         </div>
                      </div>

                      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-zinc-900/60 backdrop-blur-2xl px-6 py-4 rounded-[32px] border border-white/10 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-4 group-hover:translate-y-0 z-20">
                          <button onClick={reSync} className="p-3 bg-emerald-500/20 text-emerald-500 rounded-2xl hover:bg-emerald-500/30 transition-all" title="Re-sincronizar">
                              <RefreshCw size={20} />
                          </button>
                          <div className="w-px h-6 bg-white/10 mx-1" />
                          <button onClick={() => setIsMuted(!isMuted)} className="p-3 text-white hover:bg-white/10 rounded-2xl transition-all" title={isMuted ? "Activar audio" : "Silenciar"}>
                             {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
                          </button>
                          <button onClick={toggleFullscreen} className="p-3 text-white hover:bg-white/10 rounded-2xl transition-all" title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}>
                             {isFullscreen ? <Minimize size={24} /> : <Maximize size={24} />}
                          </button>
                          <div className="w-px h-6 bg-white/10 mx-1" />
                          <button onClick={() => { stopSharing(); setMode("home"); }} className="p-3 bg-red-500/20 text-red-500 rounded-2xl hover:bg-red-500/30 transition-all" title="Cerrar conexión">
                              <LogOut size={20} />
                          </button>
                      </div>
                   </div>

                   {!isFullscreen && (
                      <div className="flex flex-col gap-4 overflow-y-auto pr-1 custom-scrollbar">
                         <div className="group relative bg-zinc-900 border-2 border-emerald-500 p-1 rounded-3xl transition-transform hover:scale-105 active:scale-95 cursor-pointer shadow-xl shadow-emerald-500/10 aspect-video shrink-0">
                             <div className="w-full h-full bg-zinc-950 rounded-2xl overflow-hidden relative">
                                <div className="absolute inset-0 flex items-center justify-center bg-zinc-800/50">
                                   <Monitor className="text-emerald-500 opacity-20" size={32} />
                                </div>
                                <div className="absolute bottom-0 left-0 right-0 bg-emerald-500 py-1.5 px-2 text-[8px] font-black text-zinc-950 text-center uppercase tracking-tighter">
                                   Emisor
                                </div>
                             </div>
                         </div>

                         <div className="grid gap-3">
                            <div className="aspect-square bg-zinc-900 border border-zinc-800 rounded-3xl flex flex-col items-center justify-center gap-2 group hover:border-emerald-500/40 transition-all cursor-default shadow-lg shadow-black/40">
                               <div className="w-14 h-14 bg-zinc-800 rounded-2xl flex items-center justify-center text-emerald-500 font-black border border-zinc-700 shadow-inner group-hover:scale-110 transition-transform">
                                  TÚ
                               </div>
                               <span className="text-[9px] font-black text-zinc-500 uppercase group-hover:text-emerald-500">Espectador</span>
                            </div>
                            
                            {participants.filter(p => p.id !== myId).map(p => (
                               <div key={p.id} className="aspect-square bg-zinc-900 border border-zinc-800 rounded-3xl flex flex-col items-center justify-center gap-2 shadow-lg shadow-black/40 animate-in fade-in zoom-in-75">
                                  <div className="w-12 h-12 bg-zinc-800 rounded-2xl flex items-center justify-center text-zinc-500 font-black border border-zinc-700 opacity-50">
                                     {p.name?.charAt(0) || "U"}
                                  </div>
                                  <span className="text-[8px] font-black text-zinc-600 uppercase truncate px-2 w-full text-center">{p.name || "Usuario"}</span>
                               </div>
                            ))}
                         </div>
                      </div>
                   )}
                </div>
              )}
            </motion.div>
          )}
      </main>

      {/* Footer */}
      <footer className="p-12 text-center text-zinc-600 text-sm">
        <p>© nextappcode • Todos los derechos reservados</p>
      </footer>
    </div>
  );
}
