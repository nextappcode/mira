import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Tv, ShieldCheck, Play, Pause, Volume2, VolumeX, Maximize, Minimize, X } from 'lucide-react';
import { VideoView } from '../common/VideoView';
import { AccessStatus } from '../../types';

interface WatchingPageProps {
  roomId: string;
  setRoomId: (id: string) => void;
  accessStatus: AccessStatus;
  status: string;
  remoteStream: MediaStream | null;
  isPaused: boolean;
  isMuted: boolean;
  isFullscreen: boolean;
  hasValidFrames: boolean;
  hasAudio: boolean;
  videoContainerRef: React.RefObject<HTMLDivElement | null>;
  onJoin: () => void;
  onToggleFullscreen: () => void;
  onToggleMute: () => void;
  onLeave: () => void;
  onFramesVerified: () => void;
  onManualPlay: () => void;
}

export const WatchingPage: React.FC<WatchingPageProps> = ({
  roomId, setRoomId, accessStatus, status, remoteStream, isPaused,
  isMuted, isFullscreen, hasValidFrames, hasAudio, videoContainerRef,
  onJoin, onToggleFullscreen, onToggleMute, onLeave, onFramesVerified, onManualPlay
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="w-full flex flex-col lg:grid lg:grid-cols-12 gap-5 lg:h-[75vh]"
    >
      {/* Left Column: Main Video Screen */}
      <div className="lg:col-span-9 flex flex-col shadow-2xl rounded-[var(--radius-xl)] overflow-hidden bg-black border border-[var(--border-subtle)] relative group">
        <div ref={videoContainerRef} className="w-full h-full relative">
          <VideoView 
            stream={remoteStream} 
            isPaused={isPaused} 
            isMuted={isMuted}
            label={status || "Esperando señal..."}
            className="w-full h-full aspect-video"
            onFramesVerified={onFramesVerified}
            showPauseOverlay={false}
          />
          
          <AnimatePresence>
            {isPaused && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center p-8 bg-[var(--bg-main)]/60 backdrop-blur-xl"
              >
                <div className="w-20 h-20 bg-[var(--warning)]/20 rounded-full flex items-center justify-center mb-6 border border-[var(--warning)]/30">
                  <Pause className="text-[var(--warning)] w-10 h-10" />
                </div>
                <h3 className="text-2xl font-black text-[var(--text-main)] mb-2 uppercase italic">Pausado</h3>
              </motion.div>
            )}

            {status.includes("Conectado") && !hasValidFrames && !isPaused && (
               <motion.div 
                 initial={{ opacity: 0 }}
                 animate={{ opacity: 1 }}
                 className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md"
               >
                   <button onClick={onManualPlay} className="w-24 h-24 bg-[var(--p-500)] rounded-full flex items-center justify-center shadow-[var(--shadow-glow-p)] hover:scale-110 transition-transform animate-pulse">
                    <Play className="text-[var(--bg-main)] w-12 h-12 ml-2 fill-current" />
                  </button>
                  <p className="text-[var(--p-500)] font-black mt-6 text-xl tracking-widest uppercase">Sintonizar</p>
               </motion.div>
            )}
          </AnimatePresence>
          
          {/* Internal Video Controls (HUD) */}
          <div className="absolute inset-0 flex flex-col justify-between p-4 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-black/60 via-transparent to-black/60 pointer-events-none">
              <div className="flex justify-between items-start pointer-events-auto">
                 <div className="bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-[10px] font-black text-white uppercase flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${status.includes("Conectado") ? 'bg-[var(--success)] animate-pulse' : 'bg-gray-500'}`} />
                    {status}
                 </div>
              </div>

              <div className="flex justify-end gap-2 pointer-events-auto">
                {hasAudio && (
                  <button 
                    onClick={onToggleMute} 
                    title={isMuted ? "Activar sonido" : "Silenciar"}
                    aria-label={isMuted ? "Activar sonido" : "Silenciar"}
                    className={`p-2.5 rounded-lg border border-white/10 ${isMuted ? 'bg-[var(--error)] text-white' : 'bg-white/10 text-white'}`}
                  >
                    {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  </button>
                )}
                <button 
                  onClick={onToggleFullscreen} 
                  title="Pantalla completa"
                  aria-label="Pantalla completa"
                  className="bg-white/10 p-2.5 rounded-lg border border-white/10 text-white hover:bg-[var(--p-500)] hover:text-black transition-all"
                >
                  <Maximize size={18} />
                </button>
              </div>
          </div>
        </div>
      </div>

      {/* Right Column: Signal Info & Action Buttons */}
      <div className="lg:col-span-3 flex flex-col gap-4">
        <div className="bg-[var(--bg-soft)] border border-[var(--border-subtle)] p-5 rounded-[var(--radius-xl)] shadow-[var(--shadow-md)] flex flex-col gap-4">
           <div className="flex flex-col gap-1">
              <h4 className="text-[var(--text-xs)] font-black text-[var(--text-subtle)] uppercase tracking-[0.2em]">Sintonizador</h4>
              <div className="flex items-center gap-2 bg-[var(--bg-main)] p-2 rounded-xl border border-[var(--border-subtle)]">
                <input
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                  placeholder="ID"
                  disabled={accessStatus === "requesting"}
                  className="bg-transparent border-none px-2 py-1 font-mono text-xl font-black text-[var(--energy)] focus:outline-none w-24 text-center tracking-widest disabled:opacity-50"
                />
                <button 
                  onClick={onJoin}
                  disabled={accessStatus === "requesting"}
                  title="Unirse a la sala"
                  aria-label="Unirse a la sala"
                  className="bg-[var(--energy)] hover:bg-[var(--energy-hover)] disabled:grayscale text-white font-black py-2.5 rounded-lg transition-all text-xs flex items-center justify-center min-w-[80px]"
                >
                  {accessStatus === "requesting" ? "..." : "UNIRSE"}
                </button>
              </div>
           </div>

           <div className="h-[1px] bg-[var(--border-subtle)]" />

           <div className="flex flex-col gap-2">
              <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest px-1">Señal</span>
              <div className={`p-3 rounded-xl border flex items-center gap-3 ${accessStatus === "granted" ? 'bg-[var(--success)]/10 border-[var(--success)]/20' : 'bg-[var(--bg-muted)] border-[var(--border-subtle)]'}`}>
                 <ShieldCheck size={18} className={accessStatus === "granted" ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'} />
                 <span className={`text-xs font-bold leading-tight ${accessStatus === "granted" ? 'text-[var(--success)]' : 'text-[var(--text-main)]'}`}>
                    {accessStatus === "granted" ? "Canal Autorizado" : accessStatus === "requesting" ? "Verificando..." : "Acceso Pendiente"}
                 </span>
              </div>
           </div>

           <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={onLeave}
                className="w-full bg-[var(--error)]/10 hover:bg-[var(--error)] text-[var(--error)] hover:text-white border border-[var(--error)]/30 font-black py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-xs"
              >
                <X size={14} /> DESCONECTAR
              </button>
              <button
                onClick={onBack}
                className="w-full text-[var(--text-subtle)] hover:text-[var(--text-main)] font-bold py-2 text-[10px] transition-all uppercase tracking-widest text-center"
              >
                Ir al inicio
              </button>
           </div>
        </div>
      </div>
    </motion.div>
  );
};

const onBack = () => { /* placeholder */ };
