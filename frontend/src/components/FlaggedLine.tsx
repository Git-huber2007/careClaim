import { useEffect, useRef, useState } from 'react';
import { fetchApi } from '../lib/api';
import { flagLabel, isSuspicious } from '../lib/claims';
import type { Dispute, LineDecision } from '../lib/claims';
import { formatCurrency } from '../lib/format';
import { NoteForm } from './NoteForm';
import { toast } from 'sonner';

interface FlaggedLineProps {
  claimId: string;
  line: LineDecision;
  /** The viewer is the patient on a claim a hospital filed, so there is someone to answer. */
  canDispute: boolean;
  disputed: boolean;
  onDisputed: (dispute: Dispute) => void;
  /** Whether the dispute note form is showing; the page owns this so the rate inspector can open it too. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** One bill line the agent did not pass as OK; a patient can question a suspicious one. */
export function FlaggedLine({ claimId, line, canDispute, disputed, onDisputed, open, onOpenChange }: FlaggedLineProps) {
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const suspicious = isSuspicious(line.flag);

  // The form may have been opened from elsewhere on the page; bring it into view.
  useEffect(() => {
    if (open) box.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [open]);

  const submit = async () => {
    setSending(true);
    try {
      const { dispute } = await fetchApi(`/api/claims/${claimId}/disputes`, {
        method: 'POST',
        body: JSON.stringify({ line_number: line.line, note: note.trim() || undefined })
      });
      onDisputed(dispute);
      onOpenChange(false);
      toast.success('Dispute sent to the hospital');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div ref={box} className={`p-3 rounded border text-sm ${suspicious ? 'bg-vermilion/10 text-vermilion border-vermilion/20' : 'bg-amber/10 text-amber border-amber/20'}`}>
      <div className="flex justify-between gap-3 font-bold">
        <span>{line.item_name} · {flagLabel(line.flag)}</span>
        <span className={`font-mono shrink-0 ${line.waived ? 'line-through opacity-60' : ''}`}>{formatCurrency(line.cost)}</span>
      </div>
      <div className="text-ink-soft mt-1">{line.reason}</div>
      {line.waived && (
        <div className="mt-1 text-xs font-medium text-moss">The hospital withdrew this charge. It is no longer owed.</div>
      )}

      {canDispute && suspicious && !line.waived && (
        <div className="mt-2">
          {disputed ? (
            <p className="text-xs text-ink-soft">You disputed this charge. The hospital's answer appears below.</p>
          ) : !open ? (
            <button
              type="button"
              onClick={() => onOpenChange(true)}
              className="border border-vermilion/40 bg-paper hover:bg-vermilion/10 rounded px-3 py-1.5 text-xs font-medium transition-colors"
            >
              Dispute this charge
            </button>
          ) : (
            <NoteForm
              value={note}
              onChange={setNote}
              ariaLabel={`Note for the dispute on ${line.item_name}`}
              placeholder="Optional: tell the hospital why you are questioning this charge"
              busy={sending}
              secondary={{ label: 'Cancel', onClick: () => onOpenChange(false) }}
              primary={{ label: sending ? 'Sending...' : 'Send to hospital', onClick: submit }}
            />
          )}
        </div>
      )}
    </div>
  );
}
