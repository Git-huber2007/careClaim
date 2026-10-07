import { useState } from 'react';
import DisputeCard from './DisputeCard';
import { api } from '../lib/api';
import { flagMeta, isSuspicious, lineItemsOf } from '../lib/flags';
import { money } from '../lib/format';
import { IconAlert, IconCheck, IconFlag, Spinner } from './Icons';

/**
 * PatientBillReport
 * The patient's reading of an adjudicated bill: what the insurer pays, what
 * they pay, and which charges are worth questioning. Flagged lines on a
 * hospital-filed claim can be disputed from here.
 */
export default function PatientBillReport({ claim, onDisputed }) {
  const lines = lineItemsOf(claim);
  const b = claim.ai_reasoning_log?.breakdown ?? {};
  const disputes = claim.disputes ?? [];
  const disputedLines = new Set(disputes.map((d) => d.line_number));
  // A bill the patient entered themselves has no hospital account behind it.
  const canDispute = claim.source === 'HOSPITAL';

  const suspicious = lines.filter((l) => isSuspicious(l.flag));
  const notCovered = lines.filter((l) => l.flag === 'NOT_COVERED');
  const sum = (items) => items.reduce((s, l) => s + Number(l.cost || 0), 0);
  const flaggedTotal = b.flagged_total ?? sum(suspicious);
  const youPay = b.patient_payable ?? Math.max(0, Number(claim.total_billed) - Number(claim.approved_amount || 0));

  const tiles = [
    { label: 'Total billed', value: claim.total_billed, tone: 'text-white' },
    { label: 'Insurer pays', value: claim.approved_amount, tone: 'text-emerald-300' },
    { label: 'You pay', value: youPay, tone: 'text-amber-300' },
    { label: 'Flagged for review', value: flaggedTotal, tone: flaggedTotal ? 'text-rose-300' : 'text-ink-300' },
  ];

  const yourShare = [
    { label: `Your copay (${b.copay_percentage ?? 0}%)`, value: b.copay_amount },
    { label: 'Not covered by your policy', value: b.not_covered_total ?? sum(notCovered) },
    { label: 'Charges flagged for review', value: flaggedTotal },
    { label: 'Above your policy limit', value: b.cap_reduction },
  ].filter((r) => Number(r.value) > 0);

  return (
    <section id="patient-bill-report" className="space-y-6 animate-fade-up">
      <div className="glass p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-xl bg-ink-950/60 p-3 ring-1 ring-white/5">
              <p className="text-[11px] uppercase tracking-wider text-ink-400">{t.label}</p>
              <p className={`mt-1 text-xl font-bold tabular-nums ${t.tone}`}>{money(t.value)}</p>
            </div>
          ))}
        </div>

        {yourShare.length > 0 && (
          <div className="mt-5">
            <p className="label">Why you pay {money(youPay)}</p>
            <dl className="space-y-2 text-sm">
              {yourShare.map((r) => (
                <div key={r.label} className="flex items-center justify-between">
                  <dt className="text-ink-300">{r.label}</dt>
                  <dd className="tabular-nums font-medium text-white">{money(r.value)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>

      <div className="glass p-6">
        <p className="label flex items-center gap-1.5"><IconFlag className="h-3.5 w-3.5" /> Charges worth questioning</p>
        {suspicious.length === 0 ? (
          <p className="flex items-center gap-2 rounded-xl bg-emerald-400/5 p-3 text-sm text-emerald-200 ring-1 ring-emerald-400/15">
            <IconCheck className="h-4 w-4 shrink-0" /> No duplicate, overpriced, unbundled or unrelated charges were found on this bill.
          </p>
        ) : (
          <>
            <ul className="space-y-2">
              {suspicious.map((l) => (
                <FlaggedLine
                  key={l.line}
                  claimId={claim.id}
                  line={l}
                  canDispute={canDispute}
                  disputed={disputedLines.has(l.line)}
                  onDisputed={onDisputed}
                />
              ))}
            </ul>
            <p className="mt-4 flex items-start gap-2 text-xs text-ink-400">
              <IconAlert className="h-4 w-4 shrink-0" />
              <span>
                A flag means the charge is worth asking about. It is not proof that the hospital did anything wrong.
                {!canDispute && ' You entered this bill yourself, so take the flagged lines to the hospital billing desk and ask for an explanation.'}
              </span>
            </p>
          </>
        )}
      </div>

      {notCovered.length > 0 && (
        <div className="glass p-6">
          <p className="label">Not covered by your policy</p>
          <p className="mb-3 text-xs text-ink-400">These are genuine charges that your policy does not pay for, so they are yours to pay.</p>
          <ul className="space-y-2">
            {notCovered.map((l) => (
              <li key={l.line} className="rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-amber-100">{l.item_name}</span>
                  <span className="tabular-nums text-amber-300">{money(l.cost)}</span>
                </div>
                {l.reason && <p className="mt-1 text-xs text-ink-300">{l.reason}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {disputes.length > 0 && (
        <div className="glass p-6">
          <p className="label">Your disputes on this bill</p>
          <ul className="space-y-2">
            {disputes.map((d) => (
              <DisputeCard key={d.id} dispute={d} isPatient />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function FlaggedLine({ claimId, line, canDispute, disputed, onDisputed }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const meta = flagMeta(line.flag);

  async function submit() {
    setError('');
    setBusy(true);
    try {
      onDisputed(await api.createDispute(claimId, { line_number: line.line, note: note.trim() || undefined }));
      setOpen(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-xl border border-rose-400/15 bg-rose-400/[0.04] p-3">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="flex min-w-0 flex-wrap items-center gap-2 font-medium text-rose-100">
          <span className="font-mono text-[11px] text-ink-400">{String(line.line).padStart(2, '0')}</span>
          {line.item_name}
          <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${meta.chip}`}>{meta.label}</span>
        </span>
        <span className="tabular-nums text-rose-300">{money(line.cost)}</span>
      </div>
      <p className="mt-1 text-xs text-ink-300">{line.reason || meta.meaning}</p>

      {canDispute && (
        <div className="mt-2.5">
          {disputed ? (
            <p className="text-xs font-medium text-ink-400">You disputed this charge. The hospital&rsquo;s answer appears below.</p>
          ) : !open ? (
            <button type="button" id={`dispute-line-${line.line}`} onClick={() => setOpen(true)} className="btn-ghost py-1.5 text-xs">
              Dispute this charge
            </button>
          ) : (
            <div>
              <textarea
                rows={2}
                maxLength={1000}
                className="input resize-y text-sm"
                placeholder="Optional: tell the hospital why you are questioning this charge"
                aria-label={`Note for the dispute on ${line.item_name}`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              {error && <p className="mt-1.5 text-xs text-rose-300">{error}</p>}
              <div className="mt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} disabled={busy} className="btn-ghost py-1.5 text-xs">Cancel</button>
                <button type="button" onClick={submit} disabled={busy} className="btn-primary py-1.5 text-xs">
                  {busy && <Spinner />} Send to hospital
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
