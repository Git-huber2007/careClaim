import { useState } from 'react';
import { useNavigate } from 'react-router';
import { supabase } from '../lib/supabase';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { Building2, User, ArrowLeft, Mail, KeyRound, CheckCircle2 } from 'lucide-react';

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
  const registering = authMode === 'register';

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error('Please enter your registered email address.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setResetSent(true);
      toast.success('Password reset link sent to your email.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to send password reset email.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (authMode === 'login') {
        const { error, data } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        if (!data.session) {
          toast.error('Unable to establish session. Please verify your email.');
          return;
        }
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
          toast.error('An account with this email already exists. Sign in, or reset your password.');
          setAuthMode('login');
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
      toast.error(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 md:p-10 bg-paper">
        <div className="w-full max-w-md space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-4xl font-serif text-pine-deep flex items-center gap-2">
              CareClaim{' '}
              <span className="text-phosphor bg-pine px-2 py-0.5 rounded text-2xl font-mono align-middle inline-block transform -translate-y-0.5">
                AI
              </span>
            </h1>
            <p className="text-ink-soft mt-1.5 text-sm">
              Autonomous hospital discharge claims adjudication & audit.
            </p>
          </div>

          {authMode === 'forgot_password' ? (
            /* Forgot Password View */
            <div className="space-y-5">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setResetSent(false);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-mono text-ink-soft hover:text-pine transition-colors cursor-pointer"
              >
                <ArrowLeft size={14} /> Back to Sign In
              </button>

              <div className="bg-bone border border-rule rounded-lg p-5 space-y-2">
                <div className="flex items-center gap-2 text-pine font-serif text-xl">
                  <KeyRound size={20} /> Reset Password
                </div>
                <p className="text-xs text-ink-soft leading-relaxed">
                  Enter your registered account email. We will send you a secure link to reset your password.
                </p>
              </div>

              {resetSent ? (
                <div className="bg-moss/10 border border-moss/30 rounded-lg p-5 text-center space-y-3">
                  <CheckCircle2 size={32} className="text-moss mx-auto" />
                  <div className="font-serif text-lg text-pine-deep">Check Your Inbox</div>
                  <p className="text-xs text-ink-soft">
                    We sent a recovery link to <span className="font-mono font-bold text-ink">{email}</span>. Click the link in the email to set a new password.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('login');
                      setResetSent(false);
                    }}
                    className="w-full mt-2 bg-pine hover:bg-pine-deep text-bone py-2 rounded text-xs font-mono uppercase tracking-wider font-semibold transition-colors"
                  >
                    Return to Sign In
                  </button>
                </div>
              ) : (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div>
                    <label htmlFor="reset-email" className="block text-xs font-mono uppercase tracking-wider text-ink-soft mb-1.5">
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
                        className="w-full bg-bone border border-rule rounded px-3 py-2 pl-9 text-sm focus:outline-none focus:border-pine focus:ring-1 focus:ring-pine transition-all"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-pine hover:bg-pine-deep text-bone rounded py-2.5 text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
                  >
                    {loading ? 'Sending link...' : 'Send Password Reset Link'}
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
                <div className="block text-[11px] font-mono uppercase tracking-wider text-ink-soft font-semibold">
                  Registering As
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    aria-pressed={portalRole === 'HOSPITAL'}
                    onClick={() => setPortalRole('HOSPITAL')}
                    className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                      portalRole === 'HOSPITAL'
                        ? 'border-pine bg-pine/5 shadow-sm ring-1 ring-pine'
                        : 'border-rule bg-bone hover:border-ink-soft/40'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Building2 size={16} className={portalRole === 'HOSPITAL' ? 'text-pine' : 'text-ink-soft'} />
                      <span className={`text-xs font-bold uppercase tracking-wider font-mono ${portalRole === 'HOSPITAL' ? 'text-pine-deep' : 'text-ink-soft'}`}>
                        Hospital
                      </span>
                    </div>
                    <p className="text-[11px] text-ink-soft line-clamp-2">
                      Staff, billing teams & adjudication
                    </p>
                  </button>

                  <button
                    type="button"
                    aria-pressed={portalRole === 'PATIENT'}
                    onClick={() => setPortalRole('PATIENT')}
                    className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                      portalRole === 'PATIENT'
                        ? 'border-pine bg-pine/5 shadow-sm ring-1 ring-pine'
                        : 'border-rule bg-bone hover:border-ink-soft/40'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <User size={16} className={portalRole === 'PATIENT' ? 'text-pine' : 'text-ink-soft'} />
                      <span className={`text-xs font-bold uppercase tracking-wider font-mono ${portalRole === 'PATIENT' ? 'text-pine-deep' : 'text-ink-soft'}`}>
                        Patient
                      </span>
                    </div>
                    <p className="text-[11px] text-ink-soft line-clamp-2">
                      Review your bills & dispute flags
                    </p>
                  </button>
                </div>
                <p className="text-[11px] text-ink-soft">You confirm this on the next screen, where the account type becomes permanent.</p>
              </div>
              )}

              {/* High-Contrast Segmented Switcher (Sign In vs Register) */}
              <div className="bg-bone border border-rule p-1 rounded-lg grid grid-cols-2 text-xs font-mono uppercase tracking-wider font-semibold">
                <button
                  type="button"
                  onClick={() => setAuthMode('login')}
                  className={`py-2 rounded-md transition-all cursor-pointer text-center ${
                    authMode === 'login'
                      ? 'bg-paper text-pine-deep shadow-sm border border-rule/50'
                      : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode('register')}
                  className={`py-2 rounded-md transition-all cursor-pointer text-center ${
                    authMode === 'register'
                      ? 'bg-paper text-pine-deep shadow-sm border border-rule/50'
                      : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  Register
                </button>
              </div>

              {/* Credentials Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="auth-email" className="block text-xs font-mono uppercase tracking-wider text-ink-soft mb-1">
                    {!registering ? 'Email' : portalRole === 'HOSPITAL' ? 'Hospital / Work Email' : 'Patient / Personal Email'}
                  </label>
                  <input
                    id="auth-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={registering && portalRole === 'PATIENT' ? 'patient@gmail.com' : 'doctor@hospital.org'}
                    className="w-full bg-bone border border-rule rounded px-3 py-2 text-sm focus:outline-none focus:border-pine focus:ring-1 focus:ring-pine transition-all"
                    required
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label htmlFor="auth-password" className="text-xs font-mono uppercase tracking-wider text-ink-soft">
                      Password
                    </label>
                    {authMode === 'login' && (
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode('forgot_password');
                          setResetSent(false);
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
                    className="w-full bg-bone border border-rule rounded px-3 py-2 text-sm focus:outline-none focus:border-pine focus:ring-1 focus:ring-pine transition-all"
                    required
                  />
                </div>

                {authMode === 'register' && portalRole === 'PATIENT' && (
                  <p className="text-[11px] text-ink-soft bg-bone p-2.5 rounded border border-rule">
                    ℹ After registration you will link your Policy Number (e.g. STAR-402-GOLD) and Patient ID to view your discharge claims.
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-pine hover:bg-pine-deep text-bone rounded py-2.5 text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer shadow-sm mt-2"
                >
                  {loading ? 'Processing...' : registering ? 'Create Account' : 'Sign In'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Right Composition */}
      <div className="hidden lg:flex w-1/2 bg-pine-deep items-center justify-center p-8 relative overflow-hidden">
        {/* Decorative Grid */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiLz48L3N2Zz4=')] opacity-50" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-paper w-84 shadow-2xl rounded-sm p-6 relative border-t-4 border-pine z-10"
        >
          <div className="flex justify-between items-center mb-4 border-b border-rule pb-2">
            <span className="text-[10px] font-mono text-ink-soft uppercase tracking-widest">
              Claim Ticket #8091
            </span>
            <span className="text-[10px] font-mono bg-bone px-1.5 py-0.5 rounded text-pine font-bold uppercase">
              {registering && portalRole === 'PATIENT' ? 'Patient View' : 'Hospital View'}
            </span>
          </div>

          <div className="space-y-3 mb-8">
            <div className="h-2 bg-rule/50 rounded w-full" />
            <div className="h-2 bg-rule/50 rounded w-5/6" />
            <div className="h-2 bg-rule/50 rounded w-4/6" />
          </div>

          {/* Stamping animation */}
          <motion.div
            initial={{ scale: 2, opacity: 0, rotate: -20 }}
            animate={{ scale: 1, opacity: 1, rotate: -5 }}
            transition={{ delay: 0.5, type: 'spring', stiffness: 200 }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border-4 border-moss text-moss px-4 py-1 text-2xl font-mono font-bold uppercase tracking-widest z-20 whitespace-nowrap bg-paper/90 backdrop-blur-xs shadow-sm"
          >
            Approved
          </motion.div>

          <div className="mt-8 pt-4 border-t border-rule font-mono text-xs flex justify-between">
            <span className="text-ink-soft">Payout</span>
            <span className="font-bold text-pine-deep">₹2,16,000</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
