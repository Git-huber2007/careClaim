import { useState } from 'react';
import { Link } from 'react-router';
import { fetchApi } from '../lib/api';
import { useAccount } from '../lib/account';
import { flagLabel } from '../lib/claims';
import type { Dispute } from '../lib/claims';
import { formatCurrency, formatDate, shortId } from '../lib/format';
import { NoteForm } from './NoteForm';
import { toast } from 'sonner';

const STATUS = {
  OPEN: { label: 'Awaiting hospital', cls: 'border-amber text-amber' },
  ACCEPTED: { label: 'Hospital agreed', cls: 'border-moss text-moss' },
  REJECTED: { label: 'Hospital stands by charge', cls: 'border-ink-soft/40 text-ink-soft' }
};

interface DisputeCardProps {
  dispute: Dispute;
  /** Called with the answered dispute after the hospital responds. */
  onChanged: (dispute: Dispute) => void;
  /** Link to the claim, for lists that span claims. */
  showClaim?: boolean;
}

/**
 * One disputed bill line. The hospital that filed the claim can answer an
 * open dispute; the patient sees the answer.
 */
export function DisputeCard({ dispute, onChanged, showClaim = false }: DisputeCardProps) {
  const isPatient = useAccount().role === 'PATIENT';
  const [response, setResponse] = useState('');
  const [busy, setBusy] = useState(false);
  const status = STATUS[dispute.status] ?? STATUS.OPEN;

  const respond = async (decision: 'ACCEPTED' | 'REJECTED') => {
    if (!response.trim()) {
      toast.error('Write a short response for the patient first.');
      return;
    }
    setBusy(true);
    try {
      const { dispute: answered, charge_withdrawn } = await fetchApi(`/api/disputes/${dispute.id}/respond`, {
        method: 'POST',
        body: JSON.stringify({ status: decision, response: response.trim() })
      });
      onChanged(answered);
      // Agreeing also takes the charge off what the patient owes; say so if that part did not happen.
      if (decision === 'ACCEPTED' && !charge_withdrawn) {
        toast.warning('Your answer was saved, but the charge could not be taken off the bill automatically.');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="bg-bone p-4 rounded border border-rule text-sm space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-ink">
            <span className="font-mono text-xs text-ink-soft mr-2">Line {dispute.line_number}</span>
            {dispute.item_name}
            {dispute.flag && dispute.flag !== 'OK' && (
              <span className="ml-2 text-[10px] font-mono font-bold uppercase tracking-widest text-vermilion">{flagLabel(dispute.flag)}</span>
            )}
          </div>
          <div className="font-mono text-xs text-ink-soft mt-0.5">
            {formatCurrency(dispute.cost)} · raised {formatDate(dispute.created_at)}
            {showClaim && (
              <>
                {' · '}
                <Link to={`/claims/${dispute.claim_id}`} className="text-pine font-medium hover:underline">
                  #{shortId(dispute.claim_id)}
                </Link>
                {!isPatient && dispute.patient_id ? ` · ${dispute.patient_id}` : ''}
              </>
            )}
          </div>
        </div>
        <span className={`shrink-0 border px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-widest ${status.cls}`}>
          {status.label}
        </span>
      </div>

      <p>
        <span className="text-ink-soft">{isPatient ? 'You said: ' : 'Patient says: '}</span>
        {dispute.patient_note || 'No note added.'}
      </p>

      {dispute.hospital_response && (
        <p>
          <span className="text-ink-soft">{isPatient ? 'Hospital replied: ' : 'Your reply: '}</span>
          {dispute.hospital_response}
        </p>
      )}

      {!isPatient && dispute.status === 'OPEN' && (
        <NoteForm
          value={response}
          onChange={setResponse}
          ariaLabel="Response to the patient"
          placeholder="Explain the charge, or say how it will be corrected…"
          busy={busy}
          secondary={{ label: 'Stand by charge', onClick: () => respond('REJECTED') }}
          primary={{ label: 'Agree and correct', onClick: () => respond('ACCEPTED') }}
        />
      )}
    </li>
  );
}
