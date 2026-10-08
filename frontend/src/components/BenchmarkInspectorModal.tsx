import { useEffect } from 'react';
import { AlertTriangle, CheckCircle, Info, X } from 'lucide-react';
import { formatCurrency } from '../lib/format';
import { findReferencePrice, flagLabel } from '../lib/claims';
import type { LineDecision, ReferencePrice } from '../lib/claims';

// The agent is told to flag a charge above this many times the reference price.
const OVERPRICED_RATIO = 1.5;

interface BenchmarkInspectorModalProps {
  item: { item_name: string; cost: number };
  /** The agent's decision on this line when it was not passed as OK. */
  hit?: LineDecision;
  lineNumber: number;
  /** The claim has a verdict; before that there is no finding to show. */
  decided: boolean;
  /** The rate card, or null while it has not loaded. */
  prices: ReferencePrice[] | null;
  onClose: () => void;
  /** Given only when the viewer can dispute this line now. */
  onStartDispute?: () => void;
}

/** One bill line next to the rate card's price for it, and what the agent decided. */
export function BenchmarkInspectorModal({ item, hit, lineNumber, decided, prices, onClose, onStartDispute }: BenchmarkInspectorModalProps) {
  const match = prices ? findReferencePrice(item.item_name, prices) : null;
  const ratio = match ? item.cost / match.reference : 0;
  const above = ratio > OVERPRICED_RATIO;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const finding = !decided
    ? { tone: 'bg-bone border-rule text-ink-soft', icon: <Info size={15} />, title: 'Not adjudicated yet', text: 'Run the adjudication to see what the agent decides for this charge.' }
    : hit
      ? {
          tone: hit.flag === 'NOT_COVERED' ? 'bg-amber/10 border-amber/30 text-amber-ink' : 'bg-vermilion/10 border-vermilion/30 text-vermilion',
          icon: <AlertTriangle size={15} />,
          title: `${flagLabel(hit.flag)}${hit.waived ? ' · withdrawn by the hospital' : ''}`,
          text: hit.reason
        }
      : { tone: 'bg-moss/10 border-moss/30 text-moss', icon: <CheckCircle size={15} />, title: 'Passed (OK)', text: 'The agent found no problem with this charge, and the insurer pays its share of it.' };

  return (
    <div className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true" aria-label={`Rate check for line ${lineNumber}`} className="bg-paper border border-rule w-full max-w-md rounded-xl shadow-2xl overflow-hidden flex flex-col">
        <div className="p-4 border-b border-rule flex justify-between items-center bg-bone">
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-pine-deep font-bold">Rate Inspector</div>
            <div className="text-xs text-ink-soft">Line {lineNumber} · {item.item_name}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-ink-soft hover:text-ink p-1 rounded hover:bg-rule/40 transition-colors cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs">
          <div className="bg-bone border border-rule rounded-lg p-4 space-y-2 font-mono">
            <div className="flex justify-between items-baseline border-b border-rule pb-2">
              <span className="text-ink-soft uppercase text-xs">Hospital charge</span>
              <span className="text-lg font-bold text-ink">{formatCurrency(item.cost)}</span>
            </div>

            {!prices ? (
              <div className="text-ink-soft">Reference prices are not available right now.</div>
            ) : !match ? (
              <div className="text-ink-soft">No reference price is on file for this item.</div>
            ) : (
              <>
                <div className="flex justify-between items-baseline gap-3">
                  <span className="text-ink-soft">
                    Reference: {match.name}
                    <span className="block text-xs">
                      {formatCurrency(match.unitPrice)} {match.unit}
                      {match.multiplier > 1 ? ` × ${match.multiplier}` : ''}
                    </span>
                  </span>
                  <span className="font-bold text-pine shrink-0">{formatCurrency(match.reference)}</span>
                </div>
                <div className={`flex justify-between items-baseline pt-2 border-t border-rule/50 ${above ? 'text-vermilion' : 'text-moss'}`}>
                  <span>Charge vs reference</span>
                  <span className="font-bold">
                    {ratio.toFixed(1)}×{above ? ` (${formatCurrency(item.cost - match.reference)} above)` : ''}
                  </span>
                </div>
              </>
            )}
          </div>

          <div className={`p-3.5 rounded-lg border space-y-1.5 ${finding.tone}`}>
            <div className="font-bold flex items-center gap-1.5">
              {finding.icon}
              <span>{finding.title}</span>
            </div>
            <p className="text-xs leading-relaxed text-ink">{finding.text}</p>
          </div>

          <p className="text-xs text-ink-soft leading-relaxed">
            The agent flags a charge as overpriced when it is more than {OVERPRICED_RATIO}× the reference price. The reference prices are
            sample values for this demo, not an official rate card.
          </p>
        </div>

        <div className="p-4 border-t border-rule bg-bone flex justify-end items-center gap-3">
          {onStartDispute && (
            <button
              type="button"
              onClick={onStartDispute}
              className="btn mr-auto bg-vermilion text-bone hover:bg-vermilion/90"
            >
              Dispute this charge
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
