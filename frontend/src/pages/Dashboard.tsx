import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { fetchApi } from '../lib/api';
import { formatCurrency } from '../lib/format';
import { StatusStamp } from '../components/StatusStamp';
import { motion } from 'motion/react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';

export function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);
  const [claims, setClaims] = useState<any[]>([]);

  useEffect(() => {
    fetchApi('/api/stats').then(setStats).catch(err => toast.error(err.message));
    // The backend wraps the list: { claims: [...] }
    fetchApi('/api/claims').then(res => setClaims(res.claims)).catch(err => toast.error(err.message));
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      <header className="flex justify-between items-end border-b border-rule pb-4">
        <div>
          <h1 className="text-3xl font-serif text-pine-deep">Claims Dashboard</h1>
          <p className="text-sm text-ink-soft font-mono mt-1">CareClaim AI Terminal</p>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={signOut} className="text-sm text-ink-soft hover:underline">Sign out</button>
          <Link to="/disputes" className="text-sm text-pine font-medium hover:underline">Disputes</Link>
          <button
            onClick={() => navigate('/claims/new')}
            className="bg-pine hover:bg-pine-deep text-bone px-4 py-2 rounded flex items-center gap-2 text-sm font-medium transition-colors"
          >
            <Plus size={16} /> New Claim
          </button>
        </div>
      </header>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard label="Total Claims" value={stats?.total_claims || 0} />
        <KpiCard label="Avg Processing" value={`${(stats?.avg_processing_ms / 1000 || 0).toFixed(1)}s`} />
        <KpiCard label="Approval Rate" value={`${(stats?.approval_rate || 0).toFixed(1)}%`} />
        <KpiCard label="Total Payout" value={stats?.total_payout ? formatCurrency(stats.total_payout) : '₹0'} />
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
            {claims.map((claim, idx) => (
              <motion.tr 
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                key={claim.id} 
                onClick={() => navigate(`/claims/${claim.id}`)}
                className="hover:bg-bone/50 cursor-pointer transition-colors"
              >
                <td className="p-4 font-mono text-xs text-ink-soft">
                  <div className="text-ink font-medium">{claim.id.split('-')[0]}</div>
                  <div>{new Date(claim.created_at).toLocaleDateString()}</div>
                </td>
                <td className="p-4">{claim.patient_id}</td>
                <td className="p-4 font-mono">{formatCurrency(claim.total_billed)}</td>
                <td className="p-4 font-mono font-bold text-pine-deep">
                  {claim.status === 'PENDING' || claim.status === 'PROCESSING' 
                    ? '-' 
                    : formatCurrency(claim.approved_amount)}
                </td>
                <td className="p-4">
                  <StatusStamp status={claim.status} />
                </td>
              </motion.tr>
            ))}
            {claims.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-ink-soft font-mono text-xs uppercase tracking-widest">
                  No claims found
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
