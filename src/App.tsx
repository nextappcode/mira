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
  } = useWebRTC(safeSend, (targetId) => {
    // If the connection drops unexpectedly and we are watching
    if (mode === "watch") {
      setStatus("Conexión perdida");
      setRemoteStream(null);
      setHasAudio(false);
    }
  });

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
    setRoomId("");
    setAccessStatus("idle");
    setStatus("Sesión finalizada");
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

  // ╔══════════════════════════════════════════════════════════════════════════╗
  // ║  🔒 LOCKED — BROWSER FULLSCREEN (PART 1/2)                             ║
  // ║  This block handles native browser fullscreen for Smart TVs and         ║
  // ║  older browsers. It MUST be called synchronously inside a user-gesture  ║
  // ║  handler (button click). DO NOT move it to a useEffect or setTimeout,  ║
  // ║  or browsers will silently reject the request.                          ║
  // ║                                                                          ║
  // ║  Cascade order:                                                          ║
  // ║    1. document.documentElement (hides browser chrome / URL bar)         ║
  // ║    2. document.body (fallback)                                           ║
  // ║    3. videoContainerRef (fallback)                                       ║
  // ║    4. <video> element via webkitEnterFullscreen (old WebKit/TV)          ║
  // ║    5. CSS pseudo-fullscreen (last resort)                                ║
  // ║                                                                          ║
  // ║  DO NOT modify without re-testing on Smart TV browsers.                 ║
  // ╚══════════════════════════════════════════════════════════════════════════╝
  // Ref to remember that we already fired the native fullscreen call
  // during a user-gesture so we don't try again from a useEffect.
  const nativeFsRequested = useRef(false);

  const requestNativeFullscreenNow = (force = false) => {
    if (!force && nativeFsRequested.current) return;
    nativeFsRequested.current = true;
    
    const target = document.documentElement as any;
    
    const tryEl = (el: any): Promise<void> => {
      if (!el) return Promise.reject(new Error('no element'));
      try {
        let p;
        if (el.requestFullscreen)              p = el.requestFullscreen();
        else if (el.webkitRequestFullscreen)   p = el.webkitRequestFullscreen();
        else if (el.webkitRequestFullScreen)   p = el.webkitRequestFullScreen();
        else if (el.mozRequestFullScreen)      p = el.mozRequestFullScreen();
        else if (el.msRequestFullscreen)       p = el.msRequestFullscreen();
        else if (el.webkitEnterFullscreen)     p = el.webkitEnterFullscreen(); // Specific to video element on older webkit
        else return Promise.reject(new Error('No Fullscreen API'));
        
        // Some older TVs return undefined instead of a Promise
        return p instanceof Promise ? p : Promise.resolve();
      } catch (err) {
        return Promise.reject(err);
      }
    };

    const container = videoContainerRef.current as any;
    const videoEl = container ? container.querySelector('video') : document.querySelector('video');

    tryEl(target)
      .catch(() => tryEl(document.body))
      .catch(() => tryEl(container))
      .catch(() => tryEl(videoEl))
      .then(() => {
        // Force state=true because many older TV browsers enter fullscreen
        // but completely fail to fire the 'fullscreenchange' event!
        setIsFullscreen(true);
      })
      .catch(() => {
        // Native API fully blocked → CSS pseudo-fullscreen
        if (container) container.classList.add('pseudo-fullscreen-fallback');
        document.body.classList.add('pseudo-fullscreen-active');
        setIsFullscreen(true);
      });
  };
  // ── END OF LOCKED BLOCK (PART 1/2) ──────────────────────────────────────────

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
    // ← Fire fullscreen HERE, inside the user-gesture, so the browser allows it.
    requestNativeFullscreenNow();
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

  // ╔══════════════════════════════════════════════════════════════════════════╗
  // ║  🔒 LOCKED — BROWSER FULLSCREEN (PART 2/2)                             ║
  // ║  Cross-browser fullscreen helpers + event listeners.                    ║
  // ║  Covers: standard, webkit, moz, ms vendor prefixes.                     ║
  // ║  The enterFullscreen/exitFullscreen/toggleFullscreen functions are used  ║
  // ║  by the HUD button in WatchingPage to exit fullscreen manually.         ║
  // ║                                                                          ║
  // ║  DO NOT remove vendor prefixes. Old Smart TVs still need them.          ║
  // ╚══════════════════════════════════════════════════════════════════════════╝
  const getFullscreenElement = () =>
    document.fullscreenElement ||
    (document as any).webkitFullscreenElement ||
    (document as any).mozFullScreenElement ||
    (document as any).msFullscreenElement ||
    null;

  const requestFullscreenEl = (el: any) => {
    if (el.requestFullscreen)           return el.requestFullscreen();
    if (el.webkitRequestFullscreen)     return Promise.resolve(el.webkitRequestFullscreen());
    if (el.webkitRequestFullScreen)     return Promise.resolve(el.webkitRequestFullScreen());
    if (el.mozRequestFullScreen)        return Promise.resolve(el.mozRequestFullScreen());
    if (el.msRequestFullscreen)         return Promise.resolve(el.msRequestFullscreen());
    return Promise.reject(new Error('No Fullscreen API'));
  };

  const exitFullscreenDoc = () => {
    if (document.exitFullscreen)                    return document.exitFullscreen();
    if ((document as any).webkitExitFullscreen)     return Promise.resolve((document as any).webkitExitFullscreen());
    if ((document as any).webkitCancelFullScreen)   return Promise.resolve((document as any).webkitCancelFullScreen());
    if ((document as any).mozCancelFullScreen)      return Promise.resolve((document as any).mozCancelFullScreen());
    if ((document as any).msExitFullscreen)         return Promise.resolve((document as any).msExitFullscreen());
    return Promise.resolve();
  };

  const enterFullscreen = useCallback(() => {
    const target = document.documentElement as any;
    const container = videoContainerRef.current as any;
    const applyPseudoFallback = () => {
      if (container) container.classList.add('pseudo-fullscreen-fallback');
      document.body.classList.add('pseudo-fullscreen-active');
      setIsFullscreen(true);
    };
    requestFullscreenEl(target)
      .catch(() => {
        if (container) return requestFullscreenEl(container);
        throw new Error('no container');
      })
      .catch(applyPseudoFallback);
  }, [videoContainerRef]);

  const exitFullscreen = useCallback(() => {
    const container = videoContainerRef.current as any;
    if (container) container.classList.remove('pseudo-fullscreen-fallback');
    document.body.classList.remove('pseudo-fullscreen-active');
    setIsFullscreen(false);
    exitFullscreenDoc().catch(() => {});
  }, [videoContainerRef]);

  const toggleFullscreen = useCallback(() => {
    if (getFullscreenElement() ||
        (videoContainerRef.current as any)?.classList.contains('pseudo-fullscreen-fallback')) {
      exitFullscreen();
    } else {
      enterFullscreen();
    }
  }, [enterFullscreen, exitFullscreen, videoContainerRef]);

  // Listen to ALL vendor-prefixed fullscreen change events
  useEffect(() => {
    const onFsChange = () => {
      const inFs = !!getFullscreenElement();
      setIsFullscreen(inFs);
      if (!inFs && videoContainerRef.current) {
        (videoContainerRef.current as any).classList.remove('pseudo-fullscreen-fallback');
      }
    };
    document.addEventListener('fullscreenchange',       onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    document.addEventListener('mozfullscreenchange',    onFsChange);
    document.addEventListener('MSFullscreenChange',     onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange',       onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
      document.removeEventListener('mozfullscreenchange',    onFsChange);
      document.removeEventListener('MSFullscreenChange',     onFsChange);
    };
  }, [videoContainerRef]);

  // When leaving watch mode, reset the flag so the next session can fire fullscreen again.
  useEffect(() => {
    if (mode !== 'watch') {
      nativeFsRequested.current = false;
    }
  }, [mode]);
  // ── END OF LOCKED BLOCK (PART 2/2) ──────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-main)', color: 'var(--text-main)', fontFamily: 'var(--font-sans)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ width: '100%' }}>
        <Header 
          isConnected={isConnected} 
          onHomeClick={() => { 
             if (mode !== "home") {
               if (confirm('¿Quieres salir? Se detendrá la sesión.')) {
                 stopSharing();
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

      <main style={{ flex: 1, width: '100%', maxWidth: '1100px', margin: '0 auto', padding: '24px 16px' }}>
        <div style={{ width: '100%' }}>

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
                   // Call synchronously to preserve the user gesture for Fullscreen API
                   requestJoin();
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
                requestNativeFullscreenNow(true);
              }}
            />
          )}
        </div>
      </main>
    </div>
  );
}
