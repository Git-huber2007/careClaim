import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AgentTerminal from '../components/AgentTerminal';
import AdjudicationSummary from '../components/AdjudicationSummary';
import StatusBadge from '../components/StatusBadge';
import { IconAlert, IconArrowLeft, IconBolt, IconFile, IconRefresh, IconShield, Spinner } from '../components/Icons';
import { api } from '../lib/api';
import { dateTime, money, shortId } from '../lib/format';

const MIN_THINKING_MS = 1800;

export default function ClaimDetailPage() {
  const { id } = useParams();
  const [claim, setClaim] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [phase, setPhase] = useState('idle'); // idle | thinking | streaming | done | error
  const [runError, setRunError] = useState('');
  const [termKey, setTermKey] = useState(0);
  const [animate, setAnimate] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const c = await api.getClaim(id);
      setClaim(c);
      if (c.ai_reasoning_log?.chain_of_thought?.length) {
        setAnimate(false);
        setPhase('done');
      }
    } catch (e) {
      setLoadError(e.message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function runAdjudication() {
    setRunError('');
    setRevealed(false);
    setPhase('thinking');
    const started = Date.now();
    try {
      const updated = await api.processClaim(id);
      const wait = MIN_THINKING_MS - (Date.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      setClaim(updated);
      setAnimate(true);
      setTermKey((k) => k + 1);
      setPhase('streaming');
    } catch (e) {
      setRunError(e.message);
      setPhase('error');
      setRevealed(Boolean(claim?.ai_reasoning_log)); // a failed re-run keeps the previous result on screen
    }
  }

  function replay() {
    setRevealed(false);
    setAnimate(true);
    setTermKey((k) => k + 1);
    setPhase('streaming');
  }

  const handleTerminalComplete = useCallback(() => {
    setPhase('done');
    setRevealed(true);
  }, []);

  const deniedLines = useMemo(
    () => new Set(revealed ? (claim?.ai_reasoning_log?.denied_items ?? []).map((d) => d.line) : []),
    [claim, revealed]
  );
  const deniedReasons = useMemo(
    () => Object.fromEntries((claim?.ai_reasoning_log?.denied_items ?? []).map((d) => [d.line, d.reason])),
    [claim]
  );

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl pt-20 text-center">
        <IconAlert className="mx-auto h-10 w-10 text-rose-300" />
        <p className="mt-3 text-lg font-semibold text-white">Unable to load claim</p>
        <p className="mt-1 text-sm text-ink-400">{loadError}</p>
        <div className="mt-6 flex justify-center gap-2">
          <Link to="/dashboard" className="btn-ghost">Back to queue</Link>
          <button onClick={load} className="btn-primary">Retry</button>
        </div>
      </div>
    );
  }

  if (!claim) {
    return (
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="skeleton h-10 w-72" />
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="skeleton h-[520px] lg:col-span-5" />
          <div className="skeleton h-[520px] lg:col-span-7" />
        </div>
      </div>
    );
  }

  const policy = claim.policies;
  const busy = phase === 'thinking' || phase === 'streaming';
  const processed = Boolean(claim.ai_reasoning_log);
  const items = claim.raw_bill_data ?? [];

  return (
    <div className="mx-auto max-w-7xl">
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 animate-fade-up">
        <div>
          <Link to="/dashboard" className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-ink-400 transition hover:text-white">
            <IconArrowLeft className="h-3.5 w-3.5" /> Claims queue
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Agentic Command Center
            </h1>
            <StatusBadge status={revealed || !busy ? claim.status : 'PENDING'} size="lg" />
          </div>
          <p className="mt-1.5 font-mono text-xs text-ink-400">
            CLAIM #{shortId(claim.id)} · submitted {dateTime(claim.created_at)}
          </p>
        </div>

        <div className="flex gap-2">
          {processed && phase === 'done' && (
            <button id="replay-reasoning" onClick={replay} className="btn-ghost">
              <IconRefresh className="h-4 w-4" /> Replay reasoning
            </button>
          )}
          <button id="run-adjudication" onClick={runAdjudication} disabled={busy} className={`btn-primary px-5 py-3 ${!busy && !processed ? 'animate-pulse-ring' : ''}`}>
            {busy ? <Spinner /> : <IconBolt className="h-4 w-4" />}
            {busy ? 'Agent running…' : processed ? 'Re-run Adjudication' : 'Run Autonomous Adjudication'}
          </button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: bill + policy */}
        <div className="space-y-6 lg:col-span-5">
          <section className="glass p-5 animate-fade-up" id="bill-details">
            <div className="mb-4 flex items-center justify-between">
              <p className="label !mb-0 flex items-center gap-1.5"><IconFile className="h-3.5 w-3.5" /> Itemized discharge bill</p>
              <span className="font-mono text-xs text-ink-400">{items.length} items</span>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-ink-950/60 p-3 ring-1 ring-white/5">
                <p className="text-[11px] uppercase tracking-wider text-ink-400">Patient</p>
                <p className="mt-0.5 font-semibold text-white">{claim.patient_id}</p>
              </div>
              <div className="rounded-xl bg-ink-950/60 p-3 ring-1 ring-white/5">
                <p className="text-[11px] uppercase tracking-wider text-ink-400">Diagnosis (ICD-10)</p>
                <p className="mt-0.5 font-mono font-semibold text-white">{claim.diagnosis_code}</p>
              </div>
            </div>

            <ul className="divide-y divide-white/5">
              {items.map((it, i) => {
                const denied = deniedLines.has(i + 1);
                return (
                  <li
                    key={i}
                    title={denied ? deniedReasons[i + 1] : undefined}
                    className={`flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-sm transition-colors duration-500 ${
                      denied ? 'bg-rose-400/[0.06]' : ''
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="font-mono text-[11px] text-ink-400">{String(i + 1).padStart(2, '0')}</span>
                      <span className={`truncate ${denied ? 'text-rose-200 line-through decoration-rose-400/60' : 'text-ink-200'}`}>{it.item_name}</span>
                    </span>
                    <span className={`tabular-nums ${denied ? 'text-rose-300' : 'text-white'}`}>{money(it.cost)}</span>
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-ink-950/60 px-4 py-3 ring-1 ring-white/5">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">Total billed</span>
              <span className="text-lg font-bold tabular-nums text-white">{money(claim.total_billed)}</span>
            </div>
          </section>

          {policy && (
            <section className="glass p-5 animate-fade-up" style={{ animationDelay: '80ms' }} id="policy-details">
              <p className="label flex items-center gap-1.5"><IconShield className="h-3.5 w-3.5" /> Policy constraints</p>
              <div className="mb-4 flex items-baseline justify-between">
                <p className="font-semibold text-white">{policy.policy_number}</p>
                <p className="text-xs text-ink-400">holder {policy.patient_id}</p>
              </div>
              <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-ink-950/60 p-3 ring-1 ring-white/5">
                  <p className="text-[11px] uppercase tracking-wider text-ink-400">Max coverage</p>
                  <p className="mt-0.5 font-semibold tabular-nums text-white">{money(policy.max_coverage_limit)}</p>
                </div>
                <div className="rounded-xl bg-ink-950/60 p-3 ring-1 ring-white/5">
                  <p className="text-[11px] uppercase tracking-wider text-ink-400">Copay</p>
                  <p className="mt-0.5 font-semibold text-white">{Number(policy.copay_percentage)}%</p>
                </div>
              </div>
              {policy.patient_id !== claim.patient_id && (
                <p className="mb-4 flex items-center gap-2 rounded-lg bg-amber-400/5 px-3 py-2 text-xs text-amber-200 ring-1 ring-amber-400/15">
                  <IconAlert className="h-4 w-4" /> Claim patient ID differs from policy holder.
                </p>
              )}
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-300/80">Covered</p>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {policy.covered_treatments.map((t) => (
                  <span key={t} className="rounded-md bg-emerald-400/10 px-2 py-0.5 text-[11px] text-emerald-200">{t}</span>
                ))}
              </div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-rose-300/80">Excluded</p>
              <div className="flex flex-wrap gap-1.5">
                {policy.excluded_treatments.map((t) => (
                  <span key={t} className="rounded-md bg-rose-400/10 px-2 py-0.5 text-[11px] text-rose-200">{t}</span>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Right: terminal + summary */}
        <div className="space-y-6 lg:col-span-7">
          <div className="h-[540px]">
            <AgentTerminal
              key={termKey}
              phase={phase}
              lines={claim.ai_reasoning_log?.chain_of_thought ?? []}
              animate={animate}
              error={runError}
              onComplete={handleTerminalComplete}
            />
          </div>
          {revealed && processed && <AdjudicationSummary claim={claim} />}
        </div>
      </div>
    </div>
  );
}
