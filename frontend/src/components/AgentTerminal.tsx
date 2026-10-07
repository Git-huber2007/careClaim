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

  return (
    <div className="bg-term-bg rounded-lg border border-pine-deep/50 overflow-hidden flex flex-col h-[500px]">
      {/* Terminal Header */}
      <div className="h-8 border-b border-pine-deep/30 flex items-center px-4 justify-between bg-ink">
        <div className="flex gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-ink-soft/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-ink-soft/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-ink-soft/50" />
        </div>
        <div className="text-[10px] font-mono text-ink-soft uppercase tracking-wider">
          AGENT_TERMINAL // CareClaim OS
        </div>
      </div>

      {/* Terminal Body */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto term-scrollbar p-4 font-mono text-[13px] leading-relaxed"
      >
        {events.filter(e => e.event === 'log').map((evt, idx) => (
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
  // free text; one tone per line, most severe first.
  const isVerifier = line.startsWith('[VERIFIER]');
  const isWarning = /⚠|WARNING|OVERRIDE/.test(line);
  const isDenial = !isWarning && !isVerifier && /✗|NOT_COVERED|not covered|DUPLICATE|OVERPRICED|UNBUNDLED|UNRELATED|\b(flagging|denied|denying|rejecting|excluded|mismatch)\b/i.test(line);
  const isOk = !isWarning && !isDenial && (line.includes('✓') || (!isVerifier && /\b(covered|approved)\b/i.test(line)));
  const isMath = !isWarning && !isDenial && !isOk && (line.includes('Σ') || isVerifier);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "py-0.5 hover:bg-pine-deep/40 transition-colors flex gap-3",
        isWarning && "text-amber",
        isDenial && "text-vermilion",
        isOk && "text-moss",
        isMath && "text-phosphor font-bold",
        !isWarning && !isDenial && !isOk && !isMath && "text-bone/80"
      )}
    >
      <span className="text-ink-soft shrink-0">{prefix}</span>
      <span className="break-words">{line}</span>
    </motion.div>
  );
}
