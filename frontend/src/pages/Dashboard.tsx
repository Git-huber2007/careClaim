import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { fetchApi } from '../lib/api';
import { useAccount } from '../lib/account';
import { approvedDisplay, toCsv } from '../lib/claims';
import { formatCurrency, shortId } from '../lib/format';
import { StatusStamp } from '../components/StatusStamp';
import { motion } from 'motion/react';
import { Download, FileText, PenLine, Plus, Zap } from 'lucide-react';
import { Loading } from '../components/Loading';
import { EmptyState } from '../components/EmptyState';
import { PageTitle } from '../components/PageTitle';
import { toast } from 'sonner';

const byDate = (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
const byBilled = (a: any, b: any) => Number(a.total_billed) - Number(b.total_billed);
const SORTS = {
  newest: { label: 'Newest first', compare: (a: any, b: any) => byDate(b, a) },
  oldest: { label: 'Oldest first', compare: byDate },
  highest: { label: 'Highest billed', compare: (a: any, b: any) => byBilled(b, a) },
  lowest: { label: 'Lowest billed', compare: byBilled }
};
type SortKey = keyof typeof SORTS;

export function Dashboard() {
  const navigate = useNavigate();
  const profile = useAccount();
  const isPatient = profile.role === 'PATIENT';
  const [stats, setStats] = useState<any>(null);
  const [claims, setClaims] = useState<any[] | null>(null); // null until the first load answers

  useEffect(() => {
    fetchApi('/api/stats').then(setStats).catch(err => toast.error(err.message));
    // The backend wraps the list: { claims: [...] }
    fetchApi('/api/claims')
      .then(res => setClaims(res.claims))
      .catch(err => {
        setClaims([]);
        toast.error(err.message);
      });
  }, []);

  const [loadingDemo, setLoadingDemo] = useState(false);

  const loadDemoBill = async () => {
    setLoadingDemo(true);
    try {
      const res = await fetchApi('/api/policies');
      const policy = res.policies?.[0];
      if (!policy) {
        toast.error('No policy found for this account.');
        return;
      }

      const isPneumonia = policy.policy_number?.includes('HDFC') || profile.patient_id === 'PAT-1002';

      const payload = isPneumonia
        ? {
            patient_id: profile.patient_id || 'PAT-1002',
            policy_id: policy.id,
            diagnosis_code: 'J18.9',
            raw_bill_data: [
              { item_name: 'Room Charges (4 days)', cost: 28000 },
              { item_name: 'Pulmonology Consultation', cost: 6500 },
              { item_name: 'Chest X-Ray Digital', cost: 2800 },
              { item_name: 'IV Antibiotics & Nebulization', cost: 32000 },
            ],
            total_billed: 69300,
          }
        : {
            patient_id: profile.patient_id || 'PAT-1001',
            policy_id: policy.id,
            diagnosis_code: 'K35.80',
            raw_bill_data: [
              { item_name: 'Laparoscopic Appendectomy', cost: 85000 },
              { item_name: 'Anesthesia', cost: 18000 },
              { item_name: 'Abdominal X-Ray', cost: 32000 },
              { item_name: 'Cosmetic Scar Revision Surgery', cost: 32000 },
            ],
            total_billed: 167000,
          };

      const { claim } = await fetchApi('/api/claims', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      toast.success('Demo medical bill created! Opening claim details...');
      navigate(`/claims/${claim.id}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create demo bill');
    } finally {
      setLoadingDemo(false);
    }
  };

  const flaggedTotal = (claims ?? []).reduce((sum: number, c: any) => sum + Number(c.flagged_total || 0), 0);

  // What the list shows: narrowed by the search box and the status filter, then sorted.
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [sort, setSort] = useState<SortKey>('newest');
  const wanted = search.trim().toLowerCase();
  const visible = (claims ?? [])
    .filter(c => status === 'ALL' || c.status === status)
    .filter(c => !wanted || [c.id, c.patient_id, c.policies?.policy_number, c.diagnosis_code].some(v => String(v ?? '').toLowerCase().includes(wanted)))
    .sort(SORTS[sort].compare);

  const exportCsv = () => {
    const rows = [
      ['Claim ID', 'Filed', 'Patient ID', 'Policy', 'Diagnosis', 'Billed', 'Approved', 'Status', 'Flagged', 'Open disputes'],
      ...visible.map(c => [
        c.id,
        new Date(c.created_at).toISOString(),
        c.patient_id,
        c.policies?.policy_number,
        c.diagnosis_code,
        Number(c.total_billed),
        c.status === 'PENDING' || c.status === 'PROCESSING' ? '' : Number(c.approved_amount),
        c.status,
        Number(c.flagged_total || 0),
        (c.disputes ?? []).filter((d: any) => d.status === 'OPEN').length
      ])
    ];
    // The BOM makes Excel read the file as UTF-8.
    const url = URL.createObjectURL(new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `careclaim-${isPatient ? 'bills' : 'claims'}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // A rate over no decided claims is not 0%: there is nothing to take a rate of yet.
  const anyDecided = (claims ?? []).some(c => ['APPROVED', 'PARTIAL', 'DENIED'].includes(c.status));

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      <PageTitle>{isPatient ? 'My bills' : 'Claims'}</PageTitle>
      <header className="flex flex-wrap justify-between items-end gap-3 border-b border-rule pb-4">
        <div>
          <h1 className="text-3xl font-serif text-pine-deep">{isPatient ? 'My bills' : 'Claims dashboard'}</h1>
          <p className="text-sm text-ink-soft mt-1">
            {isPatient
              ? 'Claims a hospital filed for you, and bills you checked yourself.'
              : (profile.hospital_org ? `Discharge claims shared across ${profile.hospital_org}.` : 'Discharge claims your account filed.')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isPatient && (
            <button
              type="button"
              disabled={loadingDemo}
              onClick={loadDemoBill}
              className="btn btn-secondary"
            >
              <Zap size={15} /> {loadingDemo ? 'Creating...' : '1-click demo bill'}
            </button>
          )}
          <Link
            to="/claims/new"
            className="btn btn-primary"
          >
            <Plus size={16} /> {isPatient ? 'Check a bill' : 'New claim'}
          </Link>
        </div>
      </header>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard label={isPatient ? 'Total Bills' : 'Total Claims'} value={stats ? stats.total_claims : '—'} loading={!stats} />
        {/* A dash until a claim has been adjudicated: there is no turnaround to average yet. */}
        <KpiCard label="Avg Turnaround" value={stats?.avg_processing_ms ? `${(stats.avg_processing_ms / 1000).toFixed(1)}s` : '—'} sub="Per adjudication run" loading={!stats} />
        <KpiCard label="Approval Rate" value={stats && anyDecided ? `${stats.approval_rate.toFixed(1)}%` : '—'} loading={!stats} />
        <KpiCard label={isPatient ? 'Insurer Paid' : 'Total Payout'} value={stats?.total_payout ? formatCurrency(stats.total_payout) : '₹0'} loading={!stats} />
        <KpiCard
          label="Flagged for Review"
          value={flaggedTotal ? formatCurrency(flaggedTotal) : '₹0'}
          highlight
          sub={isPatient ? 'Charges worth questioning' : 'Not paid by the insurer'}
          loading={!stats}
        />
      </div>

      {flaggedTotal > 0 && (
        <div className="bg-amber/10 border border-amber/30 rounded-lg p-3 text-xs text-ink">
          {isPatient ? (
            <>
              <strong>{formatCurrency(flaggedTotal)}</strong> on your bills was flagged as a possible billing problem (billed twice, priced
              well above the usual rate, or similar). Open a bill to see the charges and dispute them with the hospital.
            </>
          ) : (
            <>
              <strong>{formatCurrency(flaggedTotal)}</strong> across this queue was flagged as a possible billing problem and left out of
              the payout. Patients can dispute these charges; answer them under Disputes.
            </>
          )}
        </div>
      )}

      {claims && claims.length > 0 && (
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search claims"
            placeholder={isPatient ? 'Search by ID, policy or diagnosis' : 'Search by ID, patient, policy or diagnosis'}
            className="w-full sm:w-auto sm:flex-1 sm:min-w-52 bg-paper border border-rule rounded px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
            <select aria-label="Filter by status" value={status} onChange={e => setStatus(e.target.value)} className="bg-paper border border-rule rounded px-3 py-2 text-sm">
              {['ALL', 'PENDING', 'PROCESSING', 'APPROVED', 'PARTIAL', 'DENIED'].map(s => (
                <option key={s} value={s}>{s === 'ALL' ? 'All statuses' : s.charAt(0) + s.slice(1).toLowerCase()}</option>
              ))}
            </select>
            <select aria-label="Sort by" value={sort} onChange={e => setSort(e.target.value as SortKey)} className="bg-paper border border-rule rounded px-3 py-2 text-sm">
              {Object.entries(SORTS).map(([key, s]) => (
                <option key={key} value={key}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between sm:justify-start gap-2">
            <button
              type="button"
              onClick={exportCsv}
              disabled={visible.length === 0}
              className="btn btn-secondary flex-1 sm:flex-none"
            >
              <Download size={15} /> Export CSV
            </button>
            <span className="text-xs font-mono text-ink-soft shrink-0">
              {visible.length} of {claims.length}
            </span>
          </div>
        </div>
      )}

      {/* Claims Table / Empty State */}
      <div className="bg-paper rounded-lg border border-rule overflow-hidden">
        {!claims ? (
          <Loading />
        ) : visible.length === 0 && claims.length > 0 ? (
          <div className="p-10 text-center text-sm text-ink-soft">
            Nothing matches that search and filter.{' '}
            <button type="button" onClick={() => { setSearch(''); setStatus('ALL'); }} className="text-pine font-medium hover:underline">
              Show everything
            </button>
          </div>
        ) : claims.length === 0 ? (
          <EmptyState
            icon={<FileText size={24} />}
            title={isPatient ? 'No hospital bills on record yet' : 'No claims in the intake queue'}
            actions={
              <>
                {isPatient && (
                  <button type="button" disabled={loadingDemo} onClick={loadDemoBill} className="btn btn-primary">
                    <Zap size={15} /> {loadingDemo ? 'Generating...' : 'Generate a demo bill (1-click)'}
                  </button>
                )}
                <Link to="/claims/new" className="btn btn-secondary">
                  {isPatient ? <><PenLine size={15} /> Check a custom bill</> : <><Plus size={15} /> Create a new claim</>}
                </Link>
              </>
            }
          >
            {isPatient
              ? `Your patient account (${profile.patient_id || 'PAT-1002'}) has no bills on record yet. Click below to generate a pre-configured hospital discharge bill and test real-time adjudication.`
              : 'Your hospital queue is currently empty. Click below to create a claim or load a sample scenario.'}
          </EmptyState>
        ) : (
          <>
            {/* A phone gets one card per claim; the table needs more width than it has. */}
            <ul className="sm:hidden divide-y divide-rule">
              {visible.map(claim => {
                const openDisputes = (claim.disputes ?? []).filter((d: any) => d.status === 'OPEN').length;
                return (
                  <li key={claim.id}>
                    <Link to={`/claims/${claim.id}`} className="block p-4 hover:bg-bone/50 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 font-mono">
                          <div className="text-sm font-medium">{shortId(claim.id)}</div>
                          <div className="text-xs text-ink-soft">{new Date(claim.created_at).toLocaleDateString()} · {claim.patient_id}</div>
                        </div>
                        {/* A run that died leaves the claim marked PROCESSING; it is waiting to be run again. */}
                        <StatusStamp status={claim.stalled ? 'PENDING' : claim.status} />
                      </div>
                      <dl className="mt-3 grid grid-cols-2 gap-3 font-mono text-sm">
                        <div>
                          <dt className="text-xs uppercase tracking-wider text-ink-soft">Billed</dt>
                          <dd>{formatCurrency(claim.total_billed)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase tracking-wider text-ink-soft">Approved</dt>
                          <dd className="font-bold text-pine-deep">{approvedDisplay(claim)}</dd>
                        </div>
                      </dl>
                      {claim.stalled && <div className="mt-2 text-xs font-mono text-amber-ink">Last run stopped</div>}
                      {openDisputes > 0 && (
                        <div className="mt-2 text-xs font-mono text-amber-ink">
                          {openDisputes} open {openDisputes === 1 ? 'dispute' : 'disputes'}
                        </div>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-bone border-b border-rule text-xs uppercase tracking-wider font-mono text-ink-soft">
                  <tr>
                    <th className="p-4 font-normal">ID / Date</th>
                    <th className="p-4 font-normal">Patient</th>
                    <th className="p-4 font-normal">Billed</th>
                    <th className="p-4 font-normal">Approved</th>
                    <th className="p-4 font-normal">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {visible.map((claim, idx) => {
                    const openDisputes = (claim.disputes ?? []).filter((d: any) => d.status === 'OPEN').length;
                    return (
                      <motion.tr
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(idx, 10) * 0.05 }}
                        key={claim.id}
                        onClick={() => navigate(`/claims/${claim.id}`)}
                        className="hover:bg-bone/50 cursor-pointer transition-colors"
                      >
                        <td className="p-4 font-mono text-xs text-ink-soft">
                          {/* The link is what the keyboard reaches; the row click is the same action for the mouse. */}
                          <Link
                            to={`/claims/${claim.id}`}
                            onClick={e => e.stopPropagation()}
                            className="block text-ink font-medium hover:underline"
                          >
                            {shortId(claim.id)}
                          </Link>
                          <div>{new Date(claim.created_at).toLocaleDateString()}</div>
                        </td>
                        <td className="p-4">{claim.patient_id}</td>
                        <td className="p-4 font-mono">{formatCurrency(claim.total_billed)}</td>
                        <td className="p-4 font-mono font-bold text-pine-deep">
                          {approvedDisplay(claim)}
                        </td>
                        <td className="p-4">
                          {/* A run that died leaves the claim marked PROCESSING; it is waiting to be run again. */}
                          <StatusStamp status={claim.stalled ? 'PENDING' : claim.status} />
                          {claim.stalled && <div className="mt-1.5 text-xs font-mono text-amber-ink">Last run stopped</div>}
                          {openDisputes > 0 && (
                            <div className="mt-1.5 text-xs font-mono text-amber-ink">
                              {openDisputes} open {openDisputes === 1 ? 'dispute' : 'disputes'}
                            </div>
                          )}
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, highlight, sub, loading }: { label: string; value: string | number; highlight?: boolean; sub?: string; loading?: boolean }) {
  return (
    <div className={`p-4 rounded-lg border transition-all ${highlight ? 'bg-pine/5 border-pine/30 ring-1 ring-pine/20' : 'bg-paper border-rule'}`}>
      <div className={`text-xs font-mono uppercase tracking-wider mb-1.5 ${highlight ? 'text-pine-deep font-bold' : 'text-ink-soft'}`}>
        {label}
      </div>
      {loading ? (
        <div className="h-7 w-20 bg-rule/40 rounded animate-pulse my-1" />
      ) : (
        <div className={`text-2xl md:text-3xl font-mono tabular-nums font-bold ${highlight ? 'text-vermilion' : 'text-pine-deep'}`}>
          {value}
        </div>
      )}
      {sub && <div className="text-xs font-mono text-ink-soft mt-1">{sub}</div>}
    </div>
  );
}
