import React, { useState } from 'react';
import { Copy, Check, Info } from 'lucide-react';

interface StatusCardProps {
  status: string;
  roomId: string;
  isLive: boolean;
}

export const StatusCard: React.FC<StatusCardProps> = ({ status, roomId, isLive }) => {
  const [copied, setCopied] = useState(false);

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-[var(--bg-soft)] border border-[var(--border-subtle)] p-4 rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)]">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <h3 className="text-[var(--text-xs)] font-bold text-[var(--text-muted)] uppercase tracking-widest leading-none mb-1">Sala</h3>
            <div className="flex items-center gap-2">
              <span className="font-mono text-2xl font-black text-[var(--p-500)] tracking-tighter">{roomId || "------"}</span>
              <button 
                onClick={copyRoomId} 
                className={`p-1.5 rounded-[var(--radius-md)] transition-colors ${copied ? 'bg-[var(--success)]/10 text-[var(--success)]' : 'bg-[var(--bg-muted)] text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          </div>
          
          <div className="h-10 w-[1px] bg-[var(--border-subtle)] mx-2" />

          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${isLive ? 'bg-[var(--success)] animate-pulse shadow-[0_0_8px_var(--success)]' : 'bg-[var(--text-subtle)]'}`} />
            <div className="flex flex-col">
              <span className="text-[var(--text-xs)] font-black text-[var(--text-subtle)] uppercase leading-none mb-1">Estado</span>
              <span className="text-sm font-bold text-[var(--text-main)] truncate max-w-[120px]">{status}</span>
            </div>
          </div>
        </div>

        <div className="hidden lg:flex items-center gap-2 bg-[var(--p-500)]/5 px-3 py-1.5 rounded-full border border-[var(--p-400)]/20">
          <Info className="text-[var(--p-500)]" size={12} />
          <span className="text-[var(--text-xs)] text-[var(--text-muted)] font-medium">Usa <b>{roomId}</b> para invitar</span>
        </div>
      </div>
    </div>
  );
};
