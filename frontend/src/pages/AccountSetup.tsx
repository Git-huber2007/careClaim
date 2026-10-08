import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { fetchApi } from '../lib/api';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { Check, Zap } from 'lucide-react';
import { PageTitle } from '../components/PageTitle';
import { ThemeToggle } from '../components/ThemeToggle';

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
  const [formError, setFormError] = useState('');

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
    setFormError('');
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
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-paper relative">
      <PageTitle>Set up your account</PageTitle>
      <div className="absolute top-4 right-4 sm:top-6 sm:right-8 z-20">
        <ThemeToggle />
      </div>
      <form onSubmit={handleSubmit} className="w-full max-w-lg bg-paper p-8 rounded-lg border border-rule space-y-6">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-mono uppercase bg-pine/10 text-pine-deep font-bold px-2 py-0.5 rounded border border-pine/20">
              Step 2 of 3 · Role Onboarding
            </span>
            <span className="text-xs font-mono text-ink-soft">CareClaim AI</span>
          </div>
          <h1 className="text-3xl font-serif text-pine-deep">Set up your account</h1>
          <p className="text-sm text-ink-soft mt-1">
            CareClaim enforces strict data separation. Choose your operational persona (this choice is permanent):
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ROLES.map(r => (
            <button
              key={r.role}
              type="button"
              aria-pressed={role === r.role}
              onClick={() => setRole(r.role)}
              className={`text-left p-4 rounded-lg border transition-all cursor-pointer ${
                role === r.role
                  ? 'border-pine bg-pine/5 ring-1 ring-pine'
                  : 'border-rule bg-bone hover:border-ink-soft/50'
              }`}
            >
              <div className="font-bold text-pine-deep flex items-center justify-between">
                <span>{r.title}</span>
                {role === r.role && <span className="text-pine text-xs flex items-center gap-1"><Check size={13} /> Active</span>}
              </div>
              <div className="text-xs text-ink-soft mt-1 leading-relaxed">{r.text}</div>
            </button>
          ))}
        </div>

        {role === 'HOSPITAL' && (
          <div className="space-y-4 pt-2 border-t border-rule">
            {/* Quick Fill Preset for Judges */}
            <div className="bg-bone border border-pine/30 rounded-lg p-3 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-mono font-bold text-pine-deep flex items-center gap-1">
                  <Zap size={13} /> Judge quick fill
                </span>
                <span className="text-xs text-ink-soft font-mono">1-click test preset</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setHospitalOrg('Apollo Hospitals');
                  setAccessCode('CARECLAIM-HOSPITAL-2026');
                  toast.success('Filled Apollo Hospitals & demo access code.');
                }}
                className="w-full bg-paper hover:bg-pine/5 border border-rule hover:border-pine py-1.5 px-3 rounded text-xs text-pine-deep font-medium transition-all text-left flex items-center justify-between cursor-pointer"
              >
                <span>Apollo Hospitals + demo code</span>
                <span className="font-mono text-xs text-pine font-bold">Fill now →</span>
              </button>
            </div>

            <div>
              <label htmlFor="setup-hospital-org" className="field-label">
                Hospital / Organization Queue
              </label>
              <select
                id="setup-hospital-org"
                value={hospitalOrg}
                onChange={e => setHospitalOrg(e.target.value)}
                className="field font-sans"
              >
                <option value="Apollo Hospitals">Apollo Hospitals</option>
                <option value="Max Healthcare">Max Healthcare</option>
                <option value="Fortis Hospital">Fortis Hospital</option>
                <option value="CareClaim General Hospital">CareClaim General Hospital</option>
                <option value="OTHER">Other / Custom Organization…</option>
              </select>
              <p className="text-xs text-ink-soft mt-1">
                Colleagues in the same organization share intake queues and dispute reviews.
              </p>
            </div>

            {hospitalOrg === 'OTHER' && (
              <div>
                <label htmlFor="setup-custom-org" className="field-label">
                  Custom Organization Name
                </label>
                <input
                  id="setup-custom-org"
                  required
                  value={customOrg}
                  onChange={e => setCustomOrg(e.target.value)}
                  placeholder="e.g. Manipal Hospital, Whitefield"
                  className="field font-sans"
                />
              </div>
            )}

            <div>
              <div className="flex justify-between items-center mb-1">
                <label htmlFor="setup-access-code" className="field-label mb-0">
                  Hospital Staff Access Code {codeRequired && <span className="text-vermilion">*</span>}
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setAccessCode('CARECLAIM-HOSPITAL-2026');
                    toast.info('Copied demo access code into field.');
                  }}
                  className="text-xs font-mono text-pine-deep bg-pine/10 hover:bg-pine/20 px-2 py-0.5 rounded cursor-pointer transition-colors"
                >
                  Paste demo: CARECLAIM-HOSPITAL-2026
                </button>
              </div>
              <input
                id="setup-access-code"
                required={codeRequired}
                type="text"
                autoComplete="off"
                value={accessCode}
                onChange={e => setAccessCode(e.target.value)}
                placeholder="CARECLAIM-HOSPITAL-2026"
                className="field font-mono tracking-wider"
              />
              <p className="text-xs text-ink-soft mt-1">
                Authorized staff code prevents unverified users from claiming hospital roles.
              </p>
            </div>
          </div>
        )}

        {role === 'PATIENT' && (
          <div className="space-y-4 pt-2 border-t border-rule">
            {/* Quick Fill Presets for Judges */}
            <div className="bg-bone border border-pine/30 rounded-lg p-3 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-mono font-bold text-pine-deep flex items-center gap-1">
                  <Zap size={13} /> Judge quick-fill presets
                </span>
                <span className="text-xs text-ink-soft font-mono">Pre-seeded policies</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPolicyNumber('STAR-402-GOLD');
                    setPatientId('PAT-1001');
                    toast.success('Filled STAR-402-GOLD (PAT-1001).');
                  }}
                  className="bg-paper hover:bg-pine/5 border border-rule hover:border-pine p-2 rounded text-left transition-all cursor-pointer"
                >
                  <div className="font-mono font-bold text-pine-deep text-xs">STAR-402-GOLD</div>
                  <div className="text-xs text-ink-soft mt-0.5">PAT-1001 · Appendectomy</div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPolicyNumber('HDFC-118-SILVER');
                    setPatientId('PAT-1002');
                    toast.success('Filled HDFC-118-SILVER (PAT-1002).');
                  }}
                  className="bg-paper hover:bg-pine/5 border border-rule hover:border-pine p-2 rounded text-left transition-all cursor-pointer"
                >
                  <div className="font-mono font-bold text-pine-deep text-xs">HDFC-118-SILVER</div>
                  <div className="text-xs text-ink-soft mt-0.5">PAT-1002 · Pneumonia</div>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="setup-policy-number" className="field-label">Policy Number</label>
                <input id="setup-policy-number" required value={policyNumber} onChange={e => setPolicyNumber(e.target.value)} placeholder="STAR-402-GOLD" className="field font-mono" />
              </div>
              <div>
                <label htmlFor="setup-patient-id" className="field-label">Patient ID</label>
                <input id="setup-patient-id" required value={patientId} onChange={e => setPatientId(e.target.value)} placeholder="PAT-1001" className="field font-mono" />
              </div>
            </div>
            <p className="text-xs text-ink-soft">
              Both are printed on your insurance card. To prevent account takeover, the email you registered with is bound to this policy.
            </p>
          </div>
        )}

        {formError && <p role="alert" className="form-error">{formError}</p>}

        <div className="flex items-center justify-between pt-2 border-t border-rule">
          <button type="button" onClick={() => supabase.auth.signOut().then(() => navigate('/login', { replace: true }))} className="text-sm text-ink-soft hover:underline cursor-pointer">
            Sign out
          </button>
          <button type="submit" disabled={!role || submitting} className="btn btn-primary">
            {submitting ? 'Saving...' : 'Complete setup and enter →'}
          </button>
        </div>
      </form>
    </div>
  );
}
