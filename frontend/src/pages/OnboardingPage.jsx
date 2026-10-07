import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { IconBuilding, IconLogo, IconUser, Spinner } from '../components/Icons';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

const ROLES = [
  {
    role: 'HOSPITAL',
    icon: IconBuilding,
    title: 'I work at a hospital',
    text: 'Submit discharge bills, run the adjudication agent, and answer patient disputes.',
  },
  {
    role: 'PATIENT',
    icon: IconUser,
    title: 'I am a patient',
    text: 'See the bills filed against your policy, check a bill yourself, and question charges that look wrong.',
  },
];

/** One-time account setup: every login is either a hospital or a patient account. */
export default function OnboardingPage() {
  const { session, loading, profile, profileLoading, user, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState('');
  const [policyNumber, setPolicyNumber] = useState('');
  const [patientId, setPatientId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (loading || profileLoading) {
    return (
      <div className="grid h-screen place-items-center text-ink-400">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  if (profile) return <Navigate to="/dashboard" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (role === 'PATIENT' && (!policyNumber.trim() || !patientId.trim())) {
      return setError('Enter both your policy number and your patient ID.');
    }

    setSubmitting(true);
    try {
      await api.createProfile(
        role === 'PATIENT' ? { role, policy_number: policyNumber.trim(), patient_id: patientId.trim() } : { role }
      );
      await refreshProfile();
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-full place-items-center p-6">
      <form onSubmit={handleSubmit} className="glass w-full max-w-xl p-8 animate-fade-up" noValidate id="onboarding-form">
        <div className="mb-6 flex items-center gap-3">
          <IconLogo />
          <div>
            <h1 className="text-xl font-bold text-white">Set up your account</h1>
            <p className="text-sm text-ink-400">{user?.email}</p>
          </div>
        </div>

        <p className="label">How will you use CareClaim?</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {ROLES.map(({ role: r, icon: Icon, title, text }) => (
            <button
              key={r}
              id={`role-${r.toLowerCase()}`}
              type="button"
              aria-pressed={role === r}
              onClick={() => { setRole(r); setError(''); }}
              className={`rounded-xl border p-4 text-left transition cursor-pointer ${
                role === r
                  ? 'border-brand-400/40 bg-brand-400/[0.06] ring-1 ring-inset ring-brand-400/20'
                  : 'border-white/[0.06] bg-ink-950/40 hover:border-white/15'
              }`}
            >
              <Icon className={`h-6 w-6 ${role === r ? 'text-brand-300' : 'text-ink-300'}`} />
              <p className="mt-3 font-semibold text-white">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-400">{text}</p>
            </button>
          ))}
        </div>

        {role === 'PATIENT' && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="onboard-policy" className="label">Policy number</label>
              <input
                id="onboard-policy"
                className="input font-mono uppercase"
                placeholder="STAR-402-GOLD"
                value={policyNumber}
                onChange={(e) => setPolicyNumber(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="onboard-patient" className="label">Patient ID</label>
              <input
                id="onboard-patient"
                className="input font-mono uppercase"
                placeholder="PAT-1001"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
              />
            </div>
            <p className="text-xs text-ink-400 sm:col-span-2">
              Both are printed on your insurance card. They link this login to your bills, so only you can see them.
            </p>
          </div>
        )}

        {error && <p className="mt-5 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300 ring-1 ring-rose-500/20">{error}</p>}

        <div className="mt-6 flex items-center justify-between gap-3">
          <button type="button" onClick={signOut} className="text-xs font-medium text-ink-400 transition hover:text-white cursor-pointer">
            Sign out
          </button>
          <button id="onboarding-submit" type="submit" className="btn-primary px-6 py-3" disabled={!role || submitting}>
            {submitting && <Spinner />}
            Continue
          </button>
        </div>
        <p className="mt-4 text-right text-[11px] text-ink-400">The account type cannot be changed later.</p>
      </form>
    </div>
  );
}
