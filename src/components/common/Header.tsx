import React from 'react';
import { Share2 } from 'lucide-react';

interface HeaderProps {
  isConnected: boolean;
  onHomeClick: () => void;
  roomId?: string;
  status?: string;
  isLive?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ isConnected, onHomeClick, roomId }) => {
  return (
    <header
      style={{
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-soft)',
        height: '48px',
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

      {/* Room ID badge */}
      {roomId && (
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '13px', fontWeight: 700,
          color: 'var(--energy)',
          background: 'var(--bg-muted)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-sm)',
          padding: '2px 10px',
          letterSpacing: '2px',
        }}>
          {roomId}
        </span>
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
