import { useEffect, useState } from 'react';
import StatusBadge from './StatusBadge';
import { flagMeta } from '../lib/flags';
import { money } from '../lib/format';
import { IconAlert, IconCheck, IconShield, IconX } from './Icons';

function useCountUp(target, duration = 1100) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf;
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / duration);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

const HERO = {
  APPROVED: { ring: 'from-emerald-400/30', icon: IconCheck, iconCls: 'bg-emerald-400/15 text-emerald-300', title: 'Claim Approved' },
  PARTIAL: { ring: 'from-sky-400/30', icon: IconAlert, iconCls: 'bg-sky-400/15 text-sky-300', title: 'Partially Approved' },
  DENIED: { ring: 'from-rose-400/30', icon: IconX, iconCls: 'bg-rose-400/15 text-rose-300', title: 'Claim Denied' },
};

/**
 * AdjudicationSummary
 * Total Billed − Exclusions − Copay (− Cap) = Approved Amount
 */
export default function AdjudicationSummary({ claim }) {
  const log = claim.ai_reasoning_log || {};
  const b = log.breakdown;
  const approved = useCountUp(Number(claim.approved_amount || 0));
  const hero = HERO[claim.status] ?? HERO.PARTIAL;
  const HeroIcon = hero.icon;

  if (!b) return null;

  const rows = [
    { label: 'Total billed', value: b.total_billed, sign: '' },
    { label: `Excluded / denied items (${log.denied_items?.length ?? 0})`, value: b.excluded_total, sign: '−', tone: 'text-rose-300' },
    { label: 'Eligible amount', value: b.eligible_amount, sign: '=', subtotal: true },
    { label: `Patient copay (${b.copay_percentage}%)`, value: b.copay_amount, sign: '−', tone: 'text-amber-300' },
    ...(b.cap_applied
      ? [{ label: `Max coverage cap (${money(b.max_coverage_limit)})`, value: b.cap_reduction, sign: '−', tone: 'text-amber-300' }]
      : []),
  ];

  return (
    <section id="adjudication-summary" className="glass relative overflow-hidden p-6 animate-fade-up">
      <div className={`pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-gradient-to-br ${hero.ring} to-transparent blur-3xl`} />

      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className={`grid h-11 w-11 place-items-center rounded-xl ${hero.iconCls}`}>
            <HeroIcon className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-white">{hero.title}</h2>
            <p className="text-xs text-ink-400">
              {log.model} · {(log.duration_ms / 1000).toFixed(1)}s · {new Date(log.processed_at).toLocaleTimeString()}
            </p>
          </div>
        </div>
        <StatusBadge status={claim.status} size="lg" />
      </div>

      {/* Math waterfall */}
      <div className="relative mt-6 rounded-xl bg-ink-950/60 p-4 ring-1 ring-white/5">
        <dl className="space-y-2.5 text-sm">
          {rows.map((r) => (
            <div key={r.label} className={`flex items-center justify-between ${r.subtotal ? 'border-t border-white/5 pt-2.5' : ''}`}>
              <dt className="flex items-center gap-2 text-ink-300">
                <span className="w-3 font-mono text-ink-400">{r.sign}</span>
                {r.label}
              </dt>
              <dd className={`tabular-nums font-medium ${r.tone ?? 'text-white'}`}>{money(r.value)}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex items-end justify-between border-t border-dashed border-white/10 pt-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-300">= Approved payout</span>
          <span id="approved-amount" className="text-3xl font-extrabold tabular-nums text-gradient">{money(approved)}</span>
        </div>
      </div>

      {/* Verification */}
      <div
        className={`mt-4 flex items-start gap-2.5 rounded-xl p-3 text-xs ring-1 ${
          log.verification?.math_matches
            ? 'bg-emerald-400/5 text-emerald-200 ring-emerald-400/15'
            : 'bg-amber-400/5 text-amber-200 ring-amber-400/15'
        }`}
      >
        <IconShield className="h-4 w-4 shrink-0" />
        {log.verification?.math_matches ? (
          <span>Deterministic verifier confirmed the agent’s payout math to the cent.</span>
        ) : (
          <span>
            Agent reported {money(log.ai_reported?.approved_amount)}; verifier recomputed from the agent’s line-item decisions and
            corrected the payout to {money(claim.approved_amount)}.
          </span>
        )}
      </div>

      {/* Denied items */}
      {log.denied_items?.length > 0 && (
        <div className="mt-5">
          <p className="label">Denied line items</p>
          <ul className="space-y-2">
            {log.denied_items.map((d, i) => (
              <li key={i} className="rounded-xl border border-rose-400/15 bg-rose-400/[0.04] p-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex flex-wrap items-center gap-2 font-medium text-rose-200">
                    <IconX className="h-3.5 w-3.5" /> {d.item_name}
                    {d.flag && <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${flagMeta(d.flag).chip}`}>{flagMeta(d.flag).label}</span>}
                  </span>
                  <span className="tabular-nums text-rose-300">−{money(d.cost)}</span>
                </div>
                <p className="mt-1 pl-5 text-xs text-ink-300">{d.reason}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
