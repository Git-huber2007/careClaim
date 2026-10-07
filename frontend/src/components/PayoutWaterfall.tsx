import { formatCurrency } from '../lib/format';
import { motion } from 'motion/react';

export function PayoutWaterfall({ breakdown }: { breakdown: any }) {
  if (!breakdown) return null;

  const steps = [
    { label: 'Total Billed', amount: breakdown.billed, color: 'bg-moss' },
    { label: 'Exclusions', amount: -breakdown.exclusions, color: 'bg-vermilion' },
    { label: 'Copay Deducted', amount: -breakdown.copay_amount, color: 'bg-amber' },
    { label: 'Limit Cap Reduction', amount: -breakdown.limit_reduction, color: 'bg-amber' },
    { label: 'Final Payout', amount: breakdown.payout, color: 'bg-pine', isFinal: true }
    // A deduction of zero is noise; a payout of zero is the verdict.
  ].filter(s => s.isFinal || s.amount !== 0);

  const maxAmount = Math.max(...steps.map(s => Math.abs(s.amount)));

  return (
    <div className="space-y-4 font-mono text-sm">
      {steps.map((step, idx) => (
        <motion.div 
          key={idx}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: idx * 0.15 }}
          className="flex items-center gap-4"
        >
          <div className="w-32 shrink-0 text-right text-ink-soft">
            {step.label}
          </div>
          <div className="flex-1 h-6 bg-rule/30 rounded overflow-hidden relative">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${(Math.abs(step.amount) / maxAmount) * 100}%` }}
              transition={{ duration: 0.5, delay: idx * 0.15 + 0.1 }}
              className={`h-full ${step.color}`}
            />
          </div>
          <div className={`w-32 shrink-0 font-bold ${step.amount < 0 ? 'text-vermilion' : 'text-ink'}`}>
            {step.amount > 0 && !step.isFinal ? '+' : ''}{formatCurrency(step.amount)}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
