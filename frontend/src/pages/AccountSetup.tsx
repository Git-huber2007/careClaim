import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { fetchApi } from '../lib/api';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';

const ROLES = [
  { role: 'HOSPITAL', title: 'Hospital staff', text: 'Submit discharge bills and run the adjudication agent.' },
  { role: 'PATIENT', title: 'Patient', text: 'See claims filed against your policy and check a bill yourself.' }
] as const;

/** One-time step after first sign-in: the backend needs every account to be a hospital or a patient. */
export function AccountSetup() {
  const navigate = useNavigate();
  const [role, setRole] = useState<'HOSPITAL' | 'PATIENT' | ''>(() => {
    const saved = localStorage.getItem('careclaim_portal_role');
    return saved === 'HOSPITAL' || saved === 'PATIENT' ? saved : '';
  });
  const [policyNumber, setPolicyNumber] = useState('');
  const [patientId, setPatientId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) return navigate('/login', { replace: true });
      // Already set up? Then there is nothing to do here.
      fetchApi('/api/me').then(me => { if (me.profile) navigate('/dashboard', { replace: true }); }).catch(() => {});
    });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetchApi('/api/me/profile', {
        method: 'POST',
        body: JSON.stringify(
          role === 'PATIENT'
            ? { role, policy_number: policyNumber.trim(), patient_id: patientId.trim() }
            : { role }
        )
      });
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-lg bg-paper p-8 rounded-lg border border-rule space-y-6">
        <div>
          <h1 className="text-3xl font-serif text-pine-deep">Set up your account</h1>
          <p className="text-sm text-ink-soft mt-1">Choose how you will use CareClaim. This cannot be changed later.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ROLES.map(r => (
            <button
              key={r.role}
              type="button"
              aria-pressed={role === r.role}
              onClick={() => setRole(r.role)}
              className={`text-left p-4 rounded border transition-colors ${role === r.role ? 'border-pine bg-pine/5' : 'border-rule bg-bone hover:border-ink-soft/50'}`}
            >
              <div className="font-medium text-pine-deep">{r.title}</div>
              <div className="text-xs text-ink-soft mt-1">{r.text}</div>
            </button>
          ))}
        </div>

        {role === 'PATIENT' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-mono uppercase text-ink-soft mb-1">Policy Number</label>
                <input required value={policyNumber} onChange={e => setPolicyNumber(e.target.value)} placeholder="STAR-402-GOLD" className="w-full bg-bone border border-rule rounded px-3 py-2 text-sm font-mono" />
              </div>
              <div>
                <label className="block text-xs font-mono uppercase text-ink-soft mb-1">Patient ID</label>
                <input required value={patientId} onChange={e => setPatientId(e.target.value)} placeholder="PAT-1001" className="w-full bg-bone border border-rule rounded px-3 py-2 text-sm font-mono" />
              </div>
            </div>
            <p className="text-xs text-ink-soft">Both are printed on your insurance card. They link this login to your bills.</p>
          </div>
        )}

        <div className="flex items-center justify-between">
          <button type="button" onClick={() => supabase.auth.signOut().then(() => navigate('/login', { replace: true }))} className="text-sm text-ink-soft hover:underline">
            Sign out
          </button>
          <button type="submit" disabled={!role || submitting} className="bg-pine hover:bg-pine-deep text-bone rounded px-5 py-2 text-sm font-medium transition-colors disabled:opacity-50">
            {submitting ? 'Saving...' : 'Continue'}
          </button>
        </div>
      </form>
    </div>
  );
}
