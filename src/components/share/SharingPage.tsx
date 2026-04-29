import React from 'react';
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

const btn = (extra?: React.CSSProperties): React.CSSProperties => ({
  width: '100%', height: '36px', borderRadius: 'var(--radius-md)',
  fontWeight: 700, fontSize: '12px', cursor: 'pointer',
  border: '1px solid var(--border-strong)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
  background: 'var(--bg-muted)', color: 'var(--text-main)',
  ...extra,
});

export const SharingPage: React.FC<SharingPageProps> = ({
  roomId, isSharing, status, isPaused, localVideoRef, stream,
  pendingRequests, participants, onStartSharing, onStopSharing,
  onTogglePause, onChangeScreen, onApprove, onDeny, onBack
}) => {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 260px',
      gap: '16px',
      height: '75vh',
      width: '100%',
    }}>
      {/* Left: video preview */}
      <div style={{
        background: 'var(--bg-soft)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        position: 'relative',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <VideoView
            stream={stream}
            isPaused={isPaused}
            isMuted={true}
            label="Vista previa"
            className="w-full h-full"
          />
          {!isSharing && (
            <div style={{
              position: 'absolute', bottom: '12px', left: '12px', right: '12px',
              background: 'rgba(37,99,235,0.15)',
              border: '1px solid rgba(37,99,235,0.3)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 14px',
              fontSize: '11px', fontWeight: 600,
              color: '#93c5fd',
              display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              <Info size={14} />
              Activa "Compartir audio" al iniciar para transmitir sonido.
            </div>
          )}
        </div>
      </div>

      {/* Right: controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', paddingRight: '4px' }}>

        {/* Controls */}
        <div style={{
          background: 'var(--bg-soft)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: '10px 14px',
          display: 'flex', flexDirection: 'column', gap: '6px',
          flexShrink: 0,
        }}>
          <p style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-subtle)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '2px' }}>
            Controles
          </p>

          {!isSharing ? (
            <button onClick={onStartSharing} style={btn({ background: 'var(--energy)', color: '#fff', border: 'none', height: '44px', fontSize: '13px' })}>
              <Share2 size={16} /> INICIAR
            </button>
          ) : (
            <>
              <button onClick={onChangeScreen} style={btn()}>
                <Monitor size={14} /> Cambiar pantalla
              </button>
              <button onClick={onTogglePause} style={btn(isPaused ? { background: 'var(--warning)', color: '#000', border: 'none' } : {})}>
                {isPaused ? <Eye size={14} /> : <EyeOff size={14} />}
                {isPaused ? 'Reanudar' : 'Pausar'}
              </button>
              <button onClick={onStopSharing} style={btn({ background: 'var(--error)', color: '#fff', border: 'none' })}>
                <StopCircle size={14} /> Detener
              </button>
            </>
          )}

          <button onClick={onBack} style={{ 
            width: '100%',
            height: '32px',
            background: 'rgba(255,255,255,0.03)', 
            border: '1px solid var(--border-subtle)', 
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-subtle)', 
            fontSize: '9px', 
            fontWeight: 600,
            cursor: 'pointer', 
            marginTop: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            ← Volver al inicio
          </button>
        </div>

        {/* Pending requests */}
        {isSharing && pendingRequests.length > 0 && (
          <div style={{
            background: 'var(--bg-soft)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: '10px 14px',
            display: 'flex', flexDirection: 'column', gap: '6px',
            flexShrink: 0,
          }}>
            <p style={{ fontSize: '9px', fontWeight: 700, color: 'var(--success)', letterSpacing: '1px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <UserPlus size={12} /> Solicitudes ({pendingRequests.length})
            </p>
            {pendingRequests.map(req => (
              <div key={req.id} style={{
                background: 'var(--bg-muted)',
                borderRadius: 'var(--radius-md)',
                padding: '10px 12px',
                display: 'flex', flexDirection: 'column', gap: '8px',
              }}>
                <span style={{ fontSize: '12px', fontWeight: 600 }}>{req.name}</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => onApprove(req.id)} style={{ flex: 1, height: '32px', background: 'var(--success)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}>
                    ACEPTAR
                  </button>
                  <button onClick={() => onDeny(req.id)} style={{ flex: 1, height: '32px', background: 'var(--bg-main)', color: 'var(--text-muted)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}>
                    NO
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Participants */}
        {isSharing && participants.length > 0 && (
          <div style={{
            background: 'var(--bg-soft)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: '10px 14px',
            flexShrink: 0,
          }}>
            <p style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-subtle)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Users size={12} /> En línea ({participants.length})
            </p>
            {participants.map(p => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '6px 0',
                borderBottom: '1px solid var(--border-subtle)',
              }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--bg-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: 'var(--energy)' }}>
                  {p.name.charAt(0)}
                </div>
                <span style={{ fontSize: '12px', flex: 1 }}>{p.name}</span>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--success)' }} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
