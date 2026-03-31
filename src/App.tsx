import React, { useState, useEffect, useRef, useCallback } from "react";
import { AnimatePresence } from "motion/react";
import { Header } from "./components/common/Header";
import { ModeSelection } from "./components/home/ModeSelection";
import { SharingPage } from "./components/share/SharingPage";
import { WatchingPage } from "./components/watch/WatchingPage";
import { useSignal } from "./hooks/useSignal";
import { useWebRTC } from "./hooks/useWebRTC";
import { Mode, AccessStatus, PendingRequest, Participant, SignalMessage } from "./types";

export default function App() {
  // --- UI State ---
  const [mode, setMode] = useState<Mode>("home");
  const [roomId, setRoomId] = useState("");
  const [isSharing, setIsSharing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [accessStatus, setAccessStatus] = useState<AccessStatus>("idle");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [hasAudio, setHasAudio] = useState(false);
  const [hasValidFrames, setHasValidFrames] = useState(false);
  
  // --- Refs & Hooks ---
  const isPausedRef = useRef(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);

  const { isConnected, status, setStatus, myId, setMyId, socketRef, safeSend } = useSignal();
  const { 
    peerConnections, iceCandidateQueue, streamRef, participants, setParticipants,
    createPeerConnection, startLocalStream, stopAll, sendSignal, isSharingRef 
  } = useWebRTC(safeSend);

  // --- Signaling Logic ---
  useEffect(() => {
    if (!socketRef.current) return;

    const handleMessage = async (event: MessageEvent) => {
      try {
        const message: SignalMessage = JSON.parse(event.data);
        
        switch (message.type) {
          case "your-id":
            if (message.id) setMyId(message.id);
            break;
            
          case "signal":
            if (message.data && message.sender) {
              await handleSignal(message.data, message.sender);
            }
            break;
            
          case "leave":
            handleUserLeave(message.userId);
            break;
            
          case "request-access":
            if (message.userId && message.userName) {
              handleAccessRequest(message.userId, message.userName);
            }
            break;
            
          case "access-response":
            handleAccessResponse(message.granted, message.broadcasterId);
            break;
            
          case "user-joined":
            if (isSharingRef.current && message.userId) {
              setPendingRequests(prev => [...prev.filter(r => r.id !== message.userId), { id: message.userId!, name: "Usuario esperando..." }]);
              setStatus("Un usuario solicita acceso");
              safeSend({ type: "pause-state", room: roomId, paused: isPausedRef.current });
            }
            break;
            
          case "pause-state":
            setIsPaused(!!message.paused);
            isPausedRef.current = !!message.paused;
            break;
            
          case "request-offer":
            if (isSharingRef.current && streamRef.current && message.userId) {
               renegotiate(message.userId);
            }
            break;
            
          case "check-room-response":
            if (message.exists) {
              performRequestJoin();
            } else {
              setAccessStatus("idle");
              setStatus("Sala no encontrada");
              alert("La sala '" + roomId + "' no existe. Por favor verifica el código.");
              setMode("home");
            }
            break;
        }
      } catch (err) { /* ignore */ }
    };

    socketRef.current.addEventListener("message", handleMessage);
    return () => socketRef.current?.removeEventListener("message", handleMessage);
  }, [socketRef.current, roomId, isSharingRef, safeSend, myId]);

  // --- Signaling Handlers ---
  const handleSignal = async (data: any, senderId: string) => {
    let pc = peerConnections.current.get(senderId);
    if (!pc && (data.type === "offer" || data.type === "candidate")) {
      pc = setupPeerConnection(senderId);
    }
    if (!pc) return;

    try {
      if (data.type === "offer") {
        await pc.setRemoteDescription(new RTCSessionDescription(data));
        applyQueuedIceCandidates(pc, senderId);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal(answer, roomId, senderId);
        setStatus("Conectado (Recibiendo)");
      } else if (data.type === "answer") {
        await pc.setRemoteDescription(new RTCSessionDescription(data));
        applyQueuedIceCandidates(pc, senderId);
        setStatus("Conectado (Transmitiendo)");
      } else if (data.type === "candidate") {
        if (!pc.remoteDescription) {
          const prev = iceCandidateQueue.current.get(senderId) || [];
          prev.push(data.candidate);
          iceCandidateQueue.current.set(senderId, prev);
          return;
        }
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    } catch (err) { console.error("Signal error:", err); }
  };

  const applyQueuedIceCandidates = async (pc: RTCPeerConnection, senderId: string) => {
    const queued = iceCandidateQueue.current.get(senderId) || [];
    for (const candidate of queued) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
    }
    iceCandidateQueue.current.delete(senderId);
  };

  const handleUserLeave = (userId?: string) => {
    if (userId) {
      const pc = peerConnections.current.get(userId);
      pc?.close();
      peerConnections.current.delete(userId);
      setParticipants(prev => prev.filter(p => p.id !== userId));
    } else {
      setStatus("Transmisión finalizada");
      setRemoteStream(null);
      setHasAudio(false);
    }
  };

  const handleAccessRequest = (userId: string, userName: string) => {
    setPendingRequests(prev => [...prev.filter(r => r.id !== userId), { id: userId, name: userName }]);
  };

  const handleAccessResponse = (granted?: boolean, broadcasterId?: string) => {
    if (granted && broadcasterId) {
      setAccessStatus("granted");
      setStatus("Acceso concedido");
      setupPeerConnection(broadcasterId);
      // Auto-fullscreen on connection
      setTimeout(() => {
        if (videoContainerRef.current) {
          videoContainerRef.current.requestFullscreen().catch(() => {});
        }
      }, 1000);
    } else {
      setAccessStatus("denied");
      setStatus("Acceso denegado");
    }
  };

  // --- RTC Helpers ---
  const setupPeerConnection = (targetId: string) => {
    const pc = createPeerConnection(targetId, roomId);
    
    // Set up receiving end
    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        const stream = event.streams[0];
        setRemoteStream(stream);
        setHasAudio(stream.getAudioTracks().length > 0);
      } else if (event.track) {
        // Fallback for older browsers or simple tracks
        setRemoteStream(prev => {
          if (prev) {
             if (!prev.getTracks().find(t => t.id === event.track.id)) {
               prev.addTrack(event.track);
             }
             return prev;
          }
          const s = new MediaStream([event.track]);
          setHasAudio(s.getAudioTracks().length > 0);
          return s;
        });
      }
    };
    
    // Legacy support
    (pc as any).onaddstream = (event: any) => {
      if (event.stream) {
        setRemoteStream(event.stream);
        setHasAudio(event.stream.getAudioTracks().length > 0);
      }
    };

    return pc;
  };

  const renegotiate = async (userId: string) => {
    const pc = setupPeerConnection(userId);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => pc.addTrack(track, streamRef.current!));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal(offer, roomId, userId, true);
    }
  };

  // --- Actions ---
  const startSharing = async () => {
    if (!roomId) return alert("Ingresa ID de sala");
    const stream = await startLocalStream();
    safeSend({ type: "join", room: roomId });
    setIsSharing(true);
    setStatus("Sala abierta");
  };

  const stopSharing = () => {
    safeSend({ type: "leave", room: roomId });
    stopAll();
    setIsSharing(false);
    setIsPaused(false);
    setHasValidFrames(false);
    setRemoteStream(null);
    setStatus("Compartición finalizada");
  };

  const approveAccess = async (userId: string) => {
    const request = pendingRequests.find(r => r.id === userId);
    setPendingRequests(prev => prev.filter(req => req.id !== userId));
    if (request) setParticipants(prev => [...prev.filter(p => p.id !== userId), request]);
    
    safeSend({ type: "access-response", targetId: userId, granted: true });
    const pc = setupPeerConnection(userId);
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        const sender = pc.addTrack(track, streamRef.current!);
        // Force H264 for TVs
        if (track.kind === 'video' && pc.getTransceivers) {
          try {
            const h264Codecs = RTCRtpReceiver.getCapabilities('video')?.codecs.filter(c => c.mimeType.toLowerCase() === 'video/h264') || [];
            const otherCodecs = RTCRtpReceiver.getCapabilities('video')?.codecs.filter(c => c.mimeType.toLowerCase() !== 'video/h264') || [];
            pc.getTransceivers().find(t => t.sender === sender)?.setCodecPreferences([...h264Codecs, ...otherCodecs]);
          } catch(e) {}
        }
      });
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal(offer, roomId, userId);
    }
  };

  const denyAccess = (userId: string) => {
    setPendingRequests(prev => prev.filter(req => req.id !== userId));
    safeSend({ type: "access-response", targetId: userId, granted: false });
  };

  const performRequestJoin = () => {
    setAccessStatus("requesting");
    if (safeSend({ type: "join", room: roomId })) {
      safeSend({ type: "request-access", room: roomId, userName: "Usuario TV" });
      setStatus("Solicitando acceso...");
    } else {
      setStatus("Error de conexión");
      setAccessStatus("idle");
    }
  };

  const requestJoin = () => {
    if (!roomId) return alert("Ingresa ID de sala");
    setAccessStatus("requesting");
    setStatus("Verificando sala...");
    safeSend({ type: "check-room", room: roomId });
  };

  const togglePause = () => {
    const next = !isPaused;
    setIsPaused(next);
    isPausedRef.current = next;
    safeSend({ type: "pause-state", room: roomId, paused: next });
  };

  const changeScreen = async () => {
    const newStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = newStream;
    
    const vTrack = newStream.getVideoTracks()[0];
    const aTrack = newStream.getAudioTracks()[0];
    
    peerConnections.current.forEach(pc => {
      const senders = pc.getSenders();
      const vs = senders.find(s => s.track?.kind === "video");
      if (vs && vTrack) vs.replaceTrack(vTrack);
      const as = senders.find(s => s.track?.kind === "audio");
      if (as && aTrack) as.replaceTrack(aTrack);
    });
  };

  // --- Fullscreen & UI ---
  const toggleFullscreen = () => {
    const el = videoContainerRef.current as any;
    if (!el) return;
    
    const fallbackToPseudo = () => {
       el.classList.add('pseudo-fullscreen-fallback');
    };

    try {
      if (!document.fullscreenElement && !(document as any).webkitFullscreenElement && !(document as any).mozFullScreenElement) {
        if (el.requestFullscreen) {
          el.requestFullscreen().catch(() => fallbackToPseudo());
        } else if (el.webkitRequestFullscreen) {
          el.webkitRequestFullscreen();
          setTimeout(() => { if (!(document as any).webkitFullscreenElement) fallbackToPseudo(); }, 200);
        } else if (el.mozRequestFullScreen) {
          el.mozRequestFullScreen();
          setTimeout(() => { if (!(document as any).mozFullScreenElement) fallbackToPseudo(); }, 200);
        } else {
           fallbackToPseudo();
        }
      } else {
        // Salir Pantalla Completa...
        el.classList.remove('pseudo-fullscreen-fallback');
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(()=>{});
        } else if ((document as any).webkitExitFullscreen) {
          (document as any).webkitExitFullscreen();
        } else if ((document as any).mozCancelFullScreen) {
          (document as any).mozCancelFullScreen();
        }
      }
    } catch (e) {
      console.warn("Fullscreen API fully blocked, using CSS fallback", e);
      fallbackToPseudo();
    }
  };

  useEffect(() => {
    const cb = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", cb);
    return () => document.removeEventListener("fullscreenchange", cb);
  }, []);

  // --- Auto Fullscreen on Connect ---
  useEffect(() => {
    if (mode === "watch" && accessStatus === "granted" && hasValidFrames && !isFullscreen) {
      const timer = setTimeout(() => {
        toggleFullscreen();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [mode, accessStatus, hasValidFrames, isFullscreen]);

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-main)] font-sans selection:bg-[var(--p-500)]/30 overflow-x-hidden flex flex-col items-center">
      <div className="w-full">
        <Header 
          isConnected={isConnected} 
          onHomeClick={() => { 
             if (mode !== "home") {
               if (confirm('¿Quieres salir? Se detendrá la sesión.')) {
                 if (mode === 'share') stopSharing();
                 setMode("home");
               }
             } else {
               setMode("home");
             }
          }}
          roomId={mode !== "home" ? roomId : undefined}
          status={mode !== "home" ? status : undefined}
          isLive={mode === 'share' ? isSharing : (mode === 'watch' && status.includes('Conectado'))}
        />
      </div>

      <main className="w-full max-w-6xl p-4 md:p-8 flex-1 flex flex-col items-center justify-center">
        <div className="w-full">
          <AnimatePresence mode="wait">
          {mode === "home" && (
            <ModeSelection 
              roomId={roomId}
              setRoomId={setRoomId}
              onShare={() => { 
                const newId = Math.random().toString(36).substring(2, 7).toUpperCase();
                setRoomId(newId);
                setMode("share");
              }} 
              onWatch={() => {
                setMode("watch");
                if (roomId.length === 5) {
                   // Minimal delay to ensure transition is smooth but gesture is kept
                   setTimeout(() => {
                     requestJoin();
                   }, 50);
                }
              }} 
            />
          )}

          {mode === "share" && (
            <SharingPage 
              roomId={roomId}
              isSharing={isSharing}
              status={status}
              isPaused={isPaused}
              localVideoRef={localVideoRef}
              stream={streamRef.current}
              pendingRequests={pendingRequests}
              participants={participants}
              onStartSharing={startSharing}
              onStopSharing={stopSharing}
              onTogglePause={togglePause}
              onChangeScreen={changeScreen}
              onApprove={approveAccess}
              onDeny={denyAccess}
              onBack={() => { stopSharing(); setMode("home"); }}
            />
          )}

          {mode === "watch" && (
            <WatchingPage 
              roomId={roomId}
              setRoomId={setRoomId}
              accessStatus={accessStatus}
              status={status}
              remoteStream={remoteStream}
              isPaused={isPaused}
              isMuted={isMuted}
              isFullscreen={isFullscreen}
              hasValidFrames={hasValidFrames}
              hasAudio={hasAudio}
              videoContainerRef={videoContainerRef}
              onJoin={requestJoin}
              onToggleFullscreen={toggleFullscreen}
              onToggleMute={() => setIsMuted(!isMuted)}
              onLeave={() => { stopSharing(); setMode("home"); }}
              onFramesVerified={() => setHasValidFrames(true)}
              onManualPlay={() => {
                const videoEl = document.querySelector('video');
                if (videoEl) videoEl.play().catch(()=>{});
                toggleFullscreen();
              }}
            />
          )}
        </AnimatePresence>
        </div>
      </main>

      <footer className="w-full p-8 text-center text-[var(--text-subtle)] text-[var(--text-xs)] font-medium">
        <p>© nextappcode • todos los derechos reservados</p>
      </footer>
</div>
  );
}
