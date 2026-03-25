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

// Cross-browser WebRTC prefixes for older TVs
const RTCPeerConnection = (window as any).RTCPeerConnection || (window as any).webkitRTCPeerConnection || (window as any).mozRTCPeerConnection;
const RTCSessionDescription = (window as any).RTCSessionDescription || (window as any).webkitRTCSessionDescription || (window as any).mozRTCSessionDescription;
const RTCIceCandidate = (window as any).RTCIceCandidate || (window as any).webkitRTCIceCandidate || (window as any).mozRTCIceCandidate;

// Browser Compatibility Check
const hasWebRTC = typeof RTCPeerConnection !== "undefined";

// Detect legacy Android TVs/Browsers (e.g. Chrome < 60, Tizen, webOS older versions)
const isLegacyDevice = (() => {
  const ua = navigator.userAgent;
  const isAndroid = /Android/i.test(ua);
  const isTV = /TV|LargeScreen|SmartTV|Web0S|Tizen/i.test(ua);
  const chromeMatch = ua.match(/Chrome\/(\d+)/);
  const chromeVersion = chromeMatch ? parseInt(chromeMatch[1]) : 999;
  return isTV || (isAndroid && chromeVersion < 60) || chromeVersion < 50;
})();

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
  const [hasValidFrames, setHasValidFrames] = useState(false);
  const isPausedRef = useRef(false);
  
  const updatePauseState = (paused: boolean) => {
    setIsPaused(paused);
    isPausedRef.current = paused;
  };
  const [participants, setParticipants] = useState<{id: string, name: string}[]>([]);
  
  const isSharingRef = useRef(false);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  // Bufferizamos ICE candidates para evitar pérdidas por orden de mensajes
  // (muy común en dispositivos/implementaciones WebRTC antiguas).
  const iceCandidateQueue = useRef<Map<string, any[]>>(new Map());
  // Evita múltiples llamadas concurrentes a `play()` que en algunos TVs/Android
  // generan `AbortError: play() interrupted by a new load request`.
  const playInFlightRef = useRef(false);
  const playBackupTimerRef = useRef<number | null>(null);
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
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${protocol}//${window.location.host}/ws-signal`);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log("WebSocket connected successfully");
        setStatus("Conectado al servidor");
        setIsConnected(true);
      };

      socket.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data);
          
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
              remoteStreamRef.current = null;
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
              setPendingRequests(prev => {
                if (prev.find(r => r.id === message.userId)) return prev;
                return [...prev, { id: message.userId, name: "Usuario esperando..." }];
              });
              setStatus("Un usuario solicita acceso");
              // Sync current pause state with the new user using the Ref
              safeSend({ type: "pause-state", room: roomId, paused: isPausedRef.current });
            }
          } else if (message.type === "pause-state") {
            console.log("Recibido cambio de estado de pausa:", message.paused);
            setIsPaused(message.paused);
            isPausedRef.current = message.paused;
          } else if (message.type === "request-offer") {
            // A viewer explicitly asked for a re-negotiation (e.g., pressed 'Refresh Signal')
            if (isSharingRef.current && streamRef.current) {
               console.log("Renegociando conexión para el usuario:", message.userId);
               const pc = createPeerConnection(message.userId);
               streamRef.current.getTracks().forEach(track => {
                  if (streamRef.current) pc.addTrack(track, streamRef.current);
               });
               pc.createOffer().then(offer => {
                 pc.setLocalDescription(offer);
                 sendSignal(offer, message.userId, true);
               }).catch(e => console.error(e));
            }
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
    
    // Si llegan candidates antes de que exista la PC, créala para poder acumular.
    // Para `offer` también es válido (y antes era la única opción).
    if (!pc && (data.type === "offer" || data.type === "candidate")) {
      pc = createPeerConnection(senderId);
    }

    if (!pc) return;

    try {
      if (data.type === "offer") {
        await pc.setRemoteDescription(new RTCSessionDescription(data));
        // En caso de que hayan llegado candidates antes del SDP,
        // ahora que el remoteDescription existe, los podemos aplicar.
        const queued = iceCandidateQueue.current.get(senderId) || [];
        if (queued.length > 0) {
          for (const candidate of queued) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          }
          iceCandidateQueue.current.delete(senderId);
        }
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal(answer, senderId);
        setStatus("Conectado (Recibiendo)");
      } else if (data.type === "answer") {
        await pc.setRemoteDescription(new RTCSessionDescription(data));
        const queued = iceCandidateQueue.current.get(senderId) || [];
        if (queued.length > 0) {
          for (const candidate of queued) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          }
          iceCandidateQueue.current.delete(senderId);
        }
        setStatus("Conectado (Transmitiendo)");
      } else if (data.type === "candidate") {
        // Si el SDP remoto aún no está listo, bufferizamos para no romper la negociación.
        if (!pc.remoteDescription) {
          const prev = iceCandidateQueue.current.get(senderId) || [];
          prev.push(data.candidate);
          iceCandidateQueue.current.set(senderId, prev);
          return;
        }
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    } catch (err) {
      console.error("Error handling signal:", err);
    }
  };

  const sendSignal = (data: any, targetId?: string, isRenegotiation = false) => {
    safeSend({
      type: "signal",
      room: roomId,
      data: data,
      targetId: targetId,
      renegotiate: isRenegotiation
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

    const handleStream = (stream: MediaStream) => {
      remoteStreamRef.current = stream;
      const videoEl = remoteVideoRef.current;
      if (!videoEl || !stream) return;

      // STOPSHIP: Use a Ref to ensure we only assign the source ONCE for the entirety of the connection
      const existingStream = videoEl.srcObject as MediaStream | null;
      const existingVideoTrack = existingStream?.getVideoTracks?.()?.[0];
      const newVideoTrack = stream.getVideoTracks?.()?.[0];

      // Cuando los dispositivos/implementaciones antiguas disparan `onaddstream` y `ontrack`
      // casi a la vez, es frecuente que intentemos reasignar `srcObject` dos veces.
      // Eso puede causar `AbortError: play() interrupted by a new load request`.
      // Por eso, en esos casos saltamos reasignar srcObject, pero no el intento de play.
      let skipSrcObject = false;
      if (playInFlightRef.current) {
        skipSrcObject = true;
      }

      // Si el evento llega dos veces (por `onaddstream` y `ontrack`) puede venir un `stream.id` distinto
      // pero el track de video ser el mismo. En ese caso, evitamos reasignar srcObject.
      if (existingVideoTrack?.id && newVideoTrack?.id && existingVideoTrack.id === newVideoTrack.id) {
        console.debug("Video track ya asignado, bloqueando re-carga redundante.");
        skipSrcObject = true;
      }

      if ((videoEl as any).__lastStreamId === stream.id) {
        console.debug("Stream ya asignado (ID coincidente), bloqueando re-carga redundante.");
        skipSrcObject = true;
      }

      // Si ya hay una pista de video viva asignada, evitamos reasignar srcObject
      // (esto suele causar `AbortError: play() interrupted by a new load request`
      // en TVs/Android antiguos cuando llegan eventos duplicados).
      if (existingVideoTrack && existingVideoTrack.readyState && existingVideoTrack.readyState !== "ended") {
        // Si el video ya tiene buffers suficientes (readyState>=2), asumimos que ya está listo.
        // Si no tiene buffers (tv/ambiente lento), permitimos reasignar por compatibilidad.
        if (videoEl.readyState >= 2) {
          console.debug("srcObject ya tiene una pista viva y listo; omitiendo reasignación para evitar AbortError.");
          skipSrcObject = true;
        }
      }

      (videoEl as any).__lastStreamId = stream.id;
      (videoEl as any).__lastVideoTrackId = newVideoTrack?.id ?? null;

      console.log("¡Nueva señal de video recibida! ID:", stream.id, ". Vinculando...");
      // Diagnóstico: ayuda a confirmar si realmente trae video tracks
      try {
        console.log("Video tracks:", stream.getVideoTracks().map(t => ({ id: t.id, readyState: t.readyState })));
      } catch {
        // ignore
      }
      
      let assigned = false;

      // Compatibilidad: si existe `srcObject`, intentar siempre primero.
      // Tu detección "isAncient" puede marcar dispositivos como antiguos incorrectamente,
      // causando que se use el fallback que a veces no funciona para MediaStream.
      if (!skipSrcObject && "srcObject" in videoEl) {
        try {
          videoEl.srcObject = stream;
          assigned = true;
        } catch (e) {
          console.warn("Fallo al asignar srcObject, usando fallback...", e);
        }
      }
      
      if (!assigned && !skipSrcObject) {
         try {
            const vendorURL = window.URL || (window as any).webkitURL;
            if (vendorURL && vendorURL.createObjectURL) {
               console.log("Forzando fallback createObjectURL (Navegador antiguo detectado)");
               (videoEl as any).src = vendorURL.createObjectURL(stream as any);
               assigned = true;
            }
         } catch(err) {
            console.error("Error al crear URL del stream:", err);
         }
      }
      
      videoEl.muted = isMuted;

      const attemptPlay = () => {
        if (!videoEl) return;
        // Evita spamear si ya está reproduciendo y con datos listos.
        if (!videoEl.paused && videoEl.readyState >= 2) return;
        if (playInFlightRef.current) return;
        console.log("Intentando reproducir video...");
        try {
           playInFlightRef.current = true;
           const p = videoEl.play();
           if (p && typeof p.catch === 'function') {
              p.then(() => {
                playInFlightRef.current = false;
                console.log("play() OK",
                  { readyState: videoEl.readyState, w: videoEl.videoWidth, h: videoEl.videoHeight, t: videoEl.currentTime }
                );
              }).catch(e => {
                // Si se interrumpe por un nuevo load (reasignación casi simultánea),
                // simplemente esperamos al siguiente evento/backup.
                if (e?.name === 'AbortError') {
                  playInFlightRef.current = false;
                  console.log("play() AbortError",
                    { readyState: videoEl.readyState, w: videoEl.videoWidth, h: videoEl.videoHeight, t: videoEl.currentTime }
                  );
                  return;
                }
                playInFlightRef.current = false;
                // No reintentes agresivamente; mejor un backup controlado abajo.
                console.log("play() FAIL",
                  { name: e?.name, readyState: videoEl.readyState, w: videoEl.videoWidth, h: videoEl.videoHeight, t: videoEl.currentTime }
                );
              });
           } else {
              playInFlightRef.current = false;
           }
        } catch (syncError) {
          playInFlightRef.current = false;
          // Backup controlado abajo
        }
      };

      // Un solo intento inmediato + 1 backup controlado.
      // Esto reduce el `AbortError` cuando llegan `onaddstream` y `ontrack` casi a la vez.
      attemptPlay();
      if (playBackupTimerRef.current) window.clearTimeout(playBackupTimerRef.current);
      playBackupTimerRef.current = window.setTimeout(() => {
        if (!videoEl) return;
        // Si sigue pausado o el readyState es bajo, intentamos play de nuevo.
        if (videoEl.paused || videoEl.readyState < 2) {
          attemptPlay();
        }
      }, isLegacyDevice ? 2500 : 1500); // Dar más tiempo a los TVs lentos para bufferizar

      // Request fullscreen after a short delay to accommodate TV navigation buffers
      if (mode === "watch" && !document.fullscreenElement && videoContainerRef.current) {
        setTimeout(() => {
          const el = videoContainerRef.current;
          if (!el) return;
          const requestFS = el.requestFullscreen || (el as any).webkitRequestFullscreen || (el as any).mozRequestFullScreen || (el as any).msRequestFullscreen;
          if (requestFS) requestFS.call(el).catch(() => {});
        }, 1500);
      }

      const audioTracks = stream.getAudioTracks();
      setHasAudio(audioTracks.length > 0);
    };

    pc.ontrack = (event) => {
      console.log("Evento ontrack detectado!");
      // En algunas implementaciones WebRTC antiguas (ciertos Android/TV),
      // `event.streams` puede venir vacío aunque sí exista `event.track`.
      const stream =
        (event.streams && event.streams[0]) ? event.streams[0] :
        (event.track ? new MediaStream([event.track]) : null);
      if (stream) handleStream(stream);
    };
    // Legacy support for older browsers like Chrome 30-49 (Android 4.4 TV)
    (pc as any).onaddstream = (event: any) => {
        console.log("Evento onaddstream detectado! (Legacy API)");
        if (event.stream) handleStream(event.stream);
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
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { 
          cursor: "always",
          // Constraint to prevent ancient TV decoders from crashing with 1080p+ streams
          width: { max: 1280, ideal: 1280 },
          height: { max: 720, ideal: 720 },
          frameRate: { max: 24, ideal: 24 } // Lowered from 30 to 24 for better stability on old hardware
        } as any,
        audio: true
      });
      
      streamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      safeSend({ type: "join", room: roomId });
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

  const changeScreen = async () => {
    try {
      const newStream = await navigator.mediaDevices.getDisplayMedia({
        video: { 
          cursor: "always",
          width: { max: 1280, ideal: 1280 },
          height: { max: 720, ideal: 720 },
          frameRate: { max: 30, ideal: 24 }
        } as any,
        audio: true
      });

      // Stop old tracks to remove browser sharing banner for the old tab
      streamRef.current?.getTracks().forEach(track => track.stop());
      
      streamRef.current = newStream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = newStream;
      }

      const newVideoTrack = newStream.getVideoTracks()[0];
      const newAudioTrack = newStream.getAudioTracks()[0];

      if (newVideoTrack) {
        newVideoTrack.onended = () => {
          stopSharing();
        };
      }

      // Seamlessly replace tracks without renegotiating
      peerConnections.current.forEach(pc => {
        if (!pc.getSenders) return;
        const senders = pc.getSenders();
        
        const videoSender = senders.find(s => s.track && s.track.kind === "video");
        if (videoSender && newVideoTrack) {
          videoSender.replaceTrack(newVideoTrack).catch(e => console.warn("Fallback video replaceTrack:", e));
        }
        
        const audioSender = senders.find(s => s.track && s.track.kind === "audio");
        if (audioSender && newAudioTrack) {
          audioSender.replaceTrack(newAudioTrack).catch(e => console.warn("Fallback audio replaceTrack:", e));
        }
      });
      
    } catch (err) {
      console.error("Error changing screen:", err);
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

      setAccessStatus(prev => "granted");
      safeSend({ type: "access-response", targetId: userId, granted: true });

      const pc = createPeerConnection(userId);
      
      if (streamRef.current) {
         streamRef.current.getTracks().forEach(track => {
            if (streamRef.current) {
               // Hint that this is screen content to optimize for clarity/detail
               if (track.kind === 'video' && 'contentHint' in track) {
                  (track as any).contentHint = 'detail';
               }
               pc.addTrack(track, streamRef.current);
            }
         });

         const offer = await pc.createOffer();
         // Munge SDP to force bitrate and prefer H264 Baseline for legacy TVs
         const mungedOffer = mungeSDP(offer.sdp || "");
         const finalOffer = new RTCSessionDescription({ type: 'offer', sdp: mungedOffer });
         
         await pc.setLocalDescription(finalOffer);
         sendSignal(finalOffer, userId);
      }
    } catch (err) {
      console.error("Error approving access:", err);
      setStatus("Error al conectar con el usuario");
    }
  };

  /**
   * Senior-level SDP Munging:
   * 1. Forces H.264 Baseline Profile 3.1 (the most compatible profile for old hardware)
   * 2. Sets a hard limit on bitrate (1200kbps) to prevent decoder buffer overflows
   * 3. Completely removes high-overhead codecs like VP9 and VP8
   */
  const mungeSDP = (sdp: string) => {
    let lines = sdp.split('\r\n');
    
    // 1. Force Max Bitrate to 1200kbps (sufficient for clear 720p 24fps)
    const videoIdx = lines.findIndex(l => l.startsWith('m=video'));
    if (videoIdx !== -1) {
      // Chrome/Android specific bitrate constraint
      lines.splice(videoIdx + 1, 0, 'b=AS:1200', 'b=TIAS:1200000');
    }

    // 2. Identify and Filter Codecs
    // Some old TVs crash if they see VP9 in the negotiation list even if not selected.
    const forbiddenPayloads: string[] = [];
    const h264Payloads: string[] = [];
    
    lines.forEach(line => {
      if (line.startsWith('a=rtpmap:')) {
        const payload = line.split(':')[1].split(' ')[0];
        if (line.toLowerCase().includes('vp9') || line.toLowerCase().includes('vp8')) {
          forbiddenPayloads.push(payload);
        } else if (line.toLowerCase().includes('h264')) {
          h264Payloads.push(payload);
        }
      }
    });

    // 3. Force H.264 Baseline Profile in fmtp if available
    // 42e01f is Constrained Baseline Profile Level 3.1
    lines = lines.map(line => {
       if (line.startsWith('a=fmtp:') && h264Payloads.some(p => line.includes('a=fmtp:' + p))) {
          return line.replace(/profile-level-id=[0-9a-fA-F]+/, 'profile-level-id=42e01f');
       }
       return line;
    });

    // 4. Update the m=video line to only include H264 and non-forbidden tracks
    if (videoIdx !== -1) {
      const parts = lines[videoIdx].split(' ');
      const preamble = parts.slice(0, 3);
      const payloads = parts.slice(3);
      
      const filtered = payloads.filter(p => !forbiddenPayloads.includes(p));
      const reordered = [
        ...filtered.filter(p => h264Payloads.includes(p)),
        ...filtered.filter(p => !h264Payloads.includes(p))
      ];
      
      lines[videoIdx] = preamble.join(' ') + ' ' + reordered.join(' ');
    }
    
    // Clean up empty lines
    return lines.filter(l => l.trim() !== '').join('\r\n');
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
     setHasValidFrames(false);
     setParticipants([]);
     setStatus("Compartición finalizada");
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    remoteStreamRef.current = null;
  };

  const togglePause = () => {
    const nextPaused = !isPaused;
    updatePauseState(nextPaused);
    safeSend({ type: "pause-state", room: roomId, paused: nextPaused });
  };

  const requestAccess = () => {
    if (!roomId) {
      alert("Por favor, ingresa un ID de sala");
      return;
    }
    
    setAccessStatus("requesting");
    
    // Cross-browser fullscreen request (prefixed for older TVs)
    const el = videoContainerRef.current;
    if (el) {
      const fsElement = document.fullscreenElement || (document as any).webkitFullscreenElement || (document as any).mozFullScreenElement || (document as any).msFullscreenElement;
      if (!fsElement) {
        const requestFS = el.requestFullscreen || (el as any).webkitRequestFullscreen || (el as any).mozRequestFullScreen || (el as any).msRequestFullscreen;
        if (requestFS) {
          try {
            const result = requestFS.call(el);
            if (result && result.catch) {
              result.catch(() => { /* Silent fail is expected on some TVs */ });
            }
          } catch (e) {
            console.debug("Fullscreen request failed silently", e);
          }
        }
      }
    }
    
    if (safeSend({ type: "join", room: roomId })) {
      safeSend({ type: "request-access", room: roomId, userName: "Usuario TV" });
      setStatus("Solicitando acceso...");
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
    const el = videoContainerRef.current;
    if (!el) return;

    const requestFS = el.requestFullscreen || (el as any).webkitRequestFullscreen || (el as any).mozRequestFullScreen || (el as any).msRequestFullscreen;
    const exitFS = document.exitFullscreen || (document as any).webkitExitFullscreen || (document as any).mozCancelFullScreen || (document as any).msExitFullscreen;
    const fsElement = document.fullscreenElement || (document as any).webkitFullscreenElement || (document as any).mozFullScreenElement || (document as any).msFullscreenElement;

    if (!fsElement) {
      if (requestFS) {
        requestFS.call(el).catch((err: any) => {
          console.error(`Error attempting to enable full-screen mode: ${err.message}`);
        });
      } else {
        // Fallback or alert for very old browsers
        setStatus("Pantalla completa no soportada");
      }
    } else {
      if (exitFS) exitFS.call(document);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      const fsElement = document.fullscreenElement || (document as any).webkitFullscreenElement || (document as any).mozFullScreenElement || (document as any).msFullscreenElement;
      setIsFullscreen(!!fsElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);
    
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
    };
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="p-3 border-b border-zinc-800/50 backdrop-blur-md sticky top-0 z-50 flex justify-between items-center h-14">
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

      <main className="max-w-4xl mx-auto p-2 md:p-4 overflow-x-hidden">
        {!hasWebRTC && (
          <div className="bg-red-500/20 border border-red-500/50 p-6 rounded-2xl mb-8 flex flex-col items-center text-center">
            <ShieldCheck className="text-red-500 mb-4" size={48} />
            <h3 className="text-xl font-bold text-red-100 mb-2">Navegador Incompatible</h3>
            <p className="text-red-200/80 max-w-md">
              Tu navegador no soporta la tecnología necesaria para la transmisión en tiempo real (WebRTC). Por favor, intenta usar una versión reciente de Chrome o Edge.
            </p>
          </div>
        )}
        <AnimatePresence mode="wait">
          {mode === "home" && (
            <motion.div
              key="home"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col md:flex-row gap-6 mt-4 md:mt-8"
            >
              <button
                onClick={() => { setMode("share"); generateRoomId(); }}
                className="group relative bg-zinc-900 border border-zinc-800 p-6 rounded-3xl hover:border-emerald-500/50 transition-all duration-300 text-left overflow-hidden w-full md:flex-1 min-h-[220px]"
              >
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Monitor size={120} />
                </div>
                <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-6">
                  <Monitor className="text-emerald-500 w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold mb-3 tracking-tight">Compartir Pantalla</h2>
                <p className="text-zinc-400 leading-relaxed text-sm">
                  Envía tu pantalla a otro dispositivo. Genera un código y compártelo con el receptor.
                </p>
                <div className="mt-8 flex items-center gap-2 text-emerald-500 font-bold">
                  Empezar ahora <Play size={16} />
                </div>
              </button>

              <button
                onClick={() => setMode("watch")}
                className="group relative bg-zinc-900 border border-zinc-800 p-6 rounded-3xl hover:border-emerald-500/50 transition-all duration-300 text-left overflow-hidden w-full md:flex-1 min-h-[220px]"
              >
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Tv size={120} />
                </div>
                <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-6">
                  <Tv className="text-emerald-500 w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold mb-3 tracking-tight">Ver Transmisión</h2>
                <p className="text-zinc-400 leading-relaxed text-sm">
                  Recibe la pantalla de otro dispositivo. Ingresa el código de sala para conectar.
                </p>
                <div className="mt-8 flex items-center gap-2 text-emerald-500 font-bold">
                  Unirse a sala <Play size={16} />
                </div>
              </button>
            </motion.div>
          )}

          {mode === "share" && (
            <motion.div
              key="share"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col gap-2"
            >
              <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-3xl">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-bold">Emisión</h2>
                    <div className="flex items-center gap-2 bg-zinc-950 px-3 py-1 rounded-xl border border-zinc-800">
                      <span className="font-mono text-emerald-500 font-bold">{roomId || "------"}</span>
                      <button onClick={copyRoomId} className="text-zinc-500 hover:text-white">
                        {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>
                  <div className="bg-black/60 px-3 py-1 rounded-lg text-[10px] font-medium flex items-center gap-2 border border-zinc-800">
                    <div className={`w-1.5 h-1.5 rounded-full ${isSharing ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-600'}`} />
                    {status}
                  </div>
                </div>

                <div className="relative aspect-video max-h-[35vh] bg-zinc-950 rounded-2xl border border-zinc-800 overflow-hidden mx-auto">
                  <video 
                    ref={localVideoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    className={`w-full h-full object-contain transition-all duration-700 ${isPaused && !isLegacyDevice ? 'blur-2xl opacity-50 scale-105' : isPaused ? 'opacity-20 grayscale' : ''}`}
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
                  {/* Overlay indicators moved to top header above */}
                </div>

                <div className="mt-4 flex gap-3">
                  {!isSharing ? (
                    <button
                      onClick={startSharing}
                      className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2 text-sm shadow-lg"
                    >
                      <Share2 size={18} /> Compartir Pantalla
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={changeScreen}
                        className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-2 rounded-xl transition-all flex items-center justify-center gap-2 text-xs md:text-sm shadow-lg whitespace-nowrap"
                        title="Cambiar origen de transmisión"
                      >
                        <Monitor size={16} /> <span className="hidden md:inline">Cambiar</span>
                      </button>
                      <button
                        onClick={togglePause}
                        className={`flex-1 ${isPaused ? 'bg-amber-500' : 'bg-zinc-700'} text-white font-bold py-3 px-2 rounded-xl transition-all flex items-center justify-center gap-2 text-xs md:text-sm shadow-lg whitespace-nowrap`}
                      >
                        {isPaused ? <Eye size={18} /> : <EyeOff size={18} />}
                        {isPaused ? "Reanudar" : "Pausar"}
                      </button>
                      <button
                        onClick={stopSharing}
                        className="flex-1 bg-red-600 text-white font-bold py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2 text-sm shadow-lg"
                      >
                        <StopCircle size={18} /> Detener
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => { stopSharing(); setMode("home"); }}
                    className="bg-zinc-800 text-white font-bold py-3 px-6 rounded-xl transition-all text-sm"
                  >
                    Volver
                  </button>
                </div>

                {/* Pending Requests for Broadcaster */}
                {isSharing && pendingRequests.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 space-y-2 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl"
                  >
                    <h3 className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider flex items-center gap-2">
                      <UserPlus size={12} /> Solicitud ({pendingRequests.length})
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
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-8 flex flex-col md:flex-row gap-6"
                  >
                    <div className="flex-1 min-w-[30%] bg-zinc-950/50 border border-zinc-800 p-6 rounded-3xl">
                      <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <Users size={14} /> Participantes ({participants.length})
                      </h3>
                      <div className="flex flex-col gap-3 max-h-64 overflow-y-auto pr-2">
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

                    <div className="flex-[2] bg-zinc-950/50 border border-zinc-800 p-4 rounded-3xl overflow-hidden shadow-inner">
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

              <div className="bg-emerald-500/5 border border-emerald-500/10 p-2 px-4 rounded-xl flex justify-center items-center gap-2">
                  <Info className="text-emerald-500" size={12} />
                  <span className="text-[11px] text-zinc-400">Código: <b>{roomId}</b>. El receptor se conectará al entrar.</span>
              </div>
            </motion.div>
          )}

          {mode === "watch" && (
            <motion.div
              key="watch"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col gap-2"
            >
              <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-3xl">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
                  <div className="flex-1">
                    <h2 className="text-xl font-bold">Receptor</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={roomId}
                      onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                      placeholder="CÓDIGO"
                      disabled={accessStatus === "requesting"}
                      className="bg-zinc-950 border border-zinc-800 px-4 py-2 rounded-xl font-mono text-lg font-bold text-emerald-500 focus:outline-none focus:border-emerald-500 transition-colors w-32 text-center tracking-widest disabled:opacity-50"
                    />
                    {accessStatus === "idle" || accessStatus === "denied" ? (
                      <button
                        onClick={requestAccess}
                        className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold py-2.5 px-5 rounded-xl transition-all flex items-center gap-2 text-sm"
                      >
                        Unirse
                      </button>
                    ) : accessStatus === "requesting" ? (
                      <div className="flex items-center gap-2 bg-zinc-800 px-4 py-2 rounded-xl text-zinc-400 animate-pulse text-xs">
                        <ShieldCheck size={16} /> Solicitando...
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 bg-emerald-500/20 text-emerald-500 px-4 py-2.5 rounded-xl font-bold border border-emerald-500/30 text-xs">
                        <ShieldCheck size={16} /> Acceso Permitido
                      </div>
                    )}
                  </div>
                </div>

                <div 
                  ref={videoContainerRef}
                  className={`relative group shadow-2xl overflow-hidden bg-black ${isFullscreen ? 'w-screen h-screen' : 'aspect-video max-h-[60vh] rounded-2xl border border-zinc-800'}`}
                >
                  <video 
                    ref={(el) => {
                      remoteVideoRef.current = el;
                      if (el && remoteStreamRef.current && el.srcObject !== remoteStreamRef.current) {
                        try {
                           el.srcObject = remoteStreamRef.current;
                        } catch (e) {
                           console.warn("Error restoring stream", e);
                        }
                      }
                    }} 
                    autoPlay
                    playsInline 
                    {...({ "webkit-playsinline": "true" } as any)}
                    muted={isMuted}
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    className={`block bg-black ${isPaused ? (isLegacyDevice ? 'opacity-20' : 'opacity-30 blur-sm') : 'opacity-100'}`}
                    onTimeUpdate={(e) => {
                       if (e.currentTarget.currentTime > 0.1 && !hasValidFrames) {
                          console.log("¡Frames reales verificados en pantalla!");
                          setHasValidFrames(true);
                       }
                    }}
                  />
                  
                  <AnimatePresence>
                    {isPaused && (
                      <motion.div 
                        initial={isLegacyDevice ? { opacity: 0 } : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className={`absolute inset-0 z-10 flex flex-col items-center justify-center text-center p-8 ${isLegacyDevice ? 'bg-zinc-950' : 'bg-zinc-950/40 backdrop-blur-sm'}`}
                      >
                        <motion.div 
                          initial={{ scale: 0.8 }}
                          animate={isLegacyDevice ? {} : { scale: 1 }}
                          className={`w-24 h-24 bg-amber-500/20 rounded-full flex items-center justify-center mb-8 border border-amber-500/30 ${isLegacyDevice ? '' : ''}`}
                        >
                          <Pause className={`text-amber-500 w-12 h-12 ${isLegacyDevice ? '' : 'animate-pulse'}`} />
                        </motion.div>
                        <h3 className="text-3xl font-black text-white mb-4 tracking-tight">Transmisión en espera</h3>
                        <p className="text-zinc-300 max-w-sm leading-relaxed text-lg">
                          El emisor ha pausado la vista momentáneamente.
                        </p>
                      </motion.div>
                    )}

                    {/* Failsafe Play Button: Si el TV bloquea el autoplay por falta de interacción o no avanzan los frames */}
                    {status.includes("Conectado") && !hasValidFrames && !isPaused && (
                       <motion.div 
                         initial={{ opacity: 0 }}
                         animate={{ opacity: 1 }}
                         transition={{ delay: 1 }}
                         className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm"
                       >
                         <button
                           onClick={() => {
                              if (remoteVideoRef.current) {
                                  remoteVideoRef.current.play().catch(e => console.error(e));
                                  // Hack to kickstart ancient decoders:
                                  remoteVideoRef.current.currentTime = 0;
                              }
                           }}
                           className="w-32 h-32 bg-emerald-500 rounded-full flex items-center justify-center shadow-[0_0_50px_rgba(16,185,129,0.5)] hover:scale-105 transition-transform animate-pulse"
                         >
                            <Play className="text-zinc-950 w-16 h-16 ml-2" />
                         </button>
                         <p className="text-emerald-500 font-bold mt-8 text-xl tracking-widest uppercase">
                            Toca para Ver
                         </p>
                         <p className="text-zinc-400 mt-2 text-sm text-center max-w-xs">
                            Tu dispositivo pausó la transmisión automáticamente.
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

                    {(accessStatus !== "granted" && !status.includes("Conectado")) && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-600 pointer-events-none bg-zinc-950/80 backdrop-blur-sm z-20">
                        <Tv size={48} className="mb-4 opacity-20" />
                        <p className="text-sm font-medium px-6 text-center">
                          {status === "Transmisión finalizada por el emisor" || status === "Conexión perdida" 
                            ? status 
                            : accessStatus === "requesting" 
                               ? "Esperando respuesta del emisor..." 
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

                <div className="mt-2 flex gap-3">
                  <button
                    onClick={() => { stopSharing(); setMode("home"); }}
                    className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 font-bold py-2 px-4 rounded-xl transition-all text-[11px]"
                  >
                    Desconectar
                  </button>
                  <button
                    onClick={() => { setMode("home"); }}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-2 px-4 rounded-xl transition-all text-[11px]"
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
      <footer className="p-4 text-center text-zinc-600 text-[10px]">
        <p>© nextappcode • Todos los derechos reservados</p>
      </footer>
    </div>
  );
}
