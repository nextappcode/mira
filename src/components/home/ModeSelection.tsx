import React from 'react';
import { motion } from 'motion/react';
import { Sparkles, ArrowRight, Hash } from 'lucide-react';

interface ModeSelectionProps {
  roomId: string;
  setRoomId: (id: string) => void;
  onShare: () => void;
  onWatch: () => void;
}

export const ModeSelection: React.FC<ModeSelectionProps> = ({ roomId, setRoomId, onShare, onWatch }) => {
  return (
    <div className="flex items-center justify-center min-h-[70vh] px-4 py-12">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[520px] bg-[var(--bg-soft)] border border-[var(--border-subtle)] p-8 md:p-12 rounded-[48px] shadow-[var(--shadow-premium)] relative overflow-hidden"
      >
        {/* Decorative background effects */}
        <div className="absolute -top-32 -right-32 w-80 h-80 bg-[var(--energy)]/5 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-[var(--p-500)]/5 blur-[120px] rounded-full pointer-events-none" />

        <div className="relative z-10">
          <header className="mb-12">
            <h1 className="text-5xl font-black tracking-tighter text-[var(--text-main)] font-heading mb-6 leading-tight">
              Bienvenido
            </h1>
            <p className="text-[var(--text-muted)] leading-relaxed text-lg font-medium opacity-80">
              Crea una sala o únete a una existente para comenzar a transmitir video y pantalla en tiempo real.
            </p>
          </header>

          <div className="space-y-10">
            <div className="space-y-4">
              <label 
                htmlFor="room-id" 
                className="text-[var(--text-xs)] font-black text-[var(--text-subtle)] uppercase tracking-[0.25em] ml-1 flex items-center gap-2"
              >
                <Hash size={14} className="text-[var(--energy)]" /> ID DE LA SALA
              </label>
              <div className="relative group">
                <input
                  id="room-id"
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                  placeholder="Ingresa el ID de la sala"
                  className="w-full h-20 bg-[var(--bg-main)] border-2 border-[var(--border-subtle)] rounded-3xl px-8 text-2xl font-black text-[var(--text-main)] tracking-[0.1em] transition-all focus:outline-none focus:border-[var(--energy)]/50 focus:ring-8 focus:ring-[var(--energy)]/5 placeholder:text-[var(--text-subtle)]/30 placeholder:tracking-normal group-hover:border-[var(--border-strong)] shadow-inner"
                />
                {roomId && (
                  <button 
                    onClick={() => setRoomId("")}
                    className="absolute right-6 top-1/2 -translate-y-1/2 text-[var(--text-subtle)] hover:text-[var(--energy)] transition-colors p-2"
                    title="Borrar código"
                  >
                    Borrar
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-5">
              <button
                onClick={onShare}
                className="h-16 bg-[var(--bg-muted)] hover:bg-[var(--border-strong)] text-[var(--text-main)] font-black rounded-[20px] transition-all active:scale-[0.97] flex items-center justify-center gap-2 border border-[var(--border-subtle)] hover:shadow-lg"
              >
                Generar ID
              </button>
              <button
                onClick={onWatch}
                autoFocus
                disabled={!roomId}
                className="h-16 bg-[var(--energy)] hover:bg-[var(--energy-hover)] disabled:grayscale disabled:opacity-30 text-white font-black rounded-[20px] transition-all shadow-[0_12px_24px_-6px_var(--energy-glow)] active:scale-[0.97] flex items-center justify-center gap-2 relative overflow-hidden group"
              >
                <span className="relative z-10 flex items-center gap-2 text-lg">
                  Unirse <ArrowRight size={22} className="group-hover:translate-x-1.5 transition-transform" />
                </span>
                <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            </div>
          </div>

          <footer className="mt-12 pt-10 border-t border-[var(--border-subtle)]/40 flex justify-between items-center opacity-60">
             <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--success)] animate-pulse" />
                <span className="text-[var(--text-xs)] font-bold tracking-widest uppercase">Sistema P2P Activo</span>
             </div>
             <span className="text-[var(--text-xs)] font-bold tracking-widest uppercase">v2.4.0</span>
          </footer>
        </div>
      </motion.div>
    </div>
  );
};
