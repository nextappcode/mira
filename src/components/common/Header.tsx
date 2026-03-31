import React from 'react';
import { Share2 } from 'lucide-react';

interface HeaderProps {
  isConnected: boolean;
  onHomeClick: () => void;
  roomId?: string;
  status?: string;
  isLive?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ isConnected, onHomeClick, roomId, status, isLive }) => {
  return (
    <header className="px-6 border-b border-[var(--border-subtle)] backdrop-blur-md sticky top-0 z-50 h-16 bg-[var(--bg-main)]/80">
      <div className="flex justify-between items-center h-full">
        {/* Logo Section */}
        <div className="flex items-center gap-3 cursor-pointer group" onClick={onHomeClick}>
          <div className="w-9 h-9 bg-[var(--p-500)] rounded-lg flex items-center justify-center shadow-lg shadow-[var(--p-500)]/20 group-hover:rotate-12 transition-transform">
            <Share2 className="text-[var(--bg-main)] w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-main)] font-heading">mira</h1>
        </div>

        {/* Dynamic Status Section */}
        <div className="flex items-center gap-4">
          {roomId && (
            <div 
              className="flex items-center justify-center bg-[var(--energy)]/10 rounded-xl border-2 border-[var(--energy)]/30 shadow-[var(--shadow-glow-p)] relative"
              style={{ padding: '8px 24px' }}
            >
              <div className="flex items-center justify-center" style={{ gap: '14px' }}>
                <span className="text-[11px] font-black text-[var(--energy)] uppercase tracking-[0.2em] m-0 leading-none">CÓDIGO SALA</span>
                <span className="font-mono text-2xl font-black text-[var(--energy)] tracking-tighter leading-none m-0">{roomId}</span>
              </div>
            </div>
          )}

          <div className="h-8 w-[1px] bg-[var(--border-subtle)] mx-1" />

          <div className="flex items-center gap-2 text-[var(--text-xs)] font-mono text-[var(--text-muted)] bg-[var(--bg-soft)] px-3 py-1.5 rounded-full border border-[var(--border-subtle)] shadow-sm">
            <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-[var(--success)] animate-pulse shadow-[0_0_8px_var(--success)]' : 'bg-[var(--error)]'}`} />
            <span className="text-[9px] font-black tracking-widest">{isConnected ? 'SISTEMA ONLINE' : 'OFFLINE'}</span>
          </div>
        </div>
      </div>
    </header>
  );
};
