import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { BarChart3 } from 'lucide-react';
import { fetchApi } from '../lib/api';
import { useAccount } from '../lib/account';
import { flagLabel, isSuspicious } from '../lib/claims';
import { formatCurrency } from '../lib/format';
import { Loading } from '../components/Loading';
import { EmptyState } from '../components/EmptyState';
import { PageTitle } from '../components/PageTitle';
import { ErrorState } from '../components/ErrorState';

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
  // The day whose numbers are spelled out under the chart; the latest day until one is picked.
  const [pickedDay, setPickedDay] = useState<string | null>(null);

  const load = useCallback(
    () =>
      fetchApi('/api/analytics')
        .then(res => {
          setData(res);
          setError('');
        })
        .catch((err: any) => setError(err.message)),
    []
  );

  useEffect(() => { load(); }, [load]);

  // Run once, when the chart first appears: later renders must not undo the reader's own scrolling.
  const showLatestDays = useCallback((chart: HTMLDivElement | null) => {
    if (chart) chart.scrollLeft = chart.scrollWidth;
  }, []);

  if (error) {
    return (
      <div className="p-6 md:p-10">
        <ErrorState title="Unable to load the analytics" message={error}>
          <button onClick={load} className="btn btn-primary">Retry</button>
        </ErrorState>
      </div>
    );
  }
  if (!data) return <Loading />;

  const { totals } = data;
  const unpaid = Math.max(0, totals.billed - totals.approved);
  const maxFlagAmount = Math.max(1, ...data.by_flag.map(f => f.amount));
  const maxItemAmount = Math.max(1, ...data.top_flagged_items.map(i => i.amount));
  const maxDayBilled = Math.max(1, ...data.daily.map(d => d.billed));
  const day = data.daily.find(d => d.date === pickedDay) ?? data.daily[data.daily.length - 1];

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      <PageTitle>Analytics</PageTitle>
      <header className="border-b border-rule pb-4">
        <h1 className="text-3xl font-serif text-pine-deep">Analytics</h1>
        <p className="text-sm text-ink-soft mt-1">
          {data.adjudicated_claims} of {data.total_claims} {isPatient ? 'bills' : 'claims'} adjudicated. Amounts cover adjudicated {isPatient ? 'bills' : 'claims'} only.
        </p>
      </header>

      {data.total_claims === 0 ? (
        <div className="bg-paper rounded-lg border border-rule">
          <EmptyState
            icon={<BarChart3 size={24} />}
            title="Nothing to chart yet"
            actions={<Link to="/claims/new" className="btn btn-primary">{isPatient ? 'Check a bill' : 'New claim'}</Link>}
          >
            {isPatient ? 'Totals appear here once one of your bills has been checked.' : 'Totals appear here once a claim has been filed and adjudicated.'}
          </EmptyState>
        </div>
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

            <Panel title="Last 14 days with activity" note={`Bar height: amount billed that day. The tallest bar is ${formatCurrency(maxDayBilled)}. Select a day for its numbers.`}>
              {/* Each day keeps room for its date; on a phone a full fortnight scrolls sideways inside the panel, starting at the latest days. */}
              <div ref={showLatestDays} className="overflow-x-auto">
                <div className="flex items-end gap-1.5 h-36">
                  {data.daily.map(d => (
                    // A button, not a hover tooltip: a day's numbers have to be reachable by touch and by keyboard.
                    <button
                      key={d.date}
                      type="button"
                      aria-pressed={d.date === day?.date}
                      aria-label={`${d.date}: ${d.claims} filed, ${formatCurrency(d.billed)} billed, ${formatCurrency(d.approved)} approved`}
                      onClick={() => setPickedDay(d.date)}
                      className="group flex-1 min-w-8 h-full flex flex-col items-center gap-1 rounded cursor-pointer"
                    >
                      <span className="text-[11px] font-mono text-ink-soft">{d.claims}</span>
                      {/* The bar's height is a share of this box alone, so the labels cannot squeeze tall bars to one size. */}
                      <div className="flex-1 w-full flex items-end">
                        <div
                          className={`w-full rounded-t transition-colors ${d.date === day?.date ? 'bg-pine' : 'bg-pine/40 group-hover:bg-pine/70'}`}
                          style={{ height: `${Math.max(4, (d.billed / maxDayBilled) * 100)}%` }}
                        />
                      </div>
                      <span className={`text-[11px] font-mono ${d.date === day?.date ? 'text-ink font-bold' : 'text-ink-soft'}`}>{d.date.slice(5)}</span>
                    </button>
                  ))}
                </div>
              </div>
              {day && (
                <p aria-live="polite" className="mt-3 rounded bg-bone px-3 py-2 text-sm font-mono">
                  <span className="font-bold">{day.date}</span> · {day.claims} filed · {formatCurrency(day.billed)} billed · {formatCurrency(day.approved)} approved
                </p>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

function Figure({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="p-4 rounded-lg border border-rule bg-paper">
      <div className="text-xs font-mono uppercase tracking-wider text-ink-soft mb-1.5">{label}</div>
      <div className="text-2xl md:text-3xl font-mono tabular-nums font-bold text-pine-deep">{value}</div>
      {sub && <div className="text-xs font-mono text-ink-soft mt-1">{sub}</div>}
    </div>
  );
}

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="bg-paper rounded-lg border border-rule p-6">
      <h2 className="font-sans text-xs font-semibold uppercase tracking-wider text-ink-soft border-b border-rule pb-2 mb-4">{title}</h2>
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
