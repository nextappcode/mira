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
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="flex flex-col gap-6"
    >
      <div className="bg-[var(--bg-soft)] border border-[var(--border-subtle)] p-6 rounded-[var(--radius-xl)] shadow-[var(--shadow-md)]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div className="flex flex-col gap-1">
            <h2 className="text-[var(--text-xs)] font-bold text-[var(--text-subtle)] uppercase tracking-widest">Recepción de Señal</h2>
            <h3 className="text-2xl font-black text-[var(--text-main)] font-heading">Sintonizar Sala</h3>
          </div>
          
          <div className="flex items-center gap-3 bg-[var(--bg-main)] p-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] shadow-inner">
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value.toUpperCase())}
              placeholder="CÓDIGO"
              disabled={accessStatus === "requesting"}
              className="bg-transparent border-none px-4 py-2 font-mono text-2xl font-black text-[var(--p-500)] focus:outline-none w-40 text-center tracking-widest disabled:opacity-50"
            />
            {accessStatus === "idle" || accessStatus === "denied" ? (
              <button
                onClick={onJoin}
                title="Sintonizar sala con código"
                aria-label="Unirse a la sala de transmisión"
                className="bg-[var(--p-500)] hover:bg-[var(--p-600)] text-[var(--bg-main)] font-black py-3 px-8 rounded-[var(--radius-md)] transition-all flex items-center gap-2 shadow-lg shadow-[var(--p-500)]/20 shadow-glow-p h-12"
              >
                UNIRSE <Play size={20} className="fill-current" />
              </button>
            ) : accessStatus === "requesting" ? (
              <div className="flex items-center gap-3 bg-[var(--bg-muted)] px-8 py-3 rounded-[var(--radius-md)] text-[var(--text-muted)] animate-pulse h-12 font-bold">
                <ShieldCheck size={20} /> SOLICITANDO...
              </div>
            ) : (
              <div className="flex items-center gap-3 bg-[var(--success)]/10 text-[var(--success)] px-8 py-3 rounded-[var(--radius-md)] font-black border border-[var(--success)]/30 h-12">
                <ShieldCheck size={20} /> ACCESO PERMITIDO
              </div>
            )}
          </div>
        </div>

        <div 
          ref={videoContainerRef}
          className={`relative group shadow-2xl overflow-hidden bg-black ${isFullscreen ? 'fixed inset-0 z-[100] w-screen h-screen' : 'aspect-video rounded-[var(--radius-xl)] border border-[var(--border-subtle)]'}`}
        >
          <VideoView 
            stream={remoteStream} 
            isPaused={isPaused} 
            isMuted={isMuted}
            label={status || "Esperando señal..."}
            className="w-full h-full"
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
                <motion.div 
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  className="w-24 h-24 bg-[var(--warning)]/20 rounded-full flex items-center justify-center mb-8 border border-[var(--warning)]/30 shadow-[0_0_40px_var(--warning)]/10"
                >
                  <Pause className="text-[var(--warning)] w-12 h-12" />
                </motion.div>
                <h3 className="text-3xl font-black text-[var(--text-main)] mb-4 tracking-tight uppercase italic">Transmisión en espera</h3>
                <p className="text-[var(--text-muted)] max-w-sm leading-relaxed text-lg font-medium">
                  El emisor ha pausado la vista momentáneamente para proteger su privacidad.
                </p>
              </motion.div>
            )}

            {status.includes("Conectado") && !hasValidFrames && !isPaused && (
               <motion.div 
                 initial={{ opacity: 0 }}
                 animate={{ opacity: 1 }}
                 transition={{ delay: 1 }}
                 className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md"
               >
                   <button
                     onClick={onManualPlay}
                     title="Ver señal sintonizada"
                     aria-label="Sintonizar señal de video"
                     className="w-32 h-32 bg-[var(--p-500)] rounded-full flex items-center justify-center shadow-[var(--shadow-glow-p)] hover:scale-110 transition-transform animate-pulse"
                   >
                    <Play className="text-[var(--bg-main)] w-16 h-16 ml-3 fill-current" />
                 </button>
                 <p className="text-[var(--p-500)] font-black mt-10 text-2xl tracking-[0.2em] uppercase font-heading">
                    Toca para Sintonizar
                 </p>
                 <p className="text-[var(--text-subtle)] mt-4 text-sm text-center max-w-xs font-medium px-4">
                    La reproducción automática está bloqueada. Haz clic en el botón para activar la señal del emisor.
                 </p>
               </motion.div>
            )}
          </AnimatePresence>
          
          <div className={`absolute inset-0 flex flex-col justify-between p-6 transition-opacity duration-300 ${isFullscreen ? 'opacity-0 hover:opacity-100 bg-gradient-to-b from-black/50 via-transparent to-black/50' : 'opacity-100'}`}>
              <div className="flex justify-between items-start">
                <div className="flex flex-col gap-3">
                  <div className="bg-[var(--bg-main)]/40 backdrop-blur-xl px-4 py-2 rounded-[var(--radius-md)] text-[var(--text-xs)] font-bold flex items-center gap-2 border border-[var(--border-subtle)]/30 text-[var(--text-main)]">
                    <div className={`w-2.5 h-2.5 rounded-full ${status.includes("Conectado") ? 'bg-[var(--success)] animate-pulse shadow-[0_0_8px_var(--success)]' : 'bg-[var(--text-subtle)]'}`} />
                    {status.toUpperCase()}
                  </div>
                  {hasAudio && (
                    <div className="bg-[var(--p-500)]/20 backdrop-blur-xl px-4 py-2 rounded-[var(--radius-md)] text-[var(--text-xs)] font-black text-[var(--p-500)] flex items-center gap-2 border border-[var(--p-400)]/30">
                      <Volume2 size={16} /> AUDIO HD DISPONIBLE
                    </div>
                  )}
                </div>
                
                <div className="flex gap-3">
                  {hasAudio && (
                      <button
                      onClick={onToggleMute}
                      title={isMuted ? "Activar sonido" : "Silenciar"}
                      aria-label={isMuted ? "Activar sonido" : "Silenciar"}
                      className={`backdrop-blur-xl p-3 rounded-[var(--radius-md)] border border-white/10 transition-all ${isMuted ? 'bg-[var(--error)]/20 text-[var(--error)]' : 'bg-white/10 text-white hover:bg-[var(--p-500)] hover:text-[var(--bg-main)]'}`}
                    >
                      {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
                    </button>
                  )}
                  <button
                    onClick={onToggleFullscreen}
                    title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
                    aria-label={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
                    className="bg-white/10 backdrop-blur-xl p-3 rounded-[var(--radius-md)] border border-white/10 text-white hover:bg-[var(--p-500)] hover:text-[var(--bg-main)] transition-all"
                  >
                    {isFullscreen ? <Minimize size={24} /> : <Maximize size={24} />}
                  </button>
                </div>
              </div>
          </div>

          {!isFullscreen && status.includes("Conectado") && (
            <button
              onClick={onToggleFullscreen}
              title="Poner en pantalla completa"
              aria-label="Poner en pantalla completa"
              className="absolute bottom-6 right-6 bg-[var(--p-500)] text-[var(--bg-main)] p-4 rounded-full shadow-[var(--shadow-glow-p)] animate-bounce hover:scale-110 transition-transform active:scale-95"
            >
              <Maximize size={28} />
            </button>
          )}
        </div>

        <div className="mt-8 flex flex-col md:flex-row gap-4">
          <button
            onClick={onBack}
            title="Ir a la página de inicio"
            aria-label="Volver al inicio"
            className="flex-1 bg-[var(--bg-muted)] hover:bg-[var(--bg-muted)]/80 text-[var(--text-main)] font-bold py-4 px-8 rounded-[var(--radius-md)] transition-all flex items-center justify-center gap-3"
          >
            VOLVER AL INICIO
          </button>
          <button
            onClick={onLeave}
            title="Detener la transmisión actual"
            aria-label="Detener recepción"
            className="flex-2 bg-[var(--error)]/10 hover:bg-[var(--error)] text-[var(--error)] hover:text-white border border-[var(--error)]/30 font-black py-4 px-8 rounded-[var(--radius-md)] transition-all flex items-center justify-center gap-3"
          >
            <X size={20} /> DETENER RECEPCIÓN
          </button>
        </div>
      </div>
      
      <div className="bg-[var(--bg-soft)] p-4 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] flex items-center gap-3">
        <div className="w-1.5 h-1.5 rounded-full bg-[var(--success)] animate-pulse" />
        <p className="text-[var(--text-xs)] text-[var(--text-muted)] font-medium">Optimizando flujo de datos para baja latencia (P2P Mesh Network)...</p>
      </div>
    </motion.div>
  );
};

const onBack = () => { /* placeholder */ };
