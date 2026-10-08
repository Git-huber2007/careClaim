import { useState } from 'react';
import { useNavigate } from 'react-router';
import { supabase } from '../lib/supabase';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { PageTitle } from '../components/PageTitle';
import { ThemeToggle } from '../components/ThemeToggle';
import { Building2, User, ArrowLeft, Mail, KeyRound, CheckCircle2, Info, MessageSquare, ShieldCheck, Timer, Zap } from 'lucide-react';

type AuthMode = 'login' | 'register' | 'forgot_password';
type PortalRole = 'HOSPITAL' | 'PATIENT';

export function Login() {
  const navigate = useNavigate();
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  // Only tailors the hints on the registration form. The account's real role
  // is chosen once on the setup screen and kept by the backend.
  const [portalRole, setPortalRole] = useState<PortalRole>('HOSPITAL');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  // Why the last attempt failed. It stays on the form until the next attempt or a change of tab.
  const [formError, setFormError] = useState('');
  const registering = authMode === 'register';

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return setFormError('Please enter your registered email address.');
    setFormError('');
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setResetSent(true);
      toast.success('Password reset link sent to your email.');
    } catch (err: any) {
      setFormError(err.message || 'Failed to send password reset email.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setLoading(true);

    try {
      if (authMode === 'login') {
        const { error, data } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        if (!data.session) return setFormError('Unable to establish session. Please verify your email.');
        toast.success('Signed in');
      } else {
        const { error, data } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (error) throw error;

        // With email confirmation on, Supabase answers an already-registered
        // address with a user that has no identities, and sends no email.
        if (data.user && data.user.identities?.length === 0) {
          setAuthMode('login');
          setFormError('An account with this email already exists. Sign in, or reset your password.');
          return;
        }
        if (!data.session) {
          toast.success('Registration successful! Please check your email to confirm your account before signing in.');
          setAuthMode('login');
          return;
        }
        toast.success('Account created successfully!');
      }

      navigate('/dashboard');
    } catch (err: any) {
      setFormError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex relative">
      <PageTitle>Sign in</PageTitle>
      {/* Left Form */}
      <div className="w-full lg:w-7/12 flex items-center justify-center p-6 md:p-10 bg-paper relative">
        <div className="absolute top-4 right-4 sm:top-6 sm:right-8 z-20">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-lg space-y-6">
          {/* Header & Product Mission */}
          <div>
            <div className="flex items-center justify-between">
              <h1 className="text-3xl md:text-4xl font-serif text-pine-deep flex items-center gap-2">
                CareClaim{' '}
                <span className="theme-fixed text-bone bg-pine px-2 py-0.5 rounded text-xl md:text-2xl font-mono align-middle inline-block transform -translate-y-0.5 font-bold">
                  AI
                </span>
              </h1>
              <span className="text-xs font-mono uppercase bg-pine/10 text-pine-deep font-bold px-2.5 py-1 rounded-full border border-pine/20">
                Judge / Demo Guide
              </span>
            </div>
            <p className="text-ink-soft mt-1.5 text-sm font-medium">
              Autonomous Medical Claim Adjudication, Overcharge Prevention & Patient Audit.
            </p>

            {/* Core Value Pillars for Judges */}
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="bg-bone border border-rule rounded p-2.5">
                <div className="font-bold text-pine-deep flex items-center gap-1">
                  <Timer size={14} /> 10-second discharge
                </div>
                <div className="text-ink-soft text-xs mt-0.5">
                  Eliminates 4 to 6 hour manual discharge approval delays for patients.
                </div>
              </div>
              <div className="bg-bone border border-rule rounded p-2.5">
                <div className="font-bold text-vermilion flex items-center gap-1">
                  <ShieldCheck size={14} /> Stops overcharging
                </div>
                <div className="text-ink-soft text-xs mt-0.5">
                  Audits line items against rate cards; flags markups, unbundling & duplicates.
                </div>
              </div>
            </div>
          </div>

          {/* Quick-Start Demo Credentials Card for Judges */}
          <div className="bg-bone border-2 border-pine/30 rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-mono uppercase font-bold text-pine-deep flex items-center gap-1.5">
                <Zap size={14} /> Evaluator 1-Click Credentials
              </span>
              <span className="text-xs font-mono text-ink-soft bg-paper px-2 py-0.5 rounded border border-rule">
                Click to auto-fill
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setPortalRole('HOSPITAL');
                  setEmail('doctor.demo@careclaim.org');
                  setPassword('CareClaim2026!');
                  toast.info('Filled Hospital Staff demo credentials.');
                }}
                className="text-left p-2.5 bg-paper hover:bg-pine/5 border border-rule hover:border-pine rounded transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-pine-deep group-hover:text-pine">
                  <Building2 size={14} /> Hospital staff
                </div>
                <div className="text-xs text-ink-soft font-mono mt-1 truncate">
                  doctor.demo@careclaim.org
                </div>
                <div className="text-xs text-ink-soft mt-0.5 leading-tight">
                  Intake, rate audit & AI run
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPortalRole('PATIENT');
                  setEmail('patient.demo@careclaim.org');
                  setPassword('CareClaim2026!');
                  toast.info('Filled Patient demo credentials.');
                }}
                className="text-left p-2.5 bg-paper hover:bg-pine/5 border border-rule hover:border-pine rounded transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-pine-deep group-hover:text-pine">
                  <User size={14} /> Patient account
                </div>
                <div className="text-xs text-ink-soft font-mono mt-1 truncate">
                  patient.demo@careclaim.org
                </div>
                <div className="text-xs text-ink-soft mt-0.5 leading-tight">
                  Bill audit, copay & disputes
                </div>
              </button>
            </div>

            <div className="text-xs text-ink-soft flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-1 border-t border-rule/60">
              <span>Password: <code className="bg-paper px-1.5 py-0.2 rounded font-mono font-bold text-pine-deep">CareClaim2026!</code></span>
              <span className="text-xs text-ink-soft">New DB? Use <strong>Register</strong> to create in 1 sec</span>
            </div>
          </div>

          {authMode === 'forgot_password' ? (
            /* Forgot Password View */
            <div className="space-y-5">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setResetSent(false);
                  setFormError('');
                }}
                className="inline-flex items-center gap-1.5 text-xs font-mono text-ink-soft hover:text-pine transition-colors cursor-pointer"
              >
                <ArrowLeft size={14} /> Back to sign in
              </button>

              <div className="bg-bone border border-rule rounded-lg p-5 space-y-2">
                <div className="flex items-center gap-2 text-pine font-serif text-xl">
                  <KeyRound size={20} /> Reset password
                </div>
                <p className="text-xs text-ink-soft leading-relaxed">
                  Enter your registered account email. We will send you a secure link to reset your password.
                </p>
              </div>

              {resetSent ? (
                <div className="bg-moss/10 border border-moss/30 rounded-lg p-5 text-center space-y-3">
                  <CheckCircle2 size={32} className="text-moss mx-auto" />
                  <div className="font-serif text-lg text-pine-deep">Check your inbox</div>
                  <p className="text-xs text-ink-soft">
                    We sent a recovery link to <span className="font-mono font-bold text-ink">{email}</span>. Click the link in the email to set a new password.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('login');
                      setResetSent(false);
                      setFormError('');
                    }}
                    className="btn btn-primary w-full mt-2"
                  >
                    Return to sign in
                  </button>
                </div>
              ) : (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div>
                    <label htmlFor="reset-email" className="field-label">
                      Account Email
                    </label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3 top-2.5 text-ink-soft pointer-events-none" />
                      <input
                        id="reset-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="yourname@hospital.org"
                        className="w-full bg-bone border border-rule rounded px-3 py-2 pl-9 text-sm"
                        required
                      />
                    </div>
                  </div>

                  {formError && <p role="alert" className="form-error">{formError}</p>}
                  <button
                    type="submit"
                    disabled={loading}
                    className="btn btn-primary w-full py-2.5"
                  >
                    {loading ? 'Sending link...' : 'Send password reset link'}
                  </button>
                </form>
              )}
            </div>
          ) : (
            /* Main Auth View */
            <div className="space-y-6">
              {/* Shown when registering only: an existing account already has its role. */}
              {registering && (
              <div className="space-y-2">
                <div className="block text-xs font-mono uppercase tracking-wider text-ink-soft font-semibold">
                  Registering As
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    aria-pressed={portalRole === 'HOSPITAL'}
                    onClick={() => setPortalRole('HOSPITAL')}
                    className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                      portalRole === 'HOSPITAL'
                        ? 'border-pine bg-pine/5 ring-1 ring-pine'
                        : 'border-rule bg-bone hover:border-ink-soft/40'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Building2 size={16} className={portalRole === 'HOSPITAL' ? 'text-pine' : 'text-ink-soft'} />
                      <span className={`text-xs font-bold uppercase tracking-wider font-mono ${portalRole === 'HOSPITAL' ? 'text-pine-deep' : 'text-ink-soft'}`}>
                        Hospital
                      </span>
                    </div>
                    <p className="text-xs text-ink-soft line-clamp-2">
                      Staff, billing teams & adjudication
                    </p>
                  </button>

                  <button
                    type="button"
                    aria-pressed={portalRole === 'PATIENT'}
                    onClick={() => setPortalRole('PATIENT')}
                    className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                      portalRole === 'PATIENT'
                        ? 'border-pine bg-pine/5 ring-1 ring-pine'
                        : 'border-rule bg-bone hover:border-ink-soft/40'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <User size={16} className={portalRole === 'PATIENT' ? 'text-pine' : 'text-ink-soft'} />
                      <span className={`text-xs font-bold uppercase tracking-wider font-mono ${portalRole === 'PATIENT' ? 'text-pine-deep' : 'text-ink-soft'}`}>
                        Patient
                      </span>
                    </div>
                    <p className="text-xs text-ink-soft line-clamp-2">
                      Review your bills & dispute flags
                    </p>
                  </button>
                </div>
                <p className="text-xs text-ink-soft">You confirm this on the next screen, where the account type becomes permanent.</p>
              </div>
              )}

              {/* High-Contrast Segmented Switcher (Sign In vs Register) */}
              <div className="bg-bone border border-rule p-1 rounded-lg grid grid-cols-2 gap-1">
                <button
                  type="button"
                  aria-pressed={authMode === 'login'}
                  onClick={() => { setAuthMode('login'); setFormError(''); }}
                  className={`tab text-center ${authMode === 'login' ? 'tab-active' : ''}`}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  aria-pressed={authMode === 'register'}
                  onClick={() => { setAuthMode('register'); setFormError(''); }}
                  className={`tab text-center ${authMode === 'register' ? 'tab-active' : ''}`}
                >
                  Register
                </button>
              </div>

              {/* Step-by-Step Instructions Banner */}
              <div className="bg-pine/5 border border-pine/20 rounded-md p-3 text-xs text-pine-deep space-y-1">
                <div className="flex items-center gap-2 font-mono font-bold text-xs uppercase tracking-wider text-pine">
                  <span className="bg-pine text-bone px-1.5 py-0.5 rounded text-xs">Step 1 of 3</span>
                  {authMode === 'login' ? 'Authentication' : 'Account setup'}
                </div>
                <p className="text-xs text-ink-soft leading-relaxed">
                  {authMode === 'login'
                    ? 'Sign in to access your claims queue. For quickest judge testing, use the 1-Click Credentials buttons at the top.'
                    : 'Create your credentials here. On Step 2, you will pick your hospital organization or enter your insurance card details.'}
                </p>
              </div>

              {/* Credentials Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="auth-email" className="field-label">
                    {!registering ? 'Email' : portalRole === 'HOSPITAL' ? 'Hospital / Work Email' : 'Patient / Personal Email'}
                  </label>
                  <input
                    id="auth-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={registering && portalRole === 'PATIENT' ? 'patient@gmail.com' : 'doctor@hospital.org'}
                    className="field"
                    required
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label htmlFor="auth-password" className="field-label mb-0">
                      Password
                    </label>
                    {authMode === 'login' && (
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode('forgot_password');
                          setResetSent(false);
                          setFormError('');
                        }}
                        className="text-xs text-pine hover:underline font-medium cursor-pointer"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <input
                    id="auth-password"
                    type="password"
                    autoComplete={registering ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="field"
                    required
                  />
                </div>

                {authMode === 'register' && portalRole === 'PATIENT' && (
                  <p className="text-xs text-ink-soft bg-bone p-2.5 rounded border border-rule">
                    <Info size={13} className="inline -mt-0.5 mr-1" />Next step: Link your Policy Number (e.g. <code>STAR-402-GOLD</code>) and Patient ID (<code>PAT-1001</code>) to review itemized bills.
                  </p>
                )}

                {authMode === 'register' && portalRole === 'HOSPITAL' && (
                  <p className="text-xs text-ink-soft bg-bone p-2.5 rounded border border-rule">
                    <Info size={13} className="inline -mt-0.5 mr-1" />Next step: Select your hospital network (e.g. Apollo Hospitals) and enter verification code <code>CARECLAIM-HOSPITAL-2026</code>.
                  </p>
                )}

                {formError && <p role="alert" className="form-error">{formError}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-primary w-full py-2.5 mt-2"
                >
                  {loading ? 'Processing...' : registering ? 'Create account and continue' : 'Sign in'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Right Composition: Evaluator & Judge Presentation Showcase */}
      <div className="theme-fixed hidden lg:flex w-5/12 bg-pine-deep items-center justify-center p-8 relative overflow-y-auto">
        {/* Decorative Grid */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiLz48L3N2Zz4=')] opacity-50 pointer-events-none" />

        <div className="w-full max-w-md space-y-6 z-10 text-bone">
          {/* Pitch Banner */}
          <div className="space-y-2">
            <span className="text-[11px] font-mono uppercase tracking-widest text-phosphor bg-pine px-2 py-0.5 rounded">
              Project Architecture & Impact
            </span>
            <h2 className="text-2xl font-serif leading-tight">
              Instant medical adjudication and rate defense
            </h2>
            <p className="text-xs text-bone/70 leading-relaxed">
              Every year, Indian patients lose hours at discharge counters and face inflated medical bills due to unbundled codes and lack of transparent rate benchmarks.
            </p>
          </div>

          {/* Three Feature Highlights */}
          <div className="space-y-2.5 text-xs">
            <div className="bg-pine/40 border border-bone/10 p-3 rounded-lg space-y-1">
              <div className="font-bold text-phosphor flex items-center gap-1.5">
                <Timer size={14} /> 10s autonomous turnaround
              </div>
              <p className="text-xs text-bone/80">
                Replaces 4 to 6 hours of stressful discharge queue waiting with sub-10s Gemini multimodal bill processing and deterministic math checks.
              </p>
            </div>

            <div className="bg-pine/40 border border-bone/10 p-3 rounded-lg space-y-1">
              <div className="font-bold text-phosphor flex items-center gap-1.5">
                <ShieldCheck size={14} /> Overcharge and duplicate guard
              </div>
              <p className="text-xs text-bone/80">
                Audits raw bill entries against standard rate cards; flags duplicate surgical supplies, inflated room rents, and cosmetic procedures.
              </p>
            </div>

            <div className="bg-pine/40 border border-bone/10 p-3 rounded-lg space-y-1">
              <div className="font-bold text-phosphor flex items-center gap-1.5">
                <MessageSquare size={14} /> Patient & hospital dispute desk
              </div>
              <p className="text-xs text-bone/80">
                Patients question suspicious charges with 1 click; hospital billing staff review and resolve queries in a shared team queue.
              </p>
            </div>
          </div>

          {/* Mini Interactive Ticket Mock */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-paper text-ink rounded-lg p-4 shadow-lg border border-rule relative space-y-3"
          >
            <div className="flex justify-between items-center border-b border-rule pb-2">
              <span className="text-[11px] font-mono text-ink-soft uppercase tracking-wider">
                Real-Time Adjudication
              </span>
              <span className="text-[11px] font-mono bg-moss/10 text-moss px-2 py-0.5 rounded font-bold uppercase">
                Audit Verified
              </span>
            </div>

            <div className="text-xs font-mono space-y-1 text-ink-soft">
              <div className="flex justify-between">
                <span>Total billed:</span>
                <span className="font-bold text-ink">₹2,40,000</span>
              </div>
              <div className="flex justify-between text-vermilion">
                <span>Flagged (overpriced + cosmetic):</span>
                <span>- ₹24,000</span>
              </div>
              <div className="flex justify-between text-pine font-bold border-t border-rule pt-1 text-sm">
                <span>Approved payout (90%):</span>
                <span>₹1,94,400</span>
              </div>
            </div>
          </motion.div>

          {/* Evaluator Flow */}
          <div className="p-3 bg-bone/10 rounded-lg text-xs space-y-1 font-mono text-bone/80">
            <div className="text-phosphor font-bold uppercase text-[11px]">Recommended Evaluation Path:</div>
            <div>1. Sign in as hospital → New claim → Run adjudication</div>
            <div>2. Review terminal reasoning & line-item flags</div>
            <div>3. Sign in as patient → Review bill & raise dispute</div>
          </div>
        </div>
      </div>
    </div>
  );
}
