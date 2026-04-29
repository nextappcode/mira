import React from 'react';
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
  // ╔══════════════════════════════════════════════════════════════════════════╗
  // ║  🔒 LOCKED — VIDEO FULLSCREEN EXPANSION                                 ║
  // ║  When the watcher is connected (accessStatus === 'granted'), the video   ║
  // ║  ALWAYS occupies the full screen via position:fixed + inset:0.          ║
  // ║                                                                          ║
  // ║  THIS IS INTENTIONALLY DECOUPLED from the browser Fullscreen API state  ║
  // ║  (isFullscreen). Many Smart TV browsers (WebOS / Tizen) enter native    ║
  // ║  fullscreen but never fire 'fullscreenchange', so isFullscreen can be   ║
  // ║  false even when the browser chrome is hidden.                           ║
  // ║                                                                          ║
  // ║  Rules:                                                                  ║
  // ║    • Use inline style={{ }} — NOT Tailwind classes — for the key        ║
  // ║      layout properties so they are never purged by the build tool.      ║
  // ║    • Keep zIndex at 2147483647 (max) so nothing can render on top.      ║
  // ║    • DO NOT replace this block with a conditional CSS class.            ║
  // ║    • DO NOT move the trigger condition away from accessStatus.           ║
  // ╚══════════════════════════════════════════════════════════════════════════╝
  // This is intentionally decoupled from `isFullscreen` (browser API state)
  // because many Smart TV browsers don't reliably fire fullscreenchange events.
  const isConnected = accessStatus === 'granted';

  return (
    <div style={{ width: '100%' }}>
      {/* ── 🔒 LOCKED: FULLSCREEN VIDEO OVERLAY (shown when connected) ── */}
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

          {/* Pause overlay — minimal */}
          {isPaused && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 10,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.75)',
            }}>
              <Pause size={48} color="#d97706" />
              <p style={{ color: '#d97706', fontWeight: 700, fontSize: '18px', marginTop: '16px', letterSpacing: '3px', textTransform: 'uppercase' }}>
                Pausado
              </p>
            </div>
          )}

          {/* Manual play overlay — minimal, needed for autoplay policy on some TVs */}
          {status.includes('Conectado') && !hasValidFrames && !isPaused && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 20,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.9)',
            }}>
              <button
                onClick={onManualPlay}
                style={{
                  width: '80px', height: '80px', borderRadius: '50%',
                  background: 'var(--energy)', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Play size={36} color="#fff" fill="#fff" style={{ marginLeft: '4px' }} />
              </button>
              <p style={{ color: 'var(--energy)', fontWeight: 700, fontSize: '14px', marginTop: '16px', letterSpacing: '3px', textTransform: 'uppercase' }}>
                Sintonizar
              </p>
            </div>
          )}

          {/* HUD — visible on hover, minimal */}
          <div
            style={{
              position: 'absolute', inset: 0, zIndex: 30,
              pointerEvents: 'none',
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              padding: '16px',
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 25%, transparent 75%, rgba(0,0,0,0.5) 100%)',
              opacity: 0,
              transition: 'opacity 0.2s',
            }}
            className="group-hover:opacity-100"
          >
            {/* Top: status */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', pointerEvents: 'auto' }}>
              <div style={{
                background: 'rgba(0,0,0,0.6)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 'var(--radius-sm)',
                padding: '4px 10px',
                display: 'flex', alignItems: 'center', gap: '6px',
              }}>
                <div style={{
                  width: '6px', height: '6px', borderRadius: '50%',
                  background: status.includes('Conectado') ? 'var(--success)' : '#555',
                }} />
                <span style={{ color: '#fff', fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}>
                  {status}
                </span>
              </div>
            </div>

            {/* Bottom: controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', pointerEvents: 'auto' }}>
              <button
                onClick={onLeave}
                style={{
                  background: 'rgba(220,38,38,0.2)',
                  border: '1px solid rgba(220,38,38,0.4)',
                  color: '#f87171', borderRadius: 'var(--radius-md)',
                  padding: '6px 14px', fontWeight: 700, fontSize: '11px',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                  textTransform: 'uppercase', letterSpacing: '1px',
                }}
              >
                <X size={12} /> Salir
              </button>

              <div style={{ display: 'flex', gap: '8px' }}>
                {hasAudio && (
                  <button
                    onClick={onToggleMute}
                    title={isMuted ? 'Activar sonido' : 'Silenciar'}
                    style={{
                      background: isMuted ? 'var(--error)' : 'rgba(255,255,255,0.1)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 'var(--radius-md)',
                      padding: '8px', cursor: 'pointer', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                  </button>
                )}
                <button
                  onClick={onToggleFullscreen}
                  title="Pantalla completa"
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 'var(--radius-md)',
                    padding: '8px', cursor: 'pointer', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Maximize size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ── END OF 🔒 LOCKED BLOCK ── */}

      {/* ── NORMAL LAYOUT (shown while joining / not yet connected) ── */}
      {!isConnected && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 260px',
          gap: '16px',
          height: '75vh',
        }}>
          {/* Video placeholder */}
          <div style={{
            background: '#000',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
          }}>
            <div ref={videoContainerRef} style={{ width: '100%', height: '100%' }}>
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
          </div>

          {/* Join panel */}
          <div style={{
            background: 'var(--bg-soft)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: '20px 16px',
            display: 'flex', flexDirection: 'column', gap: '16px',
          }}>
            {/* Tuner section */}
            <div>
              <p style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-subtle)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '8px' }}>
                Sintonizador
              </p>
              <div style={{
                display: 'flex', gap: '6px',
                background: 'var(--bg-main)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-md)',
                padding: '6px',
              }}>
                <input
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                  placeholder="ID"
                  disabled={accessStatus === 'requesting'}
                  style={{
                    background: 'none', border: 'none', outline: 'none',
                    fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 700,
                    color: 'var(--energy)', letterSpacing: '4px',
                    textAlign: 'center', width: '80px',
                  }}
                />
                <button
                  onClick={onJoin}
                  disabled={accessStatus === 'requesting'}
                  style={{
                    flex: 1, height: '38px',
                    background: accessStatus === 'requesting' ? 'var(--bg-muted)' : 'var(--energy)',
                    color: '#fff', border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    fontWeight: 700, fontSize: '11px', cursor: 'pointer',
                    letterSpacing: '1px',
                  }}
                >
                  {accessStatus === 'requesting' ? '...' : 'UNIRSE'}
                </button>
              </div>
            </div>

            {/* Status badge */}
            <div>
              <p style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-subtle)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '6px' }}>
                Señal
              </p>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                background: accessStatus === 'granted' ? 'rgba(22,163,74,0.1)' : 'var(--bg-muted)',
                border: `1px solid ${accessStatus === 'granted' ? 'rgba(22,163,74,0.3)' : 'var(--border-subtle)'}`,
              }}>
                <ShieldCheck size={14} color={accessStatus === 'granted' ? 'var(--success)' : 'var(--text-subtle)'} />
                <span style={{
                  fontSize: '11px', fontWeight: 700,
                  color: accessStatus === 'granted' ? 'var(--success)' : 'var(--text-muted)',
                  letterSpacing: '0.5px',
                }}>
                  {accessStatus === 'granted' ? 'AUTORIZADO' : accessStatus === 'requesting' ? 'VERIFICANDO...' : 'PENDIENTE'}
                </span>
              </div>
            </div>

            <div style={{ height: '1px', background: 'var(--border-subtle)' }} />

            {/* Leave button */}
            <button
              onClick={onLeave}
              style={{
                width: '100%', height: '40px',
                background: 'rgba(220,38,38,0.08)',
                border: '1px solid rgba(220,38,38,0.2)',
                color: 'var(--error)',
                borderRadius: 'var(--radius-md)',
                fontWeight: 700, fontSize: '11px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                textTransform: 'uppercase', letterSpacing: '1px',
              }}
            >
              <X size={14} /> Desconectar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
