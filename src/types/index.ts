export type Mode = "home" | "share" | "watch";
export type AccessStatus = "idle" | "requesting" | "granted" | "denied";

export interface Participant {
  id: string;
  name: string;
}

export interface PendingRequest {
  id: string;
  name: string;
}

export interface SignalMessage {
  id?: string;
  type: string;
  data?: any;
  sender?: string;
  userId?: string;
  targetId?: string;
  userName?: string;
  granted?: boolean;
  broadcasterId?: string;
  paused?: boolean;
  renegotiate?: boolean;
}
