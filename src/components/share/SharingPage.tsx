import React from 'react';
import { motion } from 'motion/react';
import { Monitor, StopCircle, Share2, EyeOff, Eye, UserPlus, Users, Info } from 'lucide-react';
import { VideoView } from '../common/VideoView';
import { StatusCard } from '../common/StatusCard';
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
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col gap-6"
    >
      <StatusCard 
        status={status} 
        roomId={roomId} 
        isLive={isSharing} 
      />

      <div className="bg-[var(--bg-soft)] border border-[var(--border-subtle)] p-6 rounded-[var(--radius-xl)] shadow-[var(--shadow-md)]">
        <div className="relative mb-6">
          <VideoView 
            stream={stream} 
            isPaused={isPaused} 
            isMuted={true}
            label="Vista previa de pantalla"
            className="rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)]"
          />
        </div>

        <div className="flex flex-wrap gap-4">
          {!isSharing ? (
            <button
              onClick={onStartSharing}
              className="flex-1 bg-[var(--p-500)] hover:bg-[var(--p-600)] text-[var(--bg-main)] font-black py-4 px-8 rounded-[var(--radius-lg)] transition-all animate-pulse shadow-lg shadow-[var(--p-500)]/20 active:scale-[0.98] flex items-center justify-center gap-3"
            >
              <Share2 size={24} /> EMPEZAR COMPARTIR
            </button>
          ) : (
            <>
              <button
                onClick={onChangeScreen}
                className="flex-1 min-w-[140px] bg-[var(--info)] hover:bg-[var(--info)]/90 text-white font-bold py-3 px-4 rounded-[var(--radius-md)] transition-all flex items-center justify-center gap-2 text-sm shadow-md"
              >
                <Monitor size={18} /> Cambiar Pantalla
              </button>
              <button
                onClick={onTogglePause}
                className={`flex-1 min-w-[140px] ${isPaused ? 'bg-[var(--warning)]' : 'bg-[var(--bg-muted)] text-[var(--text-main)]'} font-bold py-3 px-4 rounded-[var(--radius-md)] transition-all flex items-center justify-center gap-2 text-sm shadow-md`}
              >
                {isPaused ? <Eye size={18} /> : <EyeOff size={18} />}
                {isPaused ? "Reanudar" : "Pausar Vista"}
              </button>
              <button
                onClick={onStopSharing}
                className="flex-1 min-w-[140px] bg-[var(--error)] text-white font-bold py-3 px-4 rounded-[var(--radius-md)] transition-all hover:bg-[var(--error)]/90 flex items-center justify-center gap-2 text-sm shadow-md shadow-[var(--error)]/20"
              >
                <StopCircle size={18} /> Detener
              </button>
            </>
          )}
          <button
            onClick={onBack}
            className="bg-[var(--bg-muted)] hover:bg-[var(--bg-muted)]/80 text-[var(--text-main)] font-bold py-3 px-8 rounded-[var(--radius-md)] transition-all text-sm"
          >
            Volver
          </button>
        </div>
      </div>

      {isSharing && pendingRequests.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4 p-6 bg-[var(--success)]/5 border border-[var(--success)]/20 rounded-[var(--radius-xl)]"
        >
          <h3 className="text-[var(--text-xs)] font-bold text-[var(--success)] uppercase tracking-widest flex items-center gap-2">
            <UserPlus size={16} /> Solicitudes Pendientes ({pendingRequests.length})
          </h3>
          <div className="grid gap-4">
            {pendingRequests.map(req => (
              <div key={req.id} className="bg-[var(--bg-main)] border border-[var(--border-subtle)] p-5 rounded-[var(--radius-lg)] flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-[var(--shadow-lg)]">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-[var(--p-500)]/10 text-[var(--p-500)] rounded-full border border-[var(--p-500)]/30 flex items-center justify-center text-xl font-black">
                    {req.name.charAt(0)}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-base font-bold text-[var(--text-main)]">{req.name}</span>
                    <span className="text-[var(--text-xs)] text-[var(--text-subtle)] font-mono">ID: {req.id.substring(0, 8)}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => onApprove(req.id)}
                    className="flex-1 md:flex-none bg-[var(--success)] hover:bg-[var(--success)]/90 text-white px-8 py-3 rounded-[var(--radius-md)] text-sm font-black transition-all shadow-[var(--shadow-glow-p)]"
                  >
                    Aprobar
                  </button>
                  <button 
                    onClick={() => onDeny(req.id)}
                    className="flex-1 md:flex-none bg-[var(--bg-muted)] hover:bg-[var(--bg-muted)]/80 text-[var(--text-main)] px-6 py-3 rounded-[var(--radius-md)] text-sm font-bold transition-colors"
                  >
                    Denegar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {isSharing && participants.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1 bg-[var(--bg-soft)] border border-[var(--border-subtle)] p-6 rounded-[var(--radius-xl)]">
            <h3 className="text-[var(--text-xs)] font-bold text-[var(--text-subtle)] uppercase tracking-widest mb-6 flex items-center gap-2">
              <Users size={16} /> En Línea ({participants.length})
            </h3>
            <div className="flex flex-col gap-3">
              {participants.map(p => (
                <div key={p.id} className="flex items-center gap-3 bg-[var(--bg-main)] p-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)]/50 shadow-sm">
                  <div className="w-8 h-8 bg-[var(--p-500)]/10 rounded-full border border-[var(--p-500)]/20 flex items-center justify-center text-[var(--text-xs)] font-bold text-[var(--p-500)]">
                    {p.name.charAt(0)}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-bold text-[var(--text-main)] truncate">{p.name}</span>
                    <span className="text-[var(--text-xs)] text-[var(--success)] font-bold animate-pulse">LIVE</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="md:col-span-2 bg-[var(--bg-soft)] border border-[var(--border-subtle)] p-6 rounded-[var(--radius-xl)]">
            <h3 className="text-[var(--text-xs)] font-bold text-[var(--text-subtle)] uppercase tracking-widest mb-6 flex items-center gap-2">
              <Monitor size={16} /> Lo que están viendo
            </h3>
            <div className="relative group">
              <VideoView 
                stream={stream} 
                isPaused={isPaused} 
                isMuted={true}
                label="Monitor de salida"
                className="rounded-[var(--radius-lg)] shadow-[var(--shadow-xl)]"
                showPauseOverlay={false}
              />
              <div className="absolute inset-0 bg-transparent border-4 border-dashed border-[var(--p-500)]/10 rounded-[var(--radius-lg)] pointer-events-none" />
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};
