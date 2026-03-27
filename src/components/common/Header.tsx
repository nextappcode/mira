import React from 'react';
import { Share2 } from 'lucide-react';

interface HeaderProps {
  isConnected: boolean;
  onHomeClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({ isConnected, onHomeClick }) => {
  return (
    <header className="p-4 border-b border-[var(--border-subtle)] backdrop-blur-md sticky top-0 z-50 flex justify-between items-center h-16 bg-[var(--bg-main)]/80">
      <div className="flex items-center gap-3 cursor-pointer" onClick={onHomeClick}>
        <div className="w-10 h-10 bg-[var(--p-500)] rounded-xl flex items-center justify-center shadow-lg shadow-[var(--p-500)]/20">
          <Share2 className="text-[var(--bg-main)] w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-main)] font-heading">mira</h1>
      </div>
      <div className="flex items-center gap-2 text-[var(--text-xs)] font-mono text-[var(--text-muted)] bg-[var(--bg-soft)] px-4 py-2 rounded-full border border-[var(--border-subtle)]">
        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-[var(--success)] animate-pulse shadow-[0_0_8px_var(--success)]' : 'bg-[var(--error)]'}`} />
        {isConnected ? 'SISTEMA ONLINE' : 'CONECTANDO...'}
      </div>
    </header>
  );
};
