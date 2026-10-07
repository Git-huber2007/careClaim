import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { fetchApi } from '../lib/api';
import { useAccount } from '../lib/account';
import type { Dispute } from '../lib/claims';
import { DisputeCard } from '../components/DisputeCard';

const FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'OPEN', label: 'Open' },
  { key: 'ACCEPTED', label: 'Agreed' },
  { key: 'REJECTED', label: 'Stood by' }
] as const;

/** The hospital's queue of questioned bill lines, or a patient's own disputes. */
export function Disputes() {
  const isPatient = useAccount().role === 'PATIENT';
  const [disputes, setDisputes] = useState<Dispute[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('ALL');

  const load = useCallback(
    () =>
      fetchApi('/api/disputes')
        .then(res => {
          setDisputes(res.disputes);
          setError('');
        })
        .catch((err: any) => setError(err.message)),
    []
  );

  useEffect(() => { load(); }, [load]);

  // The respond route answers without the claim's patient ID; keep what the list had.
  const merge = (answered: Dispute) =>
    setDisputes(list => (list ?? []).map(d => (d.id === answered.id ? { ...d, ...answered } : d)));

  const all = disputes ?? [];
  const byStatus = (key: typeof filter) => (key === 'ALL' ? all : all.filter(d => d.status === key));
  const visible = byStatus(filter);

  return (
    <div className="min-h-screen p-6 md:p-10 max-w-4xl mx-auto space-y-8">
      <header className="flex justify-between items-end border-b border-rule pb-4">
        <div>
          <h1 className="text-3xl font-serif text-pine-deep">{isPatient ? 'My Disputes' : 'Disputes'}</h1>
          <p className="text-sm text-ink-soft mt-1">
            {isPatient
              ? 'Charges you asked a hospital to explain, and what the hospital answered.'
              : 'Bill lines patients have questioned on claims your account filed.'}
          </p>
        </div>
        <Link to="/dashboard" className="text-sm text-pine font-medium hover:underline">Dashboard</Link>
      </header>

      <div className="bg-paper rounded-lg border border-rule overflow-hidden">
        <div className="flex flex-wrap gap-1 border-b border-rule bg-bone p-2">
          {FILTERS.map(f => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition-colors ${
                filter === f.key ? 'bg-pine text-bone' : 'text-ink-soft hover:bg-rule/40'
              }`}
            >
              {f.label} {byStatus(f.key).length}
            </button>
          ))}
        </div>

        {error ? (
          <div className="p-8 text-center space-y-3">
            <div className="text-sm text-vermilion font-mono">{error}</div>
            <button onClick={load} className="text-sm text-pine font-medium hover:underline">Retry</button>
          </div>
        ) : !disputes ? (
          <div className="p-8 text-center font-mono">Loading...</div>
        ) : visible.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <div className="text-ink-soft font-mono text-xs uppercase tracking-widest">
              {all.length ? 'Nothing matches this filter' : 'No disputes yet'}
            </div>
            {!all.length && (
              <p className="text-sm text-ink-soft max-w-sm mx-auto">
                {isPatient
                  ? 'Open a bill a hospital filed for you and press “Dispute this charge” on a flagged line.'
                  : 'When a patient questions a line on one of your claims, it appears here for you to answer.'}
              </p>
            )}
          </div>
        ) : (
          <ul className="space-y-2 p-4">
            {visible.map(d => (
              <DisputeCard key={d.id} dispute={d} onChanged={merge} showClaim />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
