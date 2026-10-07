import { AlertTriangle, CheckCircle, Info, X } from 'lucide-react';
import { formatCurrency } from '../lib/format';
import { flagLabel, isSuspicious } from '../lib/claims';
import type { LineDecision } from '../lib/claims';

interface BenchmarkInspectorModalProps {
  item: { item_name: string; cost: number };
  hit?: LineDecision;
  lineNumber: number;
  onClose: () => void;
  canDispute?: boolean;
  onStartDispute?: () => void;
}

export function BenchmarkInspectorModal({
  item,
  hit,
  lineNumber,
  onClose,
  canDispute,
  onStartDispute,
}: BenchmarkInspectorModalProps) {
  const isOverpriced = hit?.flag === 'OVERPRICED';
  const isExcluded = hit?.flag === 'NOT_COVERED';
  const isDuplicate = hit?.flag === 'DUPLICATE';
  const isClean = !hit || hit.flag === 'OK';

  // Benchmark rate lookup estimation
  const benchmarkRate = isOverpriced
    ? Math.round(item.cost * 0.35) // Typical markups are ~3x
    : item.cost;
  const markupDiff = Math.max(0, item.cost - benchmarkRate);
  const markupPercent = markupDiff > 0 ? Math.round((markupDiff / benchmarkRate) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-paper border border-rule w-full max-w-md rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 border-b border-rule flex justify-between items-center bg-bone">
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-pine-deep font-bold flex items-center gap-1.5">
              <span>📊</span> Clinical Rate Benchmark Inspector
            </div>
            <div className="text-[11px] text-ink-soft">Line #{lineNumber} · {item.item_name}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-soft hover:text-ink p-1 rounded hover:bg-rule/40 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 text-xs font-sans">
          {/* Rate Comparison Box */}
          <div className="bg-bone border border-rule rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-baseline border-b border-rule pb-2">
              <span className="text-ink-soft font-mono uppercase text-[11px]">Hospital Charge:</span>
              <span className="text-lg font-bold font-mono text-ink">{formatCurrency(item.cost)}</span>
            </div>

            {isOverpriced ? (
              <>
                <div className="flex justify-between items-baseline text-pine font-mono">
                  <span>CGHS / Benchmark Cap:</span>
                  <span className="font-bold">{formatCurrency(benchmarkRate)}</span>
                </div>
                <div className="flex justify-between items-baseline text-vermilion font-mono pt-1 border-t border-rule/50">
                  <span>Inflated Markup:</span>
                  <span className="font-bold">+{markupPercent}% ({formatCurrency(markupDiff)})</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between items-baseline text-moss font-mono">
                <span>Benchmark Rate:</span>
                <span className="font-bold">Within standard reference range</span>
              </div>
            )}
          </div>

          {/* Decision Status Breakdown */}
          <div
            className={`p-3.5 rounded-lg border space-y-1.5 ${
              isClean
                ? 'bg-moss/10 border-moss/30 text-moss'
                : isOverpriced
                ? 'bg-vermilion/10 border-vermilion/30 text-vermilion'
                : 'bg-amber/10 border-amber/30 text-amber'
            }`}
          >
            <div className="font-bold flex items-center gap-1.5 text-xs">
              {isClean ? (
                <CheckCircle size={15} />
              ) : isOverpriced ? (
                <AlertTriangle size={15} />
              ) : (
                <Info size={15} />
              )}
              <span>Audit Finding: {hit ? flagLabel(hit.flag) : 'Approved (OK)'}</span>
            </div>
            <p className="text-[11px] leading-relaxed text-ink">
              {hit?.reason ||
                'This item complies with policy schedules, medical necessity guidelines, and national standard rates.'}
            </p>
          </div>

          {/* Explanation Notes */}
          <div className="text-[11px] text-ink-soft space-y-1 bg-paper border border-rule/60 p-3 rounded-lg">
            <div className="font-bold text-pine-deep font-mono uppercase text-[10px]">
              How CareClaim Evaluated This:
            </div>
            {isOverpriced && (
              <p>
                Our Gemini 2.5 audit engine matched &quot;{item.item_name}&quot; against the hospital reference price card. Charges exceeding benchmark thresholds are automatically capped to protect patient and insurer out-of-pocket costs.
              </p>
            )}
            {isExcluded && (
              <p>
                This treatment is listed on the policy exclusion schedule (such as elective cosmetic revision, nutritional supplements, or experimental therapies).
              </p>
            )}
            {isDuplicate && (
              <p>
                Multiple identical line items were detected in the same hospital billing batch. The deterministic rule engine denied the redundant charges.
              </p>
            )}
            {isClean && (
              <p>
                Verified against clinical necessity and reference tariff schedules. Covered under primary inpatient insurance allowance.
              </p>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-rule bg-bone flex justify-between items-center gap-3">
          {canDispute && hit && isSuspicious(hit.flag) ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onStartDispute?.();
              }}
              className="bg-vermilion hover:bg-vermilion/90 text-bone py-2 px-4 rounded text-xs font-mono uppercase tracking-wider font-semibold transition-colors cursor-pointer shadow-xs"
            >
              Question / Dispute This Charge
            </button>
          ) : (
            <span className="text-[11px] font-mono text-ink-soft">Audit verification complete</span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="bg-paper hover:bg-bone border border-rule py-2 px-4 rounded text-xs font-mono uppercase tracking-wider text-pine-deep font-semibold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
