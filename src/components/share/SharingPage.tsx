import React from 'react';
import { motion } from 'motion/react';
import { Monitor, StopCircle, Share2, EyeOff, Eye, UserPlus, Users, Info } from 'lucide-react';
import { VideoView } from '../common/VideoView';
import { Participant, PendingRequest } from '../../types';

interface SharingPageProps {
  roomId: string;
  isSharing: boolean;
  status: string;
  isPaused: boolean;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  stream: MediaStream | null;
  pendingRequests: PendingRequest[];
  participants: Participant[];
  onStartSharing: () => void;
  onStopSharing: () => void;
  onTogglePause: () => void;
  onChangeScreen: () => void;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  onBack: () => void;
}

export const SharingPage: React.FC<SharingPageProps> = ({
  roomId, isSharing, status, isPaused, localVideoRef, stream,
  pendingRequests, participants, onStartSharing, onStopSharing,
  onTogglePause, onChangeScreen, onApprove, onDeny, onBack
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="w-full flex flex-col lg:grid lg:grid-cols-12 gap-5 lg:h-[75vh]"
    >
      {/* Left Column: Video Preview */}
      <div className="lg:col-span-8 flex flex-col gap-4">
        
        <div className="flex-1 bg-[var(--bg-soft)] border border-[var(--border-subtle)] p-4 rounded-[var(--radius-xl)] shadow-[var(--shadow-md)] flex flex-col">
          <div className="relative flex-1 min-h-[300px]">
            <VideoView 
              stream={stream} 
              isPaused={isPaused} 
              isMuted={true}
              label="Vista previa de pantalla"
              className="w-full h-full rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)]"
            />
            {!isSharing && (
               <div className="absolute bottom-4 left-4 right-4 p-3 bg-blue-500/10 border border-blue-500/20 backdrop-blur-md rounded-xl flex items-center gap-3 text-xs font-bold text-blue-400 z-10">
                  <Info size={16} />
                  <span>Activa "Compartir audio" al iniciar para transmitir sonido.</span>
               </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Controls & Info */}
      <div className="lg:col-span-4 flex flex-col gap-4 overflow-hidden">
        <div className="bg-[var(--bg-soft)] border border-[var(--border-subtle)] p-5 rounded-[var(--radius-xl)] shadow-[var(--shadow-md)] flex flex-col gap-5">
           <h3 className="text-[var(--text-xs)] font-black text-[var(--text-subtle)] uppercase tracking-[0.2em]">Controles de Sala</h3>
           <div className="grid gap-3">
              {!isSharing ? (
                <button
                  onClick={onStartSharing}
                  className="w-full bg-[var(--energy)] hover:bg-[var(--energy-hover)] text-white font-black py-4 rounded-[var(--radius-lg)] transition-all animate-pulse shadow-lg shadow-[var(--energy)]/20 active:scale-[0.98] flex items-center justify-center gap-3"
                >
                  <Share2 size={24} /> INICIAR
                </button>
              ) : (
                <>
                  <button
                    onClick={onChangeScreen}
                    className="w-full bg-[var(--bg-muted)] hover:bg-[var(--border-strong)] text-[var(--text-main)] font-bold py-3 px-4 rounded-[var(--radius-md)] transition-all flex items-center justify-center gap-2 text-sm border border-[var(--border-subtle)]"
                  >
                    <Monitor size={18} /> Cambiar Pantalla
                  </button>
                  <button
                    onClick={onTogglePause}
                    className={`w-full ${isPaused ? 'bg-[var(--warning)] text-black' : 'bg-[var(--bg-muted)] text-[var(--text-main)]'} font-bold py-3 px-4 rounded-[var(--radius-md)] transition-all flex items-center justify-center gap-2 text-sm border border-[var(--border-subtle)]`}
                  >
                    {isPaused ? <Eye size={18} /> : <EyeOff size={18} />}
                    {isPaused ? "Reanudar" : "Pausar Vista"}
                  </button>
                  <button
                    onClick={onStopSharing}
                    className="w-full bg-[var(--error)] hover:bg-[var(--error)]/90 text-white font-black py-3 px-4 rounded-[var(--radius-md)] transition-all flex items-center justify-center gap-2 text-sm shadow-md"
                  >
                    <StopCircle size={18} /> Detener Sala
                  </button>
                </>
              )}
              <button
                onClick={onBack}
                className="w-full text-[var(--text-subtle)] hover:text-[var(--text-main)] font-bold py-2 text-xs transition-all uppercase tracking-widest mt-2"
              >
                Volver al inicio
              </button>
           </div>
        </div>

        {/* Requests & Participants Area */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-4 custom-scrollbar">
          {isSharing && pendingRequests.length > 0 && (
            <div className="p-4 bg-[var(--success)]/5 border border-[var(--success)]/20 rounded-[var(--radius-lg)] space-y-3">
              <h4 className="text-[var(--text-xs)] font-black text-[var(--success)] uppercase tracking-widest flex items-center gap-2">
                <UserPlus size={14} /> Solicitudes ({pendingRequests.length})
              </h4>
              <div className="grid gap-2">
                {pendingRequests.map(req => (
                  <div key={req.id} className="bg-[var(--bg-main)] p-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] shadow-sm">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 bg-[var(--p-500)]/10 text-[var(--p-500)] rounded-full flex items-center justify-center text-sm font-black">
                        {req.name.charAt(0)}
                      </div>
                      <span className="text-sm font-bold truncate">{req.name}</span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => onApprove(req.id)} className="flex-1 bg-[var(--success)] text-white text-[10px] font-black py-2 rounded-md uppercase">Aceptar</button>
                      <button onClick={() => onDeny(req.id)} className="flex-1 bg-[var(--bg-muted)] text-[var(--text-subtle)] text-[10px] font-bold py-2 rounded-md uppercase">No</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isSharing && participants.length > 0 ? (
            <div className="bg-[var(--bg-soft)] border border-[var(--border-subtle)] p-4 rounded-[var(--radius-lg)]">
              <h4 className="text-[var(--text-xs)] font-black text-[var(--text-subtle)] uppercase tracking-widest mb-4 flex items-center gap-2">
                <Users size={14} /> En Línea ({participants.length})
              </h4>
              <div className="grid gap-2">
                {participants.map(p => (
                  <div key={p.id} className="flex items-center gap-3 bg-[var(--bg-main)] p-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)]/50">
                    <div className="w-6 h-6 bg-[var(--p-500)]/10 rounded-full flex items-center justify-center text-[10px] font-bold text-[var(--p-500)]">
                      {p.name.charAt(0)}
                    </div>
                    <span className="text-xs font-bold truncate">{p.name}</span>
                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[var(--success)] animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          ) : isSharing && (
            <div className="h-32 border-2 border-dashed border-[var(--border-subtle)] rounded-[var(--radius-lg)] flex flex-col items-center justify-center opacity-30">
               <Users size={24} className="mb-2" />
               <span className="text-[10px] font-bold uppercase tracking-widest">Esperando audiencia</span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};
