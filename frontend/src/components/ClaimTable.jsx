import { useNavigate } from 'react-router-dom';
import StatusBadge from './StatusBadge';
import { dateTime, money, shortId } from '../lib/format';

const openDisputes = (c) => (c.disputes ?? []).filter((d) => d.status === 'OPEN').length;

export default function ClaimTable({ claims, loading, isPatient = false }) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="space-y-3 p-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton h-12" />
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-left text-sm" id="claims-table">
        <thead>
          <tr className="border-b border-white/5 text-[11px] uppercase tracking-wider text-ink-400">
            <th className="px-5 py-3.5 font-semibold">{isPatient ? 'Bill' : 'Claim'}</th>
            <th className="px-5 py-3.5 font-semibold">{isPatient ? 'Filed by' : 'Patient'}</th>
            <th className="px-5 py-3.5 font-semibold">Policy</th>
            <th className="px-5 py-3.5 font-semibold">Dx Code</th>
            <th className="px-5 py-3.5 text-right font-semibold">Billed</th>
            <th className="px-5 py-3.5 text-right font-semibold">{isPatient ? 'Insurer pays' : 'Approved'}</th>
            {isPatient && <th className="px-5 py-3.5 text-right font-semibold">Flagged</th>}
            <th className="px-5 py-3.5 font-semibold">Status</th>
            <th className="px-5 py-3.5 font-semibold">Submitted</th>
          </tr>
        </thead>
        <tbody>
          {claims.map((c, i) => {
            const pending = c.status === 'PENDING';
            const flagged = Number(c.flagged_total || 0);
            const disputes = openDisputes(c);
            return (
              <tr
                key={c.id}
                id={`claim-row-${c.id}`}
                onClick={() => navigate(`/claims/${c.id}`)}
                onKeyDown={(e) => e.key === 'Enter' && navigate(`/claims/${c.id}`)}
                tabIndex={0}
                style={{ animationDelay: `${i * 35}ms` }}
                className="group animate-fade-up cursor-pointer border-b border-white/[0.04] transition hover:bg-white/[0.03] focus:bg-white/[0.04] focus:outline-none"
              >
                <td className="px-5 py-4 font-mono text-xs font-semibold text-brand-300 group-hover:text-brand-400">#{shortId(c.id)}</td>
                <td className="px-5 py-4 font-medium text-white">{isPatient ? (c.source === 'PATIENT' ? 'You' : 'Hospital') : c.patient_id}</td>
                <td className="px-5 py-4 text-ink-300">{c.policies?.policy_number ?? '—'}</td>
                <td className="px-5 py-4 font-mono text-xs text-ink-300">{c.diagnosis_code}</td>
                <td className="px-5 py-4 text-right tabular-nums text-ink-200">{money(c.total_billed)}</td>
                <td className={`px-5 py-4 text-right font-semibold tabular-nums ${pending ? 'text-ink-400' : 'text-white'}`}>
                  {pending ? '—' : money(c.approved_amount)}
                </td>
                {isPatient && (
                  <td className={`px-5 py-4 text-right font-semibold tabular-nums ${flagged ? 'text-rose-300' : 'text-ink-400'}`}>
                    {pending ? '—' : money(flagged)}
                  </td>
                )}
                <td className="px-5 py-4">
                  <span className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={c.status} />
                    {disputes > 0 && (
                      <span className="rounded-full bg-rose-400/10 px-2 py-0.5 text-[11px] font-semibold text-rose-300 ring-1 ring-inset ring-rose-400/25">
                        {disputes} open dispute{disputes === 1 ? '' : 's'}
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-5 py-4 text-ink-400">{dateTime(c.created_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
