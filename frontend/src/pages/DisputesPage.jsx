import { useCallback, useEffect, useState } from 'react';
import DisputeCard from '../components/DisputeCard';
import { IconAlert, IconFlag, IconRefresh } from '../components/Icons';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

const FILTERS = ['ALL', 'OPEN', 'ACCEPTED', 'REJECTED'];
const FILTER_LABEL = { ALL: 'All', OPEN: 'Open', ACCEPTED: 'Agreed', REJECTED: 'Stood by' };

export default function DisputesPage() {
  const { profile } = useAuth();
  const isPatient = profile?.role === 'PATIENT';
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('ALL');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setDisputes(await api.listDisputes());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // The respond endpoint returns the dispute without its claim context; keep what the list had.
  const merge = (updated) => setDisputes((list) => list.map((d) => (d.id === updated.id ? { ...d, ...updated } : d)));

  const visible = filter === 'ALL' ? disputes : disputes.filter((d) => d.status === filter);

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 animate-fade-up">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-300">{isPatient ? 'Your questions' : 'Patient questions'}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">{isPatient ? 'My Disputes' : 'Disputes'}</h1>
          <p className="mt-1 text-sm text-ink-400">
            {isPatient
              ? 'Charges you asked a hospital to explain, and what the hospital answered.'
              : 'Bill lines patients have questioned on claims your account filed.'}
          </p>
        </div>
        <button id="refresh-disputes" onClick={load} className="btn-ghost" disabled={loading}>
          <IconRefresh className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </header>

      <section className="glass overflow-hidden">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-white/5 p-3">
          {FILTERS.map((f) => (
            <button
              key={f}
              id={`dispute-filter-${f.toLowerCase()}`}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                filter === f ? 'bg-white/10 text-white' : 'text-ink-400 hover:bg-white/5 hover:text-ink-200'
              }`}
            >
              {FILTER_LABEL[f]}
              <span className="ml-1.5 text-ink-400">{f === 'ALL' ? disputes.length : disputes.filter((d) => d.status === f).length}</span>
            </button>
          ))}
        </div>

        {error ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <IconAlert className="h-8 w-8 text-rose-300" />
            <p className="text-sm text-rose-200">{error}</p>
            <button onClick={load} className="btn-ghost">Try again</button>
          </div>
        ) : loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton h-24" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-14 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-400/10 text-brand-300">
              <IconFlag className="h-6 w-6" />
            </div>
            <p className="font-semibold text-white">{disputes.length ? 'Nothing matches this filter' : 'No disputes yet'}</p>
            <p className="max-w-sm text-sm text-ink-400">
              {isPatient
                ? 'Open a bill a hospital filed for you and press “Dispute this charge” on a flagged line.'
                : 'When a patient questions a line on one of your claims, it appears here for you to answer.'}
            </p>
          </div>
        ) : (
          <ul className="space-y-2 p-4">
            {visible.map((d) => (
              <DisputeCard key={d.id} dispute={d} isPatient={isPatient} onChanged={merge} showClaim />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
