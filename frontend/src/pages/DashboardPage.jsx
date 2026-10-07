import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ClaimTable from '../components/ClaimTable';
import { IconAlert, IconCheck, IconClock, IconLayers, IconPlus, IconRefresh, IconWallet } from '../components/Icons';
import { api } from '../lib/api';
import { money } from '../lib/format';

const FILTERS = ['ALL', 'PENDING', 'APPROVED', 'PARTIAL', 'DENIED'];

export default function DashboardPage() {
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('ALL');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setClaims(await api.listClaims());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const processed = claims.filter((c) => c.status !== 'PENDING');
    return {
      total: claims.length,
      pending: claims.length - processed.length,
      processed: processed.length,
      approvedSum: processed.reduce((s, c) => s + Number(c.approved_amount || 0), 0),
      billedSum: processed.reduce((s, c) => s + Number(c.total_billed || 0), 0),
    };
  }, [claims]);

  const visible = filter === 'ALL' ? claims : claims.filter((c) => c.status === filter);

  const cards = [
    { label: 'Total claims', value: stats.total, icon: IconLayers, tone: 'text-iris-400 bg-iris-400/10' },
    { label: 'Awaiting agent', value: stats.pending, icon: IconClock, tone: 'text-amber-300 bg-amber-400/10' },
    { label: 'Adjudicated', value: stats.processed, icon: IconCheck, tone: 'text-emerald-300 bg-emerald-400/10' },
    {
      label: 'Approved payouts',
      value: money(stats.approvedSum),
      sub: stats.billedSum ? `${Math.round((stats.approvedSum / stats.billedSum) * 100)}% of billed` : null,
      icon: IconWallet,
      tone: 'text-brand-300 bg-brand-400/10',
    },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 animate-fade-up">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-300">Discharge desk</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">Claims Queue</h1>
          <p className="mt-1 text-sm text-ink-400">Pending and processed discharge claims submitted by your account.</p>
        </div>
        <div className="flex gap-2">
          <button id="refresh-claims" onClick={load} className="btn-ghost" disabled={loading}>
            <IconRefresh className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <Link id="cta-new-claim" to="/claims/new" className="btn-primary">
            <IconPlus className="h-4 w-4" /> New claim
          </Link>
        </div>
      </header>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, sub, icon: Icon, tone }, i) => (
          <div key={label} className="glass p-5 transition hover:-translate-y-0.5 animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">{label}</p>
              <span className={`grid h-8 w-8 place-items-center rounded-lg ${tone}`}><Icon className="h-4 w-4" /></span>
            </div>
            <p className="mt-3 text-2xl font-bold tabular-nums text-white">{loading ? <span className="skeleton inline-block h-7 w-20" /> : value}</p>
            {sub && !loading && <p className="mt-0.5 text-xs text-ink-400">{sub}</p>}
          </div>
        ))}
      </div>

      <section className="glass overflow-hidden">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-white/5 p-3">
          {FILTERS.map((f) => (
            <button
              key={f}
              id={`filter-${f.toLowerCase()}`}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                filter === f ? 'bg-white/10 text-white' : 'text-ink-400 hover:bg-white/5 hover:text-ink-200'
              }`}
            >
              {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
              <span className="ml-1.5 text-ink-400">{f === 'ALL' ? claims.length : claims.filter((c) => c.status === f).length}</span>
            </button>
          ))}
        </div>

        {error ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <IconAlert className="h-8 w-8 text-rose-300" />
            <p className="text-sm text-rose-200">{error}</p>
            <button onClick={load} className="btn-ghost">Try again</button>
          </div>
        ) : !loading && visible.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-14 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-400/10 text-brand-300 animate-pulse-ring">
              <IconPlus className="h-6 w-6" />
            </div>
            <p className="font-semibold text-white">{claims.length ? 'No claims match this filter' : 'No claims yet'}</p>
            <p className="max-w-sm text-sm text-ink-400">Submit a discharge bill and let the agent adjudicate it in seconds.</p>
            <Link to="/claims/new" className="btn-primary mt-2">Submit first claim</Link>
          </div>
        ) : (
          <ClaimTable claims={visible} loading={loading} />
        )}
      </section>
    </div>
  );
}
