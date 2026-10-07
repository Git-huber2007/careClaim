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
        <div className="flex items-center gap-2">
          {isPatient && (
            <button
              type="button"
              disabled={loadingDemo}
              onClick={loadDemoBill}
              className="bg-bone hover:bg-pine/5 border border-rule hover:border-pine text-pine-deep px-3.5 py-2 rounded flex items-center gap-1.5 text-sm font-medium transition-colors cursor-pointer shadow-xs disabled:opacity-50"
            >
              <span>⚡</span> {loadingDemo ? 'Creating...' : '1-Click Demo Bill'}
            </button>
          )}
          <Link
            to="/claims/new"
            className="bg-pine hover:bg-pine-deep text-bone px-4 py-2 rounded flex items-center gap-2 text-sm font-medium transition-colors"
          >
            <Plus size={16} /> {isPatient ? 'Check a Bill' : 'New Claim'}
          </Link>
        </div>
      </header>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard label={isPatient ? 'Total Bills' : 'Total Claims'} value={stats?.total_claims || 0} />
        <KpiCard label="Avg Processing" value={`${(stats?.avg_processing_ms / 1000 || 0).toFixed(1)}s`} />
        <KpiCard label="Approval Rate" value={`${(stats?.approval_rate || 0).toFixed(1)}%`} />
        <KpiCard label={isPatient ? 'Insurer Paid' : 'Total Payout'} value={stats?.total_payout ? formatCurrency(stats.total_payout) : '₹0'} />
      </div>

      {/* Claims Table / Empty State */}
      <div className="bg-paper rounded-lg border border-rule overflow-hidden">
        {(!claims || claims.length === 0) ? (
          <div className="p-10 text-center space-y-4">
            <div className="w-14 h-14 bg-pine/10 text-pine rounded-full flex items-center justify-center mx-auto text-2xl">
              📄
            </div>
            <div className="max-w-md mx-auto space-y-1">
              <h3 className="font-serif text-2xl text-pine-deep">
                {isPatient ? 'No Hospital Bills on Record Yet' : 'No Claims in Intake Queue'}
              </h3>
              <p className="text-xs text-ink-soft leading-relaxed">
                {isPatient
                  ? `Your patient account (${profile.patient_id || 'PAT-1002'}) has no bills on record yet. Click below to generate a pre-configured hospital discharge bill and test real-time adjudication.`
                  : 'Your hospital queue is currently empty. Click below to create a claim or load a sample scenario.'}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              {isPatient ? (
                <button
                  type="button"
                  disabled={loadingDemo}
                  onClick={loadDemoBill}
                  className="bg-pine hover:bg-pine-deep text-bone px-5 py-2.5 rounded text-xs font-mono uppercase tracking-wider font-semibold transition-all cursor-pointer shadow-sm disabled:opacity-50"
                >
                  {loadingDemo ? 'Generating...' : '⚡ Generate Demo Bill (1-Click)'}
                </button>
              ) : null}
              <Link
                to="/claims/new"
                className="bg-bone hover:bg-rule/40 border border-rule text-ink px-4 py-2.5 rounded text-xs font-mono uppercase tracking-wider font-semibold transition-all"
              >
                {isPatient ? '📝 Check a Custom Bill' : '➕ Create New Claim'}
              </Link>
            </div>
          </div>
        ) : (
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
              {claims.map((claim, idx) => {
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
            </tbody>
          </table>
        )}
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
