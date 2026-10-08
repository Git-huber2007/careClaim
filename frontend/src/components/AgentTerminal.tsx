import { useEffect, useRef } from 'react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

export interface TerminalEvent {
  /** ms since the run started; absent on a log replayed from a saved claim */
  ts?: number;
  event: 'stage_start' | 'stage_end' | 'log' | 'result' | 'error';
  data: any;
}

export function AgentTerminal({ events, isProcessing }: { events: TerminalEvent[], isProcessing: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length]);

  const lines = events.filter(e => e.event === 'log');
  // Nothing has run yet: a short box with a hint, not a tall empty one.
  const idle = lines.length === 0 && !isProcessing;

  return (
    <div
      className={cn(
        "theme-fixed bg-term-bg rounded-lg border border-pine-deep/50 overflow-hidden flex flex-col",
        "h-[clamp(20rem,calc(100dvh-13rem),38rem)]"
      )}
    >
      {/* Terminal Header */}
      <div className="h-8 shrink-0 border-b border-pine-deep/30 flex items-center px-4 justify-between bg-ink">
        <span className="text-[11px] font-mono font-bold text-term-dim tracking-wider">
          {isProcessing ? '● ADJUDICATING' : 'LOG'}
        </span>
        <div className="text-[11px] font-mono text-term-dim uppercase tracking-wider">
          Reasoning log
        </div>
      </div>

      {/* Terminal Body */}
      <div
        ref={scrollRef}
        role="log"
        aria-label="Adjudication log"
        className="flex-1 min-h-0 overflow-y-auto term-scrollbar p-4 font-mono text-[13px] leading-relaxed"
      >
        {idle && (
          <div className="h-full flex items-center justify-center text-center p-6 text-term-dim text-xs">
            Nothing has run yet. The reasoning appears here, line by line.
          </div>
        )}
        {lines.map((evt, idx) => (
          <TerminalLine key={idx} line={evt.data?.message || ''} ts={evt.ts} index={idx} />
        ))}
        {isProcessing && (
          <div className="flex items-center gap-2 mt-2 text-phosphor">
            <span className="animate-pulse">_</span>
          </div>
        )}
      </div>
    </div>
  );
}

function TerminalLine({ line, ts, index }: { line: string, ts?: number, index: number }) {
  const formatTs = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const msRemainder = ms % 1000;
    const ds = Math.floor(msRemainder / 100);
    return `[${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}.${ds}]`;
  };
  const prefix = ts === undefined ? `[${(index + 1).toString().padStart(3, '0')}]` : formatTs(ts);

  // The backend's lines are "[SYS] …", "[VERIFIER] …" and the agent's own
  // free text, and the page adds "[ERR] …" when a run fails; one tone per
  // line, most severe first.
  const isError = line.startsWith('[ERR]');
  const isVerifier = line.startsWith('[VERIFIER]');
  const isWarning = !isError && /⚠|WARNING|OVERRIDE/.test(line);
  const isDenial = !isError && !isWarning && !isVerifier && /✗|NOT_COVERED|not covered|DUPLICATE|OVERPRICED|UNBUNDLED|UNRELATED|\b(flagging|denied|denying|rejecting|excluded|mismatch)\b/i.test(line);
  const isOk = !isError && !isWarning && !isDenial && (line.includes('✓') || (!isVerifier && /\b(covered|approved)\b/i.test(line)));
  const isMath = !isError && !isWarning && !isDenial && !isOk && (line.includes('Σ') || isVerifier);

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "py-0.5 hover:bg-pine-deep/40 transition-colors flex gap-3",
        isError && "text-term-deny font-bold",
        isWarning && "text-amber",
        isDenial && "text-term-deny",
        isOk && "text-term-ok",
        isMath && "text-phosphor font-bold",
        !isError && !isWarning && !isDenial && !isOk && !isMath && "text-bone/80"
      )}
    >
      <span className="text-term-dim shrink-0">{prefix}</span>
      <span className="min-w-0 break-words">{line}</span>
    </motion.div>
  );
}
