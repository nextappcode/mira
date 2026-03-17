import React, { useState, useEffect, useRef } from "react";
import { Monitor, Tv, Share2, Play, StopCircle, Copy, Check, Info, Maximize, Minimize, Volume2, VolumeX, UserPlus, X, ShieldCheck, Pause, EyeOff, Eye, Users } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const STUN_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
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
    // Aggressively suppress expected Vite HMR errors in this environment
    const isHmrError = (msg: string) => 
      msg.includes("WebSocket closed without opened") || 
      msg.includes("failed to connect to websocket") ||
      msg.includes("Browsing Topics API");

    const handleRejection = (event: PromiseRejectionEvent) => {
      const msg = event.reason?.message || String(event.reason);
      if (isHmrError(msg)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    // Also override console.error for these specific strings
    const originalError = console.error;
    console.error = (...args) => {
      const msg = args.map(String).join(" ");
      if (isHmrError(msg)) return;
      originalError.apply(console, args);
    };

    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("unhandledrejection", handleRejection);
      console.error = originalError;
    };
  }, []);

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
              setStatus("Transmisión finalizada por el emisor");
              if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
              setHasAudio(false);
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
      if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed" || pc.iceConnectionState === "closed") {
        if (mode === "watch") {
          setStatus("Conexión perdida");
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
          setHasAudio(false);
         }
         peerConnections.current.delete(targetId);
         setParticipants(prev => prev.filter(p => p.id !== targetId));
       }
     };

    pc.ontrack = (event) => {
      console.log("¡Pista de vídeo recibida! Mostrando en pantalla...");
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
        
        // Auto-play forces
        remoteVideoRef.current.play().catch(e => console.warn("Autoplay block", e));
        
        // Auto-fullscreen logic
        if (mode === "watch" && !document.fullscreenElement && videoContainerRef.current) {
          videoContainerRef.current.requestFullscreen().catch(err => {
            console.warn("No se pudo activar pantalla completa automáticamente:", err.message);
          });
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
      const joinSent = safeSend({ type: "join", room: roomId });
      if (!joinSent) {
        throw new Error("No se pudo enviar mensaje de unión. Revisa la conexión.");
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { 
          cursor: "always",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 }
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

        if (audioTrack) pc.addTrack(audioTrack, streamRef.current);
        
        // Add video with simulcast encodings
        pc.addTransceiver(videoTrack, {
          streams: [streamRef.current],
          sendEncodings: [
            { rid: "high", maxBitrate: 2500000, maxFramerate: 30 }, // 1080p
            { rid: "mid", maxBitrate: 1000000, scaleResolutionDownBy: 2.0, maxFramerate: 30 }, // 540p
            { rid: "low", maxBitrate: 300000, scaleResolutionDownBy: 4.0, maxFramerate: 15 } // 270p
          ]
        });

        const offer = await pc.createOffer();
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
    
    if (safeSend({ type: "join", room: roomId })) {
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

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="p-6 border-b border-zinc-800/50 backdrop-blur-md sticky top-0 z-50 flex justify-between items-center">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setMode("home")}>
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Share2 className="text-zinc-950 w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">mira</h1>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-zinc-500 bg-zinc-900/50 px-3 py-1.5 rounded-full border border-zinc-800">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
          {isConnected ? 'SISTEMA ONLINE' : 'CONECTANDO...'}
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6 md:p-12">
        <AnimatePresence mode="wait">
          {mode === "home" && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid md:grid-cols-2 gap-8 mt-12"
            >
              <button
                onClick={() => { setMode("share"); generateRoomId(); }}
                className="group relative bg-zinc-900 border border-zinc-800 p-8 rounded-3xl hover:border-emerald-500/50 transition-all duration-500 text-left overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Monitor size={120} />
                </div>
                <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Monitor className="text-emerald-500 w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold mb-3">Compartir Pantalla</h2>
                <p className="text-zinc-400 leading-relaxed">
                  Envía tu pantalla a otro dispositivo. Genera un código y compártelo con el receptor.
                </p>
                <div className="mt-8 flex items-center gap-2 text-emerald-500 font-semibold">
                  Empezar ahora <Play size={16} />
                </div>
              </button>

              <button
                onClick={() => setMode("watch")}
                className="group relative bg-zinc-900 border border-zinc-800 p-8 rounded-3xl hover:border-emerald-500/50 transition-all duration-500 text-left overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Tv size={120} />
                </div>
                <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Tv className="text-emerald-500 w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold mb-3">Ver Transmisión</h2>
                <p className="text-zinc-400 leading-relaxed">
                  Recibe la pantalla de otro dispositivo. Ingresa el código de sala para conectar.
                </p>
                <div className="mt-8 flex items-center gap-2 text-emerald-500 font-semibold">
                  Unirse a sala <Play size={16} />
                </div>
              </button>
            </motion.div>
          )}

          {mode === "share" && (
            <motion.div
              key="share"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-8"
            >
              <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-3xl">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                  <div>
                    <h2 className="text-2xl font-bold mb-1">Panel de Emisión</h2>
                    <p className="text-zinc-500 text-sm">Configura tu sala y empieza a compartir.</p>
                  </div>
                  <div className="flex items-center gap-3 bg-zinc-950 p-2 rounded-2xl border border-zinc-800">
                    <div className="px-4 py-2 font-mono text-xl font-bold text-emerald-500 tracking-widest">
                      {roomId || "------"}
                    </div>
                    <button 
                      onClick={copyRoomId}
                      className="p-3 hover:bg-zinc-800 rounded-xl transition-colors text-zinc-400 hover:text-white"
                      title="Copiar código"
                    >
                      {copied ? <Check size={20} className="text-emerald-500" /> : <Copy size={20} />}
                    </button>
                  </div>
                </div>

                <div className="aspect-video bg-zinc-950 rounded-2xl border border-zinc-800 overflow-hidden relative group">
                  <video 
                    ref={localVideoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    className={`w-full h-full object-contain transition-all duration-700 ${isPaused ? 'blur-2xl opacity-50 scale-105' : ''}`}
                  />
                  {isPaused && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="bg-amber-500/20 backdrop-blur-md px-6 py-3 rounded-2xl border border-amber-500/30 flex items-center gap-3">
                        <EyeOff className="text-amber-500" />
                        <span className="text-amber-500 font-bold uppercase tracking-wider text-sm">Transmisión Oculta</span>
                      </div>
                    </div>
                  )}
                  {!isSharing && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-600">
                      <Monitor size={48} className="mb-4 opacity-20" />
                      <p className="text-sm font-medium">Vista previa de pantalla</p>
                    </div>
                  )}
                  <div className="absolute bottom-4 left-4 right-4 flex justify-between items-center">
                    <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${isSharing ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-600'}`} />
                      {status}
                    </div>
                  </div>
                </div>

                <div className="mt-8 flex flex-wrap gap-4">
                  {!isSharing ? (
                    <button
                      onClick={startSharing}
                      className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold py-4 px-8 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
                    >
                      <Share2 size={20} /> Compartir Pantalla
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={togglePause}
                        className={`flex-1 ${isPaused ? 'bg-amber-500 hover:bg-amber-400' : 'bg-zinc-800 hover:bg-zinc-700'} text-white font-bold py-4 px-8 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg ${isPaused ? 'shadow-amber-500/20' : ''}`}
                      >
                        {isPaused ? <Eye size={20} /> : <EyeOff size={20} />}
                        {isPaused ? "Reanudar" : "Pausar Vista"}
                      </button>
                      <button
                        onClick={stopSharing}
                        className="flex-1 bg-red-500 hover:bg-red-400 text-white font-bold py-4 px-8 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-500/20"
                      >
                        <StopCircle size={20} /> Detener Transmisión
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => { stopSharing(); setMode("home"); }}
                    className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-4 px-8 rounded-2xl transition-all"
                  >
                    Volver
                  </button>
                </div>

                {/* Pending Requests for Broadcaster */}
                {isSharing && pendingRequests.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-6 space-y-3 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl ring-2 ring-emerald-500/20"
                  >
                    <h3 className="text-xs font-bold text-emerald-500 uppercase tracking-wider flex items-center gap-2">
                      <UserPlus size={14} /> ¡Nueva solicitud de acceso! ({pendingRequests.length})
                    </h3>
                    <div className="grid gap-2">
                      {pendingRequests.map(req => (
                        <div key={req.id} className="bg-zinc-950 border border-zinc-800 p-4 rounded-2xl flex items-center justify-between shadow-xl">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center text-zinc-950 font-bold">
                              {req.name.charAt(0)}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-bold">{req.name}</span>
                              <span className="text-[10px] text-zinc-500 font-mono">ID: {req.id.substring(0, 8)}</span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button 
                              onClick={() => approveAccess(req.id)}
                              className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-6 py-2 rounded-xl text-xs font-bold transition-all hover:scale-105 active:scale-95 shadow-lg shadow-emerald-500/20"
                            >
                              Aprobar
                            </button>
                            <button 
                              onClick={() => denyAccess(req.id)}
                              className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors"
                            >
                              Denegar
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* Active Participants & Monitor */}
                {isSharing && participants.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-8 grid md:grid-cols-3 gap-6"
                  >
                    <div className="md:col-span-1 bg-zinc-950/50 border border-zinc-800 p-6 rounded-3xl">
                      <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <Users size={14} /> Participantes ({participants.length})
                      </h3>
                      <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                        {participants.map(p => (
                          <div key={p.id} className="flex items-center gap-3 bg-zinc-900/50 p-2 rounded-xl border border-zinc-800/50">
                            <div className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center text-[10px] font-bold text-emerald-500">
                              {p.name.charAt(0)}
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className="text-sm font-medium truncate">{p.name}</span>
                                <span className="text-[9px] text-zinc-600 font-mono uppercase">En línea</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="md:col-span-2 bg-zinc-950/50 border border-zinc-800 p-4 rounded-3xl overflow-hidden shadow-inner">
                       <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <Monitor size={14} /> Monitor de Salida (Lo que ven)
                      </h3>
                      <div className="aspect-video bg-black rounded-xl border border-zinc-800/50 overflow-hidden relative shadow-2xl">
                         <video 
                            autoPlay 
                            playsInline 
                            muted 
                            className={`w-full h-full object-contain ${isPaused ? 'blur-md grayscale opacity-50' : ''}`}
                            ref={(el) => {
                                if (el && streamRef.current) el.srcObject = streamRef.current;
                            }}
                          />
                          <div className="absolute top-2 right-2 bg-emerald-500/20 backdrop-blur-md px-2 py-1 rounded text-[10px] font-bold text-emerald-500 border border-emerald-500/30">
                            LIVE
                          </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>

              <div className="bg-emerald-500/5 border border-emerald-500/10 p-6 rounded-2xl flex gap-4 items-start">
                <Info className="text-emerald-500 shrink-0 mt-1" size={20} />
                <div className="text-sm text-zinc-400 leading-relaxed">
                  <p className="font-semibold text-zinc-200 mb-1">¿Cómo funciona?</p>
                  Comparte el código de sala con la persona que usará el televisor o dispositivo receptor. Una vez que ambos estén en la misma sala, la conexión se establecerá automáticamente.
                </div>
              </div>
            </motion.div>
          )}

          {mode === "watch" && (
            <motion.div
              key="watch"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-8"
            >
              <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-3xl">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                  <div>
                    <h2 className="text-2xl font-bold mb-1">Receptor de Pantalla</h2>
                    <p className="text-zinc-500 text-sm">Ingresa el código para ver la transmisión.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      value={roomId}
                      onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                      placeholder="CÓDIGO"
                      disabled={accessStatus === "requesting"}
                      className="bg-zinc-950 border border-zinc-800 px-6 py-3 rounded-2xl font-mono text-xl font-bold text-emerald-500 focus:outline-none focus:border-emerald-500 transition-colors w-40 text-center tracking-widest disabled:opacity-50"
                    />
                    {accessStatus === "idle" || accessStatus === "denied" ? (
                      <button
                        onClick={requestAccess}
                        className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold py-3.5 px-6 rounded-2xl transition-all flex items-center gap-2"
                      >
                        Unirse
                      </button>
                    ) : accessStatus === "requesting" ? (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-3 bg-zinc-800 px-6 py-3.5 rounded-2xl text-zinc-400 animate-pulse">
                          <ShieldCheck size={20} /> Solicitando...
                        </div>
                        <button 
                          onClick={requestAccess}
                          className="text-[10px] text-emerald-500 hover:underline font-bold text-center"
                        >
                          ¿No aparece el botón? Re-enviar solicitud
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 bg-emerald-500/20 text-emerald-500 px-6 py-3.5 rounded-2xl font-bold border border-emerald-500/30">
                        <ShieldCheck size={20} /> Acceso Permitido
                      </div>
                    )}
                  </div>
                </div>

                <div 
                  ref={videoContainerRef}
                  className={`relative group shadow-2xl overflow-hidden bg-black ${isFullscreen ? 'w-screen h-screen' : 'aspect-video rounded-2xl border border-zinc-800'}`}
                >
                  <video 
                    ref={remoteVideoRef} 
                    autoPlay 
                    playsInline 
                    muted={isMuted}
                    className={`w-full h-full object-contain bg-zinc-950 transition-all duration-1000 ${isPaused ? 'blur-3xl scale-110 grayscale opacity-30 origin-center' : ''}`}
                  />
                  
                  <AnimatePresence>
                    {isPaused && (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center p-8 bg-zinc-950/40 backdrop-blur-sm"
                      >
                        <motion.div 
                          initial={{ scale: 0.8 }}
                          animate={{ scale: 1 }}
                          className="w-24 h-24 bg-amber-500/20 rounded-full flex items-center justify-center mb-8 border border-amber-500/30"
                        >
                          <Pause className="text-amber-500 w-12 h-12 animate-pulse" />
                        </motion.div>
                        <h3 className="text-3xl font-black text-white mb-4 tracking-tight">Transmisión en espera</h3>
                        <p className="text-zinc-300 max-w-sm leading-relaxed text-lg">
                          El emisor ha pausado la vista momentáneamente. No te desconectes, la señal regresará pronto.
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  
                  {/* Controls Overlay */}
                  <div className={`absolute inset-0 flex flex-col justify-between p-4 transition-opacity duration-300 ${isFullscreen ? 'opacity-0 hover:opacity-100' : 'opacity-100'}`}>
                      <div className="flex justify-between items-start">
                        <div className="flex flex-col gap-2">
                          <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${status.includes("Conectado") ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-600'}`} />
                            {status}
                          </div>
                          {hasAudio && (
                            <div className="bg-emerald-500/20 backdrop-blur-md px-3 py-1.5 rounded-lg text-[10px] font-bold text-emerald-500 flex items-center gap-1.5 border border-emerald-500/30">
                              <Volume2 size={12} /> AUDIO DISPONIBLE
                            </div>
                          )}
                        </div>
                        
                        <div className="flex gap-2">
                          {hasAudio && (
                            <button
                              onClick={() => setIsMuted(!isMuted)}
                              className="bg-black/60 backdrop-blur-md p-2 rounded-lg text-white hover:bg-emerald-500 transition-colors"
                              title={isMuted ? "Activar sonido" : "Silenciar"}
                            >
                              {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                            </button>
                          )}
                          <button
                            onClick={toggleFullscreen}
                            className="bg-black/60 backdrop-blur-md p-2 rounded-lg text-white hover:bg-emerald-500 transition-colors"
                            title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
                          >
                            {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                          </button>
                        </div>
                      </div>

                    {!status.includes("Conectado") && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-600 pointer-events-none bg-zinc-950/80 backdrop-blur-sm">
                        <Tv size={48} className="mb-4 opacity-20" />
                        <p className="text-sm font-medium px-6 text-center">
                          {status === "Transmisión finalizada por el emisor" || status === "Conexión perdida" 
                            ? status 
                            : "Esperando transmisión..."}
                        </p>
                        {(status === "Transmisión finalizada por el emisor" || status === "Conexión perdida") && (
                          <button 
                            onClick={() => setMode("home")}
                            className="mt-6 pointer-events-auto bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-2 rounded-xl text-xs font-bold transition-all"
                          >
                            Volver al inicio
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Floating Re-enable Fullscreen button (only if not in fullscreen and connected) */}
                  {!isFullscreen && status.includes("Conectado") && (
                    <button
                      onClick={toggleFullscreen}
                      className="absolute bottom-4 right-4 bg-emerald-500 text-zinc-950 p-3 rounded-full shadow-lg animate-bounce"
                      title="Poner en pantalla completa"
                    >
                      <Maximize size={24} />
                    </button>
                  )}
                </div>

                <div className="mt-8">
                  <button
                    onClick={() => { stopSharing(); setMode("home"); }}
                    className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-4 px-8 rounded-2xl transition-all"
                  >
                    Volver al Inicio
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="p-12 text-center text-zinc-600 text-sm">
        <p>© nextappcode • Todos los derechos reservados</p>
      </footer>
    </div>
  );
}
