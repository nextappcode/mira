import React from 'react';
import { Share2 } from 'lucide-react';

interface HeaderProps {
  isConnected: boolean;
  onHomeClick: () => void;
  roomId?: string;
  status?: string;
  isLive?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ isConnected, onHomeClick, roomId, status }) => {
  return (
    <header
      style={{
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-soft)',
        height: '56px',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: '12px',
      }}
    >
      {/* Logo */}
      <button
        onClick={onHomeClick}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-main)', minHeight: 0, padding: '4px 6px',
        }}
      >
        <Share2 size={16} color="var(--energy)" />
        <span style={{ fontWeight: 700, fontSize: '15px', letterSpacing: '-0.3px' }}>mira</span>
      </button>

      <div style={{ flex: 1 }} />

      {/* Room ID badge & Status */}
      {roomId && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {status && (
            <span style={{ fontSize: '10px', color: 'var(--text-subtle)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>
              {status}
            </span>
          )}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: 'var(--bg-muted)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-md)',
            padding: '2px 10px',
          }}>
            <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-subtle)', letterSpacing: '1px', textTransform: 'uppercase' }}>
              SALA
            </span>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '22px', fontWeight: 700,
              color: 'var(--energy)',
              letterSpacing: '2px',
              lineHeight: 1,
            }}>
              {roomId}
            </span>
          </div>
        </div>
      )}

      {/* Online indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{
          width: '7px', height: '7px', borderRadius: '50%',
          background: isConnected ? 'var(--success)' : 'var(--error)',
        }} />
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '1px' }}>
          {isConnected ? 'ONLINE' : 'OFFLINE'}
        </span>
      </div>
    </header>
  );
};
