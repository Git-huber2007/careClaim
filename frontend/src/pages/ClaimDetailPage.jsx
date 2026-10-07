import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AgentTerminal from '../components/AgentTerminal';
import AdjudicationSummary from '../components/AdjudicationSummary';
import DisputeCard from '../components/DisputeCard';
import PatientBillReport from '../components/PatientBillReport';
import StatusBadge from '../components/StatusBadge';
import { IconAlert, IconArrowLeft, IconBolt, IconClock, IconFile, IconFlag, IconRefresh, IconShield, Spinner } from '../components/Icons';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { flagMeta, lineItemsOf } from '../lib/flags';
import { dateTime, money, shortId } from '../lib/format';

const MIN_THINKING_MS = 1800;

export default function ClaimDetailPage() {
  const { id } = useParams();
  const { profile } = useAuth();
  // Patients get a plain-language report instead of the agent terminal.
  const isPatient = profile?.role === 'PATIENT';
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
        if (isPatient) setRevealed(true); // no terminal to finish streaming first
      }
    } catch (e) {
      setLoadError(e.message);
    }
  }, [id, isPatient]);

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
      if (isPatient) {
        setPhase('done');
        setRevealed(true);
        return;
      }
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

  // line number → { flag, reason } for every line that is not OK
  const flagged = useMemo(
    () => new Map(revealed ? lineItemsOf(claim).filter((l) => l.flag !== 'OK').map((l) => [l.line, l]) : []),
    [claim, revealed]
  );

  const upsertDispute = useCallback((dispute) => {
    setClaim((c) => {
      const rest = (c.disputes ?? []).filter((d) => d.id !== dispute.id);
      return { ...c, disputes: [...rest, dispute].sort((a, b) => a.line_number - b.line_number) };
    });
  }, []);

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl pt-20 text-center">
        <IconAlert className="mx-auto h-10 w-10 text-rose-300" />
        <p className="mt-3 text-lg font-semibold text-white">Unable to load {isPatient ? 'bill' : 'claim'}</p>
        <p className="mt-1 text-sm text-ink-400">{loadError}</p>
        <div className="mt-6 flex justify-center gap-2">
          <Link to="/dashboard" className="btn-ghost">{isPatient ? 'Back to my bills' : 'Back to queue'}</Link>
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
  const disputes = claim.disputes ?? [];
  // A patient can only run the agent on a bill they entered themselves.
  const canRun = !isPatient || claim.source === 'PATIENT';
  // The API withholds coverage details of a policy that is not the patient's own.
  const policyHidden = Boolean(policy) && !policy.covered_treatments;

  const runLabel = isPatient
    ? busy ? 'Checking…' : processed ? 'Re-check bill' : 'Check this bill'
    : busy ? 'Agent running…' : processed ? 'Re-run Adjudication' : 'Run Autonomous Adjudication';

  return (
    <div className="mx-auto max-w-7xl">
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 animate-fade-up">
        <div>
          <Link to="/dashboard" className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-ink-400 transition hover:text-white">
            <IconArrowLeft className="h-3.5 w-3.5" /> {isPatient ? 'My bills' : 'Claims queue'}
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-white">
              {isPatient ? 'Bill Check' : 'Agentic Command Center'}
            </h1>
            <StatusBadge status={revealed || !busy ? claim.status : 'PENDING'} size="lg" />
          </div>
          <p className="mt-1.5 font-mono text-xs text-ink-400">
            {isPatient ? 'BILL' : 'CLAIM'} #{shortId(claim.id)} · submitted {dateTime(claim.created_at)}
            {isPatient && ` · ${claim.source === 'PATIENT' ? 'entered by you' : 'filed by the hospital'}`}
          </p>
        </div>

        <div className="flex gap-2">
          {!isPatient && processed && phase === 'done' && (
            <button id="replay-reasoning" onClick={replay} className="btn-ghost">
              <IconRefresh className="h-4 w-4" /> Replay reasoning
            </button>
          )}
          {canRun && (
            <button id="run-adjudication" onClick={runAdjudication} disabled={busy} className={`btn-primary px-5 py-3 ${!busy && !processed ? 'animate-pulse-ring' : ''}`}>
              {busy ? <Spinner /> : <IconBolt className="h-4 w-4" />}
              {runLabel}
            </button>
          )}
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
                const hit = flagged.get(i + 1);
                const meta = hit && flagMeta(hit.flag);
                return (
                  <li
                    key={i}
                    title={hit?.reason || undefined}
                    className={`flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-sm transition-colors duration-500 ${
                      hit ? 'bg-rose-400/[0.06]' : ''
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="font-mono text-[11px] text-ink-400">{String(i + 1).padStart(2, '0')}</span>
                      {/* The hospital view strikes a denied line out of the payout; a patient is still being charged for it. */}
                      <span className={`truncate ${hit ? `text-rose-200 ${isPatient ? '' : 'line-through decoration-rose-400/60'}` : 'text-ink-200'}`}>{it.item_name}</span>
                      {hit && <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${meta.chip}`}>{meta.label}</span>}
                    </span>
                    <span className={`tabular-nums ${hit ? 'text-rose-300' : 'text-white'}`}>{money(it.cost)}</span>
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-ink-950/60 px-4 py-3 ring-1 ring-white/5">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">Total billed</span>
              <span className="text-lg font-bold tabular-nums text-white">{money(claim.total_billed)}</span>
            </div>
          </section>

          {policyHidden && (
            <p className="glass flex items-start gap-2 p-4 text-xs text-amber-200 animate-fade-up" id="policy-mismatch">
              <IconAlert className="h-4 w-4 shrink-0" />
              <span>
                This claim was filed against policy <span className="font-mono">{policy.policy_number}</span>, which is not linked to your
                account. Ask the hospital to confirm which policy it used.
              </span>
            </p>
          )}

          {policy && !policyHidden && (
            <section className="glass p-5 animate-fade-up" style={{ animationDelay: '80ms' }} id="policy-details">
              <p className="label flex items-center gap-1.5"><IconShield className="h-3.5 w-3.5" /> {isPatient ? 'Your policy' : 'Policy constraints'}</p>
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

        {/* Right: patient report, or terminal + summary for the hospital */}
        {isPatient ? (
          <div className="space-y-6 lg:col-span-7">
            {phase === 'thinking' && (
              <div className="glass flex items-center gap-3 p-6 text-sm text-ink-200" role="status">
                <Spinner className="h-5 w-5" /> Checking every line against your policy and the reference prices…
              </div>
            )}
            {phase === 'error' && (
              <p className="glass flex items-start gap-2 p-4 text-sm text-rose-200" role="alert">
                <IconAlert className="h-4 w-4 shrink-0" /> The check could not be completed: {runError}
              </p>
            )}
            {!processed && phase === 'idle' && (
              <div className="glass flex items-start gap-3 p-6 text-sm text-ink-200">
                <IconClock className="h-5 w-5 shrink-0 text-amber-300" />
                {canRun
                  ? 'This bill has not been checked yet. Press “Check this bill” to see what your insurer pays and which charges are worth questioning.'
                  : 'The hospital has filed this claim but has not run the insurance check yet. The result appears here once it does.'}
              </div>
            )}
            {revealed && processed && <PatientBillReport claim={claim} onDisputed={upsertDispute} />}
          </div>
        ) : (
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
            {disputes.length > 0 && (
              <section className="glass p-6 animate-fade-up" id="claim-disputes">
                <p className="label flex items-center gap-1.5"><IconFlag className="h-3.5 w-3.5" /> Patient disputes ({disputes.length})</p>
                <ul className="space-y-2">
                  {disputes.map((d) => (
                    <DisputeCard key={d.id} dispute={d} onChanged={upsertDispute} />
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
