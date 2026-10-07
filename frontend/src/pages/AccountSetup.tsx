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
  // Never pre-selected: the choice is permanent, so it has to be made here, on purpose.
  const [role, setRole] = useState<'HOSPITAL' | 'PATIENT' | ''>('');
  const [policyNumber, setPolicyNumber] = useState('');
  const [patientId, setPatientId] = useState('');
  const [hospitalOrg, setHospitalOrg] = useState('Apollo Hospitals');
  const [customOrg, setCustomOrg] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [codeRequired, setCodeRequired] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) return navigate('/login', { replace: true });
      fetchApi('/api/me')
        .then(me => {
          // Already set up? Then there is nothing to do here.
          if (me.profile) return navigate('/dashboard', { replace: true });
          setCodeRequired(Boolean(me.hospital_code_required));
        })
        .catch(() => {});
    });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const selectedOrg = hospitalOrg === 'OTHER' ? customOrg.trim() : hospitalOrg;
      await fetchApi('/api/me/profile', {
        method: 'POST',
        body: JSON.stringify(
          role === 'PATIENT'
            ? { role, policy_number: policyNumber.trim(), patient_id: patientId.trim() }
            : {
                role,
                hospital_org: selectedOrg || 'CareClaim General Hospital',
                access_code: accessCode.trim() || undefined,
              }
        )
      });
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      // The server asks for a code this page did not know about (its first
      // request failed, or was still out): show the field to enter it in.
      if (err.status === 403 && role === 'HOSPITAL') setCodeRequired(true);
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
          <p className="text-sm text-ink-soft mt-1">Choose how you will use CareClaim. This role is permanent.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ROLES.map(r => (
            <button
              key={r.role}
              type="button"
              aria-pressed={role === r.role}
              onClick={() => setRole(r.role)}
              className={`text-left p-4 rounded border transition-colors ${role === r.role ? 'border-pine bg-pine/5 ring-1 ring-pine' : 'border-rule bg-bone hover:border-ink-soft/50'}`}
            >
              <div className="font-medium text-pine-deep">{r.title}</div>
              <div className="text-xs text-ink-soft mt-1">{r.text}</div>
            </button>
          ))}
        </div>

        {role === 'HOSPITAL' && (
          <div className="space-y-4 pt-1 border-t border-rule">
            <div>
              <label htmlFor="setup-hospital-org" className="block text-xs font-mono uppercase text-ink-soft mb-1">
                Hospital / Organization Queue
              </label>
              <select
                id="setup-hospital-org"
                value={hospitalOrg}
                onChange={e => setHospitalOrg(e.target.value)}
                className="w-full bg-bone border border-rule rounded px-3 py-2 text-sm font-sans"
              >
                <option value="Apollo Hospitals">Apollo Hospitals</option>
                <option value="Max Healthcare">Max Healthcare</option>
                <option value="Fortis Hospital">Fortis Hospital</option>
                <option value="CareClaim General Hospital">CareClaim General Hospital</option>
                <option value="OTHER">Other / Custom Organization…</option>
              </select>
              <p className="text-xs text-ink-soft mt-1">
                Colleagues in the same organization share claim queues and dispute reviews.
              </p>
            </div>

            {hospitalOrg === 'OTHER' && (
              <div>
                <label htmlFor="setup-custom-org" className="block text-xs font-mono uppercase text-ink-soft mb-1">
                  Custom Organization Name
                </label>
                <input
                  id="setup-custom-org"
                  required
                  value={customOrg}
                  onChange={e => setCustomOrg(e.target.value)}
                  placeholder="e.g. Manipal Hospital, Whitefield"
                  className="w-full bg-bone border border-rule rounded px-3 py-2 text-sm font-sans"
                />
              </div>
            )}

            <div>
              <div className="flex justify-between items-center mb-1">
                <label htmlFor="setup-access-code" className="text-xs font-mono uppercase text-ink-soft">
                  Hospital Staff Access Code {codeRequired && <span className="text-vermilion">*</span>}
                </label>
                <span className="text-[11px] font-mono text-pine-deep bg-pine/10 px-1.5 py-0.5 rounded">
                  Demo: CARECLAIM-HOSPITAL-2026
                </span>
              </div>
              <input
                id="setup-access-code"
                required={codeRequired}
                type="password"
                autoComplete="off"
                value={accessCode}
                onChange={e => setAccessCode(e.target.value)}
                placeholder="Enter hospital verification code"
                className="w-full bg-bone border border-rule rounded px-3 py-2 text-sm font-mono"
              />
              <p className="text-xs text-ink-soft mt-1">
                Authorized staff code prevents unverified users from claiming hospital roles.
              </p>
            </div>
          </div>
        )}

        {role === 'PATIENT' && (
          <div className="space-y-4 pt-1 border-t border-rule">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="setup-policy-number" className="block text-xs font-mono uppercase text-ink-soft mb-1">Policy Number</label>
                <input id="setup-policy-number" required value={policyNumber} onChange={e => setPolicyNumber(e.target.value)} placeholder="STAR-402-GOLD" className="w-full bg-bone border border-rule rounded px-3 py-2 text-sm font-mono" />
              </div>
              <div>
                <label htmlFor="setup-patient-id" className="block text-xs font-mono uppercase text-ink-soft mb-1">Patient ID</label>
                <input id="setup-patient-id" required value={patientId} onChange={e => setPatientId(e.target.value)} placeholder="PAT-1001" className="w-full bg-bone border border-rule rounded px-3 py-2 text-sm font-mono" />
              </div>
            </div>
            <p className="text-xs text-ink-soft">
              Both are printed on your insurance card. To prevent account takeover, the email you registered with must match your policyholder records.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-rule">
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
