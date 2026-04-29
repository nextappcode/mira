import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Play, Pause, Volume2, VolumeX, Maximize, X } from 'lucide-react';
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
  // The video fills the entire screen as soon as access is granted.
  // This is intentionally decoupled from `isFullscreen` (browser API state)
  // because many Smart TV browsers don't reliably fire fullscreenchange events.
  const isConnected = accessStatus === 'granted';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="w-full flex flex-col lg:grid lg:grid-cols-12 gap-5 lg:h-[75vh]"
    >
      {/* ── FULLSCREEN VIDEO OVERLAY (shown when connected) ── */}
      {isConnected && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100%',
            height: '100%',
            zIndex: 2147483647,
            backgroundColor: '#000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          className="group"
        >
          {/* Video fills the entire fixed container */}
          <div
            ref={videoContainerRef}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          >
            <VideoView
              stream={remoteStream}
              isPaused={isPaused}
              isMuted={isMuted}
              label={status || 'Esperando señal...'}
              className="w-full h-full"
              onFramesVerified={onFramesVerified}
              showPauseOverlay={false}
            />
          </div>

          {/* Pause overlay */}
          <AnimatePresence>
            {isPaused && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{ position: 'absolute', inset: 0, zIndex: 10 }}
                className="flex flex-col items-center justify-center bg-black/70 backdrop-blur-xl"
              >
                <div className="w-20 h-20 bg-[var(--warning)]/20 rounded-full flex items-center justify-center mb-6 border border-[var(--warning)]/30">
                  <Pause className="text-[var(--warning)] w-10 h-10" />
                </div>
                <h3 className="text-2xl font-black text-white mb-2 uppercase italic">Pausado</h3>
              </motion.div>
            )}

            {/* Manual play overlay (needed for autoplay policy on some TVs) */}
            {status.includes('Conectado') && !hasValidFrames && !isPaused && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{ position: 'absolute', inset: 0, zIndex: 20 }}
                className="flex flex-col items-center justify-center bg-black/90 backdrop-blur-md"
              >
                <button
                  onClick={onManualPlay}
                  className="w-28 h-28 bg-[var(--p-500)] rounded-full flex items-center justify-center shadow-[var(--shadow-glow-p)] hover:scale-110 transition-transform animate-pulse"
                >
                  <Play className="text-white w-14 h-14 ml-2 fill-current" />
                </button>
                <p className="text-[var(--p-500)] font-black mt-6 text-xl tracking-widest uppercase">
                  Sintonizar
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Floating HUD — visible on hover / focus */}
          <div
            style={{ position: 'absolute', inset: 0, zIndex: 30, pointerEvents: 'none' }}
            className="flex flex-col justify-between p-5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-t from-black/70 via-transparent to-black/70"
          >
            {/* Top bar: status */}
            <div className="flex justify-between items-start" style={{ pointerEvents: 'auto' }}>
              <div className="bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-[10px] font-black text-white uppercase flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${status.includes('Conectado') ? 'bg-[var(--success)] animate-pulse' : 'bg-gray-500'}`} />
                {status}
              </div>
            </div>

            {/* Bottom bar: controls */}
            <div className="flex justify-between items-end" style={{ pointerEvents: 'auto' }}>
              {/* Leave button */}
              <button
                onClick={onLeave}
                className="bg-[var(--error)]/20 hover:bg-[var(--error)] border border-[var(--error)]/40 text-[var(--error)] hover:text-white px-4 py-2 rounded-xl font-black text-[11px] uppercase tracking-wider flex items-center gap-2 transition-all"
              >
                <X size={14} /> Salir
              </button>

              {/* Audio / fullscreen controls */}
              <div className="flex gap-2">
                {hasAudio && (
                  <button
                    onClick={onToggleMute}
                    title={isMuted ? 'Activar sonido' : 'Silenciar'}
                    className={`p-2.5 rounded-lg border border-white/10 ${isMuted ? 'bg-[var(--error)] text-white' : 'bg-white/10 text-white'}`}
                  >
                    {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  </button>
                )}
                <button
                  onClick={onToggleFullscreen}
                  title="Pantalla completa"
                  className="bg-white/10 p-2.5 rounded-lg border border-white/10 text-white hover:bg-[var(--p-500)] hover:text-black transition-all"
                >
                  <Maximize size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── NORMAL LAYOUT (shown while joining / not yet connected) ── */}
      {/* Left Column: Video preview while waiting */}
      <div className="lg:col-span-9 flex flex-col shadow-2xl rounded-[var(--radius-xl)] overflow-hidden bg-black border border-[var(--border-subtle)] relative group">
        <div
          ref={isConnected ? undefined : videoContainerRef}
          className="w-full h-full relative"
        >
          <VideoView
            stream={remoteStream}
            isPaused={isPaused}
            isMuted={isMuted}
            label={status || 'Esperando señal...'}
            className="w-full h-full aspect-video"
            onFramesVerified={onFramesVerified}
            showPauseOverlay={false}
          />
        </div>
      </div>

      {/* Right Column: Signal Info & Action Buttons */}
      <div className="lg:col-span-3 flex flex-col gap-3">
        <div className="bg-[var(--bg-soft)] border border-[var(--border-subtle)] p-4 rounded-3xl shadow-[var(--shadow-md)] flex flex-col gap-4">
          {/* Section 1: Tuner */}
          <div className="flex flex-col gap-2">
            <label className="text-[9px] font-black text-[var(--text-subtle)] uppercase tracking-[0.25em] ml-1">
              Sintonizador
            </label>
            <div className="flex items-center gap-1.5 bg-[var(--bg-main)] p-1.5 rounded-2xl border border-[var(--border-subtle)]">
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                placeholder="ID"
                disabled={accessStatus === 'requesting'}
                className="bg-transparent border-none px-2 py-0.5 font-mono text-lg font-black text-[var(--energy)] focus:outline-none w-20 text-center tracking-widest disabled:opacity-50"
              />
              <button
                onClick={onJoin}
                disabled={accessStatus === 'requesting'}
                className="flex-1 bg-[var(--energy)] hover:bg-[var(--energy-hover)] disabled:grayscale text-white font-black h-10 rounded-xl transition-all text-[11px] flex items-center justify-center tracking-tighter"
              >
                {accessStatus === 'requesting' ? '...' : 'UNIRSE'}
              </button>
            </div>
          </div>

          {/* Section 2: Status */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest px-1">
              Señal
            </span>
            <div
              className={`py-2 px-3 rounded-xl border flex items-center gap-2.5 ${
                accessStatus === 'granted'
                  ? 'bg-[var(--success)]/10 border-[var(--success)]/20'
                  : 'bg-white/5 border-white/5'
              }`}
            >
              <ShieldCheck
                size={14}
                className={accessStatus === 'granted' ? 'text-[var(--success)]' : 'text-[var(--text-subtle)]'}
              />
              <span
                className={`text-[10px] font-black leading-none ${
                  accessStatus === 'granted' ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'
                }`}
              >
                {accessStatus === 'granted'
                  ? 'AUTORIZADO'
                  : accessStatus === 'requesting'
                  ? 'VERIFICANDO...'
                  : 'PENDIENTE'}
              </span>
            </div>
          </div>

          <div className="h-[1px] bg-[var(--border-subtle)] opacity-50 my-1" />

          {/* Section 3: Actions */}
          <div className="flex flex-col gap-2">
            <button
              onClick={onLeave}
              className="w-full h-11 bg-[var(--error)]/10 hover:bg-[var(--error)] text-[var(--error)] hover:text-white border border-[var(--error)]/20 font-black rounded-xl transition-all flex items-center justify-center gap-2 text-[11px] uppercase tracking-wider shadow-sm"
            >
              <X size={14} /> DESCONECTAR
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
