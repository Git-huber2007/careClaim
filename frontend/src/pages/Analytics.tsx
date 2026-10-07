import { useEffect, useState } from 'react';
import { fetchApi } from '../lib/api';
import { useAccount } from '../lib/account';
import { flagLabel, isSuspicious } from '../lib/claims';
import { formatCurrency } from '../lib/format';

interface AnalyticsData {
  total_claims: number;
  adjudicated_claims: number;
  by_status: Record<string, number>;
  totals: { billed: number; approved: number; flagged: number; not_covered: number; waived: number };
  by_flag: { flag: string; lines: number; amount: number }[];
  top_flagged_items: { item_name: string; times: number; amount: number }[];
  daily: { date: string; claims: number; billed: number; approved: number }[];
}

const STATUS_ORDER = ['APPROVED', 'PARTIAL', 'DENIED', 'PENDING', 'PROCESSING'];
const STATUS_COLOR: Record<string, string> = {
  APPROVED: 'bg-moss',
  PARTIAL: 'bg-amber',
  DENIED: 'bg-vermilion',
  PENDING: 'bg-ink-soft/40',
  PROCESSING: 'bg-pine'
};

/** Totals over the caller's claims: outcomes, where the unpaid money went, and volume by day. */
export function Analytics() {
  const isPatient = useAccount().role === 'PATIENT';
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchApi('/api/analytics').then(setData).catch(err => setError(err.message));
  }, []);

  if (error) return <div className="p-10 text-center text-sm text-vermilion font-mono">Could not load the analytics: {error}</div>;
  if (!data) return <div className="p-10 text-center font-mono">Loading...</div>;

  const { totals } = data;
  const unpaid = Math.max(0, totals.billed - totals.approved);
  const maxFlagAmount = Math.max(1, ...data.by_flag.map(f => f.amount));
  const maxItemAmount = Math.max(1, ...data.top_flagged_items.map(i => i.amount));
  const maxDayBilled = Math.max(1, ...data.daily.map(d => d.billed));

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      <header className="border-b border-rule pb-4">
        <h1 className="text-3xl font-serif text-pine-deep">Analytics</h1>
        <p className="text-sm text-ink-soft mt-1">
          {data.adjudicated_claims} of {data.total_claims} {isPatient ? 'bills' : 'claims'} adjudicated. Amounts cover adjudicated {isPatient ? 'bills' : 'claims'} only.
        </p>
      </header>

      {data.total_claims === 0 ? (
        <div className="bg-paper rounded-lg border border-rule p-10 text-center text-ink-soft">Nothing to show yet.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Figure label="Billed" value={formatCurrency(totals.billed)} />
            <Figure label="Insurer paid" value={formatCurrency(totals.approved)} sub={totals.billed ? `${((totals.approved / totals.billed) * 100).toFixed(0)}% of billed` : undefined} />
            <Figure label="Flagged for review" value={formatCurrency(totals.flagged)} sub="Possible billing problems" />
            <Figure label="Withdrawn after dispute" value={formatCurrency(totals.waived)} sub="Charges the hospital took back" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Panel title="Outcomes">
              <div className="flex h-4 rounded overflow-hidden bg-bone" role="img" aria-label={STATUS_ORDER.filter(s => data.by_status[s]).map(s => `${data.by_status[s]} ${s.toLowerCase()}`).join(', ')}>
                {STATUS_ORDER.filter(s => data.by_status[s]).map(s => (
                  <div key={s} className={STATUS_COLOR[s]} style={{ width: `${(data.by_status[s] / data.total_claims) * 100}%` }} />
                ))}
              </div>
              <ul className="mt-4 grid grid-cols-2 gap-2 text-sm font-mono">
                {STATUS_ORDER.filter(s => data.by_status[s]).map(s => (
                  <li key={s} className="flex items-center gap-2">
                    <span className={`inline-block h-2.5 w-2.5 rounded-sm ${STATUS_COLOR[s]}`} />
                    {s} <span className="ml-auto font-bold">{data.by_status[s]}</span>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="Where the unpaid money went" note={`${formatCurrency(unpaid)} of the billed amount was not paid by the insurer.`}>
              {data.by_flag.length === 0 ? (
                <Empty>No charge has been flagged.</Empty>
              ) : (
                <ul className="space-y-3">
                  {data.by_flag.map(f => (
                    <Bar
                      key={f.flag}
                      label={`${flagLabel(f.flag)} · ${f.lines} ${f.lines === 1 ? 'line' : 'lines'}`}
                      value={formatCurrency(f.amount)}
                      share={f.amount / maxFlagAmount}
                      color={isSuspicious(f.flag) ? 'bg-vermilion' : 'bg-amber'}
                    />
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Most flagged items">
              {data.top_flagged_items.length === 0 ? (
                <Empty>No charge has been flagged.</Empty>
              ) : (
                <ul className="space-y-3">
                  {data.top_flagged_items.map(i => (
                    <Bar key={i.item_name} label={`${i.item_name} · ${i.times}×`} value={formatCurrency(i.amount)} share={i.amount / maxItemAmount} color="bg-pine" />
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Last 14 days with activity" note="Bar height: amount billed that day.">
              <div className="flex items-end gap-1.5 h-36">
                {data.daily.map(d => (
                  <div key={d.date} className="flex-1 h-full flex flex-col items-center gap-1" title={`${d.date}: ${d.claims} filed, ${formatCurrency(d.billed)} billed, ${formatCurrency(d.approved)} approved`}>
                    <span className="text-[10px] font-mono text-ink-soft">{d.claims}</span>
                    {/* The bar's height is a share of this box alone, so the labels cannot squeeze tall bars to one size. */}
                    <div className="flex-1 w-full flex items-end">
                      <div className="w-full bg-pine/70 rounded-t" style={{ height: `${Math.max(4, (d.billed / maxDayBilled) * 100)}%` }} />
                    </div>
                    <span className="text-[10px] font-mono text-ink-soft">{d.date.slice(5)}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

function Figure({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="p-4 rounded-lg border border-rule bg-paper shadow-sm">
      <div className="text-xs font-mono uppercase tracking-wider text-ink-soft mb-1.5">{label}</div>
      <div className="text-2xl md:text-3xl font-serif text-pine-deep">{value}</div>
      {sub && <div className="text-[10px] font-mono text-ink-soft mt-1">{sub}</div>}
    </div>
  );
}

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="bg-paper rounded-lg border border-rule p-6">
      <h2 className="font-mono text-xs uppercase tracking-widest text-ink-soft border-b border-rule pb-2 mb-4">{title}</h2>
      {children}
      {note && <p className="text-xs text-ink-soft mt-4">{note}</p>}
    </section>
  );
}

function Bar({ label, value, share, color }: { label: string; value: string; share: number; color: string }) {
  return (
    <li className="text-sm">
      <div className="flex justify-between gap-3 mb-1">
        <span className="truncate">{label}</span>
        <span className="font-mono font-bold shrink-0">{value}</span>
      </div>
      <div className="h-2 rounded bg-bone overflow-hidden">
        <div className={`h-full rounded ${color}`} style={{ width: `${Math.max(2, share * 100)}%` }} />
      </div>
    </li>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-ink-soft">{children}</p>;
