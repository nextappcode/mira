import React, { useRef, useEffect } from 'react';
import { Monitor, EyeOff, Play } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface VideoViewProps {
  stream: MediaStream | null;
  isPaused: boolean;
  isMuted: boolean;
  label: string;
  isLive?: boolean;
  className?: string;
  onFramesVerified?: () => void;
  showPauseOverlay?: boolean;
}

export const VideoView: React.FC<VideoViewProps> = ({ 
  stream, isPaused, isMuted, label, isLive, className = "", onFramesVerified, showPauseOverlay = true 
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playInFlight = useRef(false);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !stream) return;

    if (videoEl.srcObject !== stream) {
      videoEl.srcObject = stream;
      
      const attemptPlay = () => {
        if (playInFlight.current) return;
        playInFlight.current = true;
        videoEl.play()
          .then(() => { playInFlight.current = false; })
          .catch(e => {
            playInFlight.current = false;
            if (e.name !== 'AbortError') console.error("Play error:", e);
          });
      };
      attemptPlay();
    }
  }, [stream]);

  return (
    <div className={`relative aspect-video bg-[var(--bg-main)] rounded-[var(--radius-lg)] border border-[var(--border-subtle)] overflow-hidden ${className}`}>
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        muted={isMuted}
        onTimeUpdate={(e) => {
          if (e.currentTarget.currentTime > 0.1 && onFramesVerified) {
            onFramesVerified();
          }
        }}
        className={`w-full h-full object-contain transition-all duration-[var(--dur-slow)] ${isPaused ? 'blur-2xl opacity-50 scale-105' : ''}`}
      />
      
      {isLive && (
        <div className="absolute top-4 right-4 bg-[var(--error)]/20 backdrop-blur-md px-3 py-1.5 rounded-[var(--radius-sm)] text-[var(--text-xs)] font-bold text-[var(--error)] border border-[var(--error)]/30 z-10">
          LIVE
        </div>
      )}

      {showPauseOverlay && isPaused && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <div className="bg-[var(--warning)]/20 backdrop-blur-md px-6 py-3 rounded-[var(--radius-lg)] border border-[var(--warning)]/30 flex items-center gap-3">
            <EyeOff className="text-[var(--warning)]" />
            <span className="text-[var(--warning)] font-bold uppercase tracking-wider text-sm">Pausado</span>
          </div>
        </div>
      )}

      {(!stream && !isPaused) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--text-subtle)]">
          <Monitor size={48} className="mb-4 opacity-20" />
          <p className="text-sm font-medium">{label}</p>
        </div>
      )}
    </div>
  );
};
