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
    <div className="flex flex-col gap-3">
      <div className="bg-[var(--bg-soft)] border border-[var(--border-subtle)] p-6 rounded-[var(--radius-xl)] shadow-[var(--shadow-sm)]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex flex-col gap-1">
            <h3 className="text-[var(--text-xs)] font-bold text-[var(--text-muted)] uppercase tracking-widest">Estado de Sala</h3>
            <div className="flex items-center gap-3">
              <span className="font-mono text-3xl font-black text-[var(--p-500)] tracking-tighter">{roomId || "------"}</span>
              <button 
                onClick={copyRoomId} 
                className={`p-2 rounded-[var(--radius-md)] transition-colors ${copied ? 'bg-[var(--success)]/10 text-[var(--success)]' : 'bg-[var(--bg-muted)] text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                title="Copiar ID de sala"
              >
                {copied ? <Check size={20} /> : <Copy size={20} />}
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-4 bg-[var(--bg-main)]/50 px-5 py-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] shadow-inner">
            <div className={`w-3 h-3 rounded-full ${isLive ? 'bg-[var(--success)] animate-pulse shadow-[0_0_12px_var(--success)]' : 'bg-[var(--text-subtle)]'}`} />
            <div className="flex flex-col">
              <span className="text-[var(--text-xs)] font-bold text-[var(--text-subtle)] uppercase">Conexión</span>
              <span className="text-[var(--text-base)] font-bold text-[var(--text-main)]">{status}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[var(--p-500)]/5 border border-[var(--p-400)]/20 p-4 rounded-[var(--radius-lg)] flex items-center gap-3 shadow-[var(--shadow-xs)]">
        <div className="w-8 h-8 rounded-full bg-[var(--p-500)]/10 flex items-center justify-center border border-[var(--p-500)]/20">
          <Info className="text-[var(--p-500)]" size={16} />
        </div>
        <p className="text-[var(--text-sm)] text-[var(--text-muted)] leading-relaxed">
          Comparte el código <b>{roomId}</b> con quien deba ver tu pantalla. Solo se podrán unir quienes autorices.
        </p>
      </div>
    </div>
  );
};
