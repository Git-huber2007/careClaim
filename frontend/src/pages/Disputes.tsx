import { useCallback, useEffect, useState } from 'react';
import { fetchApi } from '../lib/api';
import { useAccount } from '../lib/account';
import type { Dispute } from '../lib/claims';
import { DisputeCard } from '../components/DisputeCard';
import { Loading } from '../components/Loading';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { MessageSquare } from 'lucide-react';
import { PageTitle } from '../components/PageTitle';

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
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-8">
      <PageTitle>{isPatient ? 'My disputes' : 'Disputes'}</PageTitle>
      <header className="border-b border-rule pb-4">
        <h1 className="text-3xl font-serif text-pine-deep">{isPatient ? 'My disputes' : 'Disputes'}</h1>
        <p className="text-sm text-ink-soft mt-1">
          {isPatient
            ? 'Charges you asked a hospital to explain, and what the hospital answered.'
            : 'Bill lines patients have questioned on claims your account filed.'}
        </p>
      </header>

      {error ? (
        <ErrorState title="Unable to load the disputes" message={error}>
          <button onClick={load} className="btn btn-primary">Retry</button>
        </ErrorState>
      ) : (
        <div className="bg-paper rounded-lg border border-rule overflow-hidden">
          <div className="flex flex-wrap gap-1 border-b border-rule bg-bone p-2">
            {FILTERS.map(f => (
              <button
                key={f.key}
                type="button"
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={`tab ${filter === f.key ? 'tab-active' : ''}`}
              >
                {f.label} {byStatus(f.key).length}
              </button>
            ))}
          </div>

          {!disputes ? (
            <Loading className="p-8" />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<MessageSquare size={24} />}
              title={all.length ? 'Nothing matches this filter' : 'No disputes yet'}
              actions={all.length > 0 && <button type="button" onClick={() => setFilter('ALL')} className="btn btn-secondary">Show all disputes</button>}
            >
              {!all.length &&
                (isPatient
                  ? 'Open a bill a hospital filed for you and press “Dispute this charge” on a flagged line.'
                  : 'When a patient questions a line on one of your claims, it appears here for you to answer.')}
            </EmptyState>
          ) : (
            <ul className="space-y-2 p-4">
              {visible.map(d => (
                <DisputeCard key={d.id} dispute={d} onChanged={merge} showClaim />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
