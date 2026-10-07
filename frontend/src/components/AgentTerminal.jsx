import { useEffect, useRef, useState } from 'react';

const BOOT_SEQUENCE = [
  '[SYS] Verifying Supabase JWT… authorized',
  '[SYS] Fetching claim record from PostgreSQL…',
  '[SYS] Resolving linked insurance policy constraints…',
  '[SYS] Opening secure channel to Gemini adjudication model…',
  '[AGENT] Ingesting itemized bill and diagnosis context…',
  '[AGENT] Cross-referencing line items against coverage matrix…',
  '[AGENT] Running anomaly & overcharge heuristics…',
];

/** Decide the color of a terminal line based on its content. */
function classify(line) {
  const l = line.toLowerCase();
  if (l.startsWith('[error]')) return 'text-term-red';
  if (l.startsWith('[verifier]')) return l.includes('⚠') || l.includes('warning') ? 'text-term-amber' : 'text-iris-400';
  if (l.startsWith('[sys]')) return 'text-term-cyan/80';
  if (/(reject|denied|deny|excluded|not covered|fraud|mismatch|flag|overcharg|duplicate)/.test(l)) return 'text-term-red';
  if (/(final|decision|payout|approved amount|status:)/.test(l)) return 'text-white font-semibold';
  if (/(covered|approved|eligible|valid|match)/.test(l)) return 'text-term-green';
  return 'text-term-dim';
}

const pauseFor = (line) => {
  const l = line.toLowerCase();
  if (l.startsWith('[sys]')) return 120;
  if (/(reject|denied|fraud|final)/.test(l)) return 420;
  return 200 + Math.random() * 160;
};

const STATUS = {
  idle: { label: 'IDLE', cls: 'text-ink-400', dot: 'bg-ink-400' },
  thinking: { label: 'REASONING', cls: 'text-term-amber', dot: 'bg-term-amber animate-pulse' },
  streaming: { label: 'STREAMING', cls: 'text-term-green', dot: 'bg-term-green animate-pulse' },
  done: { label: 'COMPLETE', cls: 'text-brand-300', dot: 'bg-brand-300' },
  error: { label: 'FAULT', cls: 'text-term-red', dot: 'bg-term-red' },
};

/**
 * AgentTerminal
 * Renders the agent's chain_of_thought line-by-line with artificial delay
 * (setTimeout) and a fast typewriter effect, simulating live reasoning.
 *
 * Remount via `key` to replay.
 */
export default function AgentTerminal({ phase = 'idle', lines = [], animate = true, error, onComplete }) {
  const [bootCount, setBootCount] = useState(0);
  const [shown, setShown] = useState(animate ? 0 : lines.length);
  const [typed, setTyped] = useState(0);
  const bodyRef = useRef(null);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Boot sequence while waiting on the backend
  useEffect(() => {
    if (phase !== 'thinking') return;
    setBootCount(0);
    let i = 0;
    let t;
    const tick = () => {
      i += 1;
      setBootCount(i);
      if (i < BOOT_SEQUENCE.length) t = setTimeout(tick, 650 + Math.random() * 400);
    };
    t = setTimeout(tick, 150);
    return () => clearTimeout(t);
  }, [phase]);

  // Line-by-line streaming of the chain of thought
  useEffect(() => {
    if (phase !== 'streaming' && phase !== 'done') return;
    if (shown >= lines.length) {
      if (!completedRef.current) {
        completedRef.current = true;
        onCompleteRef.current?.();
      }
      return;
    }
    const line = lines[shown];
    const t =
      typed < line.length
        ? setTimeout(() => setTyped((c) => Math.min(line.length, c + 3)), 9)
        : setTimeout(() => {
            setShown((s) => s + 1);
            setTyped(0);
          }, pauseFor(line));
    return () => clearTimeout(t);
  }, [phase, lines, shown, typed]);

  // Auto-scroll
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [bootCount, shown, typed, phase]);

  const status = STATUS[phase] ?? STATUS.idle;
  const streaming = (phase === 'streaming' || phase === 'done') && shown < lines.length;
  const progress = lines.length ? Math.round((shown / lines.length) * 100) : 0;

  return (
    <section
      id="agent-terminal"
      aria-label="Agent Terminal"
      className="relative flex h-full min-h-[480px] flex-col overflow-hidden rounded-2xl border border-term-green/15 bg-black shadow-[0_0_60px_-15px_rgba(74,222,128,0.25)]"
    >
      {/* Title bar */}
      <header className="flex items-center justify-between border-b border-white/[0.06] bg-[#07090c] px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          </div>
          <span className="font-mono text-xs text-ink-400">careclaim-agent — adjudication.log</span>
        </div>
        <div className="flex items-center gap-3">
          {streaming && (
            <button
              id="terminal-skip"
              onClick={() => { setShown(lines.length); setTyped(0); }}
              className="font-mono text-[11px] text-ink-400 transition hover:text-white cursor-pointer"
            >
              skip ⏭
            </button>
          )}
          <span className={`flex items-center gap-1.5 font-mono text-[11px] font-bold tracking-widest ${status.cls}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
            {status.label}
          </span>
        </div>
      </header>

      {/* Progress */}
      <div className="h-0.5 bg-white/[0.03]">
        <div
          className="h-full bg-gradient-to-r from-term-green to-brand-300 transition-all duration-300"
          style={{ width: phase === 'thinking' ? `${Math.min(90, (bootCount / BOOT_SEQUENCE.length) * 90)}%` : phase === 'idle' ? '0%' : `${progress}%` }}
        />
      </div>

      {/* Body */}
      <div ref={bodyRef} className="relative flex-1 overflow-y-auto p-5 font-mono text-[13px] leading-6">
        {/* CRT effects */}
        <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(255,255,255,0.025)_0px,rgba(255,255,255,0.025)_1px,transparent_1px,transparent_3px)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-term-green/[0.04] to-transparent animate-scan" />

        <p className="text-term-green/60">CareClaim AI Agent Runtime v1.0 — autonomous adjudication shell</p>
        <p className="mb-3 text-term-green/40">────────────────────────────────────────────────────────</p>

        {phase === 'idle' && (
          <p className="text-term-green">
            <span className="text-brand-300">agent@careclaim</span>:<span className="text-iris-400">~</span>$ awaiting instruction — press “Run Autonomous Adjudication”
            <Cursor />
          </p>
        )}

        {phase === 'thinking' && (
          <>
            <p className="text-term-green"><span className="text-brand-300">agent@careclaim</span>:<span className="text-iris-400">~</span>$ adjudicate --autonomous</p>
            {BOOT_SEQUENCE.slice(0, bootCount).map((l, i) => (
              <Line key={i} n={i + 1} text={l} cls={classify(l)} />
            ))}
            <p className="mt-1 flex items-center gap-2 text-term-amber">
              <BrailleSpinner /> Gemini agent is reasoning…
            </p>
          </>
        )}

        {(phase === 'streaming' || phase === 'done') && (
          <>
            <p className="text-term-green"><span className="text-brand-300">agent@careclaim</span>:<span className="text-iris-400">~</span>$ cat reasoning.log</p>
            {lines.slice(0, shown).map((l, i) => (
              <Line key={i} n={i + 1} text={l} cls={classify(l)} />
            ))}
            {shown < lines.length && (
              <Line n={shown + 1} text={lines[shown].slice(0, typed)} cls={classify(lines[shown])} cursor />
            )}
            {shown >= lines.length && (
              <p className="mt-2 text-term-green">
                <span className="text-brand-300">agent@careclaim</span>:<span className="text-iris-400">~</span>$ <Cursor />
              </p>
            )}
          </>
        )}

        {phase === 'error' && (
          <>
            <p className="text-term-green"><span className="text-brand-300">agent@careclaim</span>:<span className="text-iris-400">~</span>$ adjudicate --autonomous</p>
            <Line n={1} text={`[ERROR] ${error || 'Adjudication failed.'}`} cls="text-term-red" />
            <Line n={2} text="[SYS] No changes were persisted; the claim keeps its previous state." cls="text-term-cyan/80" />
            <p className="mt-2 text-term-green"><span className="text-brand-300">agent@careclaim</span>:<span className="text-iris-400">~</span>$ <Cursor /></p>
          </>
        )}
      </div>
    </section>
  );
}

function Line({ n, text, cls, cursor }) {
  return (
    <div className="flex gap-3 animate-fade-up" style={{ animationDuration: '0.25s' }}>
      <span className="w-6 shrink-0 select-none text-right text-ink-600">{String(n).padStart(2, '0')}</span>
      <span className={`whitespace-pre-wrap break-words ${cls}`}>
        {text}
        {cursor && <Cursor />}
      </span>
    </div>
  );
}

const Cursor = () => <span className="ml-0.5 inline-block h-4 w-2 translate-y-0.5 bg-term-green animate-blink" />;

function BrailleSpinner() {
  const frames = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % frames.length), 80);
    return () => clearInterval(t);
  }, []);
  return <span className="inline-block w-3">{frames[i]}</span>;
}
