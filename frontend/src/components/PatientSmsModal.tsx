import { Check, Copy, X } from 'lucide-react';
import { useState } from 'react';
import { formatCurrency, shortId } from '../lib/format';
import { approvedDisplay, patientPayable } from '../lib/claims';
import { toast } from 'sonner';

interface PatientSmsModalProps {
  claim: any;
  onClose: () => void;
}

const HEADLINE: Record<string, string> = {
  APPROVED: 'Cashless Claim Approved',
  PARTIAL: 'Claim Partly Approved',
  DENIED: 'Claim Not Approved'
};

/** A preview of the text message a patient would get about an adjudicated claim. Nothing is sent. */
export function PatientSmsModal({ claim, onClose }: PatientSmsModalProps) {
  const [copied, setCopied] = useState(false);
  const denied = claim.status === 'DENIED';

  const messageText = [
    '[CareClaim Claim Update]',
    `Claim: #${shortId(claim.id)}`,
    // A bill the patient checked themselves has no hospital behind it.
    claim.hospital_org ? `Hospital: ${claim.hospital_org}` : null,
    `Patient ID: ${claim.patient_id}`,
    '',
    `Total billed: ${formatCurrency(claim.total_billed)}`,
    `Insurer pays: ${approvedDisplay(claim)}`,
    `You pay: ${formatCurrency(patientPayable(claim))}`,
    `Status: ${claim.status}`,
    '',
    denied
      ? 'The insurer has not approved this claim. Please speak to the hospital billing desk.'
      : `Clearance code: CC-${shortId(claim.id).toUpperCase()}\nShow this message at the hospital billing desk.`
  ]
    .filter(line => line !== null)
    .join('\n');

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(messageText);
      setCopied(true);
      toast.success('Message text copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy. Select the text and copy it by hand.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true" aria-label="Patient message preview" className="bg-paper border border-rule w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="p-4 border-b border-rule flex justify-between items-center bg-bone">
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-pine-deep font-bold">Patient Message Preview</div>
            <div className="text-[11px] text-ink-soft">A simulated SMS / WhatsApp alert. Nothing is sent.</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-ink-soft hover:text-ink p-1 rounded hover:bg-rule/40 transition-colors cursor-pointer">
            <X size={16} />
          </button>
        </div>

        {/* Smartphone mockup */}
        <div className="p-6 bg-bone/50 flex justify-center">
          <div className="w-full max-w-[280px] bg-black rounded-[32px] p-3 shadow-inner border-4 border-neutral-800">
            <div className="flex justify-between items-center px-3 pt-1 pb-2 text-[10px] text-white/70 font-mono">
              <span>9:41</span>
              <div className="w-16 h-3.5 bg-neutral-900 rounded-full" />
              <span>5G ▮</span>
            </div>

            <div className="bg-neutral-900/90 rounded-t-xl p-2.5 text-center border-b border-neutral-800">
              <div className="w-7 h-7 bg-pine rounded-full text-bone mx-auto flex items-center justify-center text-xs font-serif font-bold">CC</div>
              <div className="text-white text-xs font-medium mt-1">CARECLAIM</div>
            </div>

            <div className="bg-neutral-950 p-3 rounded-b-xl space-y-2 min-h-[260px] flex flex-col justify-end">
              <div className="bg-neutral-800 text-white p-3 rounded-2xl rounded-tl-sm text-[11px] leading-relaxed shadow-sm space-y-1.5">
                <div className={`font-bold ${denied ? 'text-vermilion' : claim.status === 'PARTIAL' ? 'text-amber' : 'text-phosphor'}`}>
                  {HEADLINE[claim.status] ?? 'Claim Update'}
                </div>
                <div className="text-white/90 text-[10px] leading-normal whitespace-pre-line font-mono bg-neutral-900/60 p-2 rounded border border-neutral-700/50">
                  {messageText}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-rule bg-bone flex justify-between items-center gap-3">
          <button
            type="button"
            onClick={copyToClipboard}
            className="flex-1 bg-paper hover:bg-pine/5 border border-rule hover:border-pine py-2 px-3 rounded text-xs font-mono uppercase tracking-wider text-pine-deep font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {copied ? <Check size={14} className="text-moss" /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy Text'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="bg-pine hover:bg-pine-deep text-bone py-2 px-4 rounded text-xs font-mono uppercase tracking-wider font-semibold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
