import { useRef, useCallback, useState } from "react";
import { Participant, SignalMessage } from "../types";

const STUN_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

export const useWebRTC = (safeSend: (data: any) => void) => {
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const iceCandidateQueue = useRef<Map<string, any[]>>(new Map());
  const streamRef = useRef<MediaStream | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const isSharingRef = useRef(false);

  const sendSignal = useCallback((data: any, roomId: string, targetId?: string, isRenegotiation = false) => {
    safeSend({
      type: "signal",
      room: roomId,
      data: data,
      targetId: targetId,
      renegotiate: isRenegotiation
    });
  }, [safeSend]);

  const createPeerConnection = useCallback((targetId: string, roomId: string) => {
    const pc = new RTCPeerConnection(STUN_SERVERS);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal({ type: "candidate", candidate: event.candidate }, roomId, targetId);
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed" || pc.iceConnectionState === "closed") {
        peerConnections.current.delete(targetId);
        setParticipants(prev => prev.filter(p => p.id !== targetId));
      }
    };

    peerConnections.current.set(targetId, pc);
    return pc;
  }, [sendSignal]);

  const startLocalStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { 
          cursor: "always",
          width: { max: 1280, ideal: 1280 },
          height: { max: 720, ideal: 720 },
          frameRate: { max: 30, ideal: 24 }
        } as any,
        audio: true
      });
      streamRef.current = stream;
      isSharingRef.current = true;
      return stream;
    } catch (err) {
      console.error("Error starting screen share:", err);
      throw err;
    }
  }, []);

  const stopAll = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    peerConnections.current.forEach(pc => pc.close());
    peerConnections.current.clear();
    setParticipants([]);
    isSharingRef.current = false;
    streamRef.current = null;
  }, []);

  return { 
    peerConnections, 
    iceCandidateQueue, 
    streamRef, 
    participants, 
    setParticipants,
    createPeerConnection,
    startLocalStream,
    stopAll,
    sendSignal,
    isSharingRef
  };
};
