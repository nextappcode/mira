import { useEffect, useRef, useState, useCallback } from "react";
import { SignalMessage } from "../types";

export const useSignal = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState("Listo para conectar");
  const [myId, setMyId] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);

  const safeSend = useCallback((data: any) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(data));
      return true;
    }
    return false;
  }, []);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws-signal`);
    socketRef.current = socket;

    socket.onopen = () => {
      console.log("WebSocket connected successfully");
      setStatus("Conectado al servidor");
      setIsConnected(true);
      reconnectAttempts.current = 0;
    };

    socket.onerror = (error) => {
      if (socket.readyState === WebSocket.CLOSED) {
        console.debug("WebSocket connection attempt failed, will retry...");
      } else {
        console.error("WebSocket error:", error);
      }
      setStatus("Reconectando...");
    };

    socket.onclose = (event) => {
      setIsConnected(false);
      console.log(`WebSocket closed: ${event.reason || 'No reason'}. Reconnecting...`);
      const delay = Math.min(10000, 3000 + (reconnectAttempts.current * 1000));
      reconnectAttempts.current++;
      setTimeout(connect, delay);
    };

    return socket;
  }, []);

  useEffect(() => {
    const timeout = setTimeout(connect, 2000);
    return () => {
      clearTimeout(timeout);
      if (socketRef.current) socketRef.current.close();
    };
  }, [connect]);

  return { isConnected, status, setStatus, myId, setMyId, socketRef, safeSend };
};
