import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { flagMeta } from '../lib/flags';
import { dateTime, money, shortId } from '../lib/format';
import { Spinner } from './Icons';

const STATUS = {
  OPEN: { label: 'Awaiting hospital', cls: 'bg-amber-400/10 text-amber-300 ring-amber-400/25' },
  ACCEPTED: { label: 'Hospital agreed', cls: 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/25' },
  REJECTED: { label: 'Hospital stands by charge', cls: 'bg-sky-400/10 text-sky-300 ring-sky-400/25' },
};

/**
 * One disputed bill line. The hospital that filed the claim can answer an
 * open dispute; the patient sees the answer.
 */
export default function DisputeCard({ dispute, isPatient, onChanged, showClaim = false }) {
  const [response, setResponse] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const status = STATUS[dispute.status] ?? STATUS.OPEN;

  async function respond(decision) {
    setError('');
    if (!response.trim()) return setError('Write a short response for the patient first.');
    setBusy(decision);
    try {
      onChanged?.(await api.respondToDispute(dispute.id, { status: decision, response: response.trim() }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <li className="rounded-xl border border-white/[0.06] bg-ink-950/40 p-4" id={`dispute-${dispute.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-white">
            <span className="font-mono text-[11px] text-ink-400">Line {String(dispute.line_number).padStart(2, '0')}</span>
            {dispute.item_name}
            {dispute.flag && dispute.flag !== 'OK' && (
              <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${flagMeta(dispute.flag).chip}`}>{flagMeta(dispute.flag).label}</span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-ink-400">
            {money(dispute.cost)} · raised {dateTime(dispute.created_at)}
            {showClaim && (
              <>
                {' · '}
                <Link to={`/claims/${dispute.claim_id}`} className="font-mono text-brand-300 hover:text-brand-400">
                  #{shortId(dispute.claim_id)}
                </Link>
                {!isPatient && dispute.patient_id ? ` · ${dispute.patient_id}` : ''}
              </>
            )}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${status.cls}`}>{status.label}</span>
      </div>

      <p className="mt-3 text-sm text-ink-200">
        <span className="text-ink-400">{isPatient ? 'You said: ' : 'Patient says: '}</span>
        {dispute.patient_note || 'No note added.'}
      </p>

      {dispute.hospital_response && (
        <p className="mt-2 text-sm text-ink-200">
          <span className="text-ink-400">{isPatient ? 'Hospital replied: ' : 'Your reply: '}</span>
          {dispute.hospital_response}
        </p>
      )}

      {!isPatient && dispute.status === 'OPEN' && (
        <div className="mt-3">
          <textarea
            rows={2}
            maxLength={1000}
            className="input resize-y text-sm"
            placeholder="Explain the charge, or say how it will be corrected…"
            aria-label="Response to the patient"
            value={response}
            onChange={(e) => setResponse(e.target.value)}
          />
          {error && <p className="mt-1.5 text-xs text-rose-300">{error}</p>}
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => respond('REJECTED')} disabled={Boolean(busy)} className="btn-ghost py-2 text-xs">
              {busy === 'REJECTED' && <Spinner />} Stand by charge
            </button>
            <button type="button" onClick={() => respond('ACCEPTED')} disabled={Boolean(busy)} className="btn-primary py-2 text-xs">
              {busy === 'ACCEPTED' && <Spinner />} Agree and correct
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
