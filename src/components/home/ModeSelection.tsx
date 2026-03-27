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
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[440px] bg-[var(--bg-soft)] border border-[var(--border-subtle)] p-8 md:p-10 rounded-[40px] shadow-[var(--shadow-premium)] relative overflow-hidden"
      >
        {/* Decorative background effects */}
        <div className="absolute -top-32 -right-32 w-80 h-80 bg-[var(--energy)]/5 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-[var(--p-500)]/5 blur-[120px] rounded-full pointer-events-none" />

        <div className="relative z-10">
          <header className="mb-8">
            <h1 className="text-4xl font-black tracking-tighter text-[var(--text-main)] font-heading mb-4 leading-tight">
              Bienvenido
            </h1>
            <p className="text-[var(--text-muted)] leading-relaxed text-sm font-medium opacity-80">
              Crea una sala o únete a una para transmitir video en tiempo real.
            </p>
          </header>

          <div className="space-y-8">
            <div className="space-y-3">
              <label 
                htmlFor="room-id" 
                className="text-[10px] font-black text-[var(--text-subtle)] uppercase tracking-[0.25em] ml-1 flex items-center gap-2"
              >
                <Hash size={12} className="text-[var(--energy)]" /> ID DE LA SALA
              </label>
              <div className="relative group">
                <input
                  id="room-id"
                  type="text"
                  value={roomId}
                  onChange={(e) => {
                    const val = (e.target.value || "").toUpperCase().slice(0, 5);
                    setRoomId(val);
                    if (val.length === 5) {
                       onWatch();
                    }
                  }}
                  autoFocus
                  placeholder="Ingresa el ID"
                  className="w-full h-16 bg-[var(--bg-main)] border-2 border-[var(--border-subtle)] rounded-2xl px-6 text-xl font-black text-[var(--text-main)] tracking-[0.1em] transition-all focus:outline-none focus:border-[var(--energy)]/50 focus:ring-8 focus:ring-[var(--energy)]/10 placeholder:text-[var(--text-subtle)]/30 group-hover:border-[var(--border-strong)] shadow-inner"
                />
                {roomId && (
                  <button 
                    onClick={() => setRoomId("")}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-subtle)] hover:text-[var(--energy)] transition-colors p-2 text-xs font-bold"
                  >
                    Borrar
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-5 gap-3">
              <button
                onClick={onWatch}
                autoFocus
                disabled={!roomId}
                className="col-span-3 h-14 bg-[var(--energy)] hover:bg-[var(--energy-hover)] disabled:grayscale disabled:opacity-20 text-white font-black rounded-2xl transition-all shadow-[var(--shadow-glow-p)] active:scale-[0.98] flex items-center justify-center gap-2 group border border-white/10"
              >
                UNIRSE <ArrowRight size={20} className="group-hover:translate-x-1.5 transition-transform" />
              </button>

              <button
                onClick={onShare}
                title="Generar ID"
                className="col-span-2 h-14 bg-[var(--bg-muted)] hover:bg-[var(--border-strong)] text-[var(--text-main)] font-black rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 border border-[var(--border-subtle)] hover:shadow-lg group text-[10px] tracking-tight"
              >
                <Sparkles size={16} className="text-[var(--energy)]" />
                NUEVO ID
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
