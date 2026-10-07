import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { fetchApi } from '../lib/api';
import { useAccount } from '../lib/account';
import { approvedDisplay } from '../lib/claims';
import { formatCurrency, shortId } from '../lib/format';
import { StatusStamp } from '../components/StatusStamp';
import { motion } from 'motion/react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

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

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      <header className="flex justify-between items-end border-b border-rule pb-4">
        <div>
          <h1 className="text-3xl font-serif text-pine-deep">{isPatient ? 'My Bills' : 'Claims Dashboard'}</h1>
          <p className="text-sm text-ink-soft mt-1">
            {isPatient
              ? 'Claims a hospital filed for you, and bills you checked yourself.'
              : (profile.hospital_org ? `Discharge claims shared across ${profile.hospital_org}.` : 'Discharge claims your account filed.')}
          </p>
        </div>
        <Link
          to="/claims/new"
          className="bg-pine hover:bg-pine-deep text-bone px-4 py-2 rounded flex items-center gap-2 text-sm font-medium transition-colors"
        >
          <Plus size={16} /> {isPatient ? 'Check a Bill' : 'New Claim'}
        </Link>
      </header>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard label={isPatient ? 'Total Bills' : 'Total Claims'} value={stats?.total_claims || 0} />
        <KpiCard label="Avg Processing" value={`${(stats?.avg_processing_ms / 1000 || 0).toFixed(1)}s`} />
        <KpiCard label="Approval Rate" value={`${(stats?.approval_rate || 0).toFixed(1)}%`} />
        <KpiCard label={isPatient ? 'Insurer Paid' : 'Total Payout'} value={stats?.total_payout ? formatCurrency(stats.total_payout) : '₹0'} />
      </div>

      {/* Claims Table */}
      <div className="bg-paper rounded-lg border border-rule overflow-hidden">
        <table className="w-full text-left text-sm">
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
            {claims?.map((claim, idx) => {
              const openDisputes = (claim.disputes ?? []).filter((d: any) => d.status === 'OPEN').length;
              return (
                <motion.tr
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
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
                    <StatusStamp status={claim.status} />
                    {openDisputes > 0 && (
                      <div className="mt-1.5 text-[11px] font-mono text-amber">
                        {openDisputes} open {openDisputes === 1 ? 'dispute' : 'disputes'}
                      </div>
                    )}
                  </td>
                </motion.tr>
              );
            })}
            {(!claims || claims.length === 0) && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-ink-soft font-mono text-xs uppercase tracking-widest">
                  {!claims ? 'Loading...' : isPatient ? 'No bills yet' : 'No claims found'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KpiCard({ label, value }: { label: string, value: string | number }) {
  return (
    <div className="bg-paper p-4 rounded-lg border border-rule shadow-sm">
      <div className="text-xs font-mono uppercase tracking-wider text-ink-soft mb-2">{label}</div>
      <div className="text-3xl font-serif text-pine-deep">{value}</div>
    </div>
  );
}
