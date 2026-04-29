import React from 'react';
import { ArrowRight } from 'lucide-react';

interface ModeSelectionProps {
  roomId: string;
  setRoomId: (id: string) => void;
  onShare: () => void;
  onWatch: () => void;
}

export const ModeSelection: React.FC<ModeSelectionProps> = ({ roomId, setRoomId, onShare, onWatch }) => {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '70vh', padding: '24px 16px',
    }}>
      <div style={{
        width: '100%', maxWidth: '380px',
        background: 'var(--bg-soft)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-xl)',
        padding: '28px 28px',
        display: 'flex', flexDirection: 'column', gap: '18px',
      }}>
        {/* Title */}
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>
            mira
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '6px' }}>
            Ingresa el código para ver la pantalla
          </p>
        </div>

        {/* Input */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-subtle)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
            CÓDIGO DE SALA
          </label>
          <input
            id="room-id"
            type="text"
            value={roomId}
            onChange={(e) => {
              const val = (e.target.value || '').toUpperCase().slice(0, 5);
              setRoomId(val);
              if (val.length === 5) onWatch();
            }}
            autoFocus
            placeholder="XXXXX"
            style={{
              width: '100%', height: '52px',
              background: 'var(--bg-main)',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-md)',
              padding: '0 16px',
              fontSize: '22px', fontFamily: 'var(--font-mono)',
              fontWeight: 700, color: 'var(--energy)',
              letterSpacing: '6px', textAlign: 'center',
              outline: 'none',
            }}
          />
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            id="btn-watch"
            onClick={onWatch}
            disabled={!roomId}
            style={{
              flex: 1, height: '48px',
              background: roomId ? 'var(--energy)' : 'var(--bg-muted)',
              color: roomId ? '#fff' : 'var(--text-subtle)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              fontWeight: 700, fontSize: '14px',
              cursor: roomId ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}
          >
            UNIRSE <ArrowRight size={16} />
          </button>

          <button
            id="btn-share"
            onClick={onShare}
            style={{
              height: '48px', padding: '0 18px',
              background: 'var(--bg-muted)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-md)',
              fontWeight: 600, fontSize: '12px',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            NUEVO ID
          </button>
        </div>

        {/* Créditos sutiles */}
        <div style={{ 
          marginTop: '2px', 
          textAlign: 'center', 
          fontSize: '11px', 
          color: 'var(--text-subtle)',
          lineHeight: '1.6'
        }}>
          Creado por <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>Dev. Jose Luis Mamani C.</span><br />
          Organización: <span style={{ fontWeight: 800, color: 'var(--energy)', letterSpacing: '0.5px' }}>NEXTAPPCODE</span>
        </div>
      </div>
    </div>
  );
};
