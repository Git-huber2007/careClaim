import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, supabaseConfigured } from '../lib/supabase';
import { IconAlert, Spinner } from './Icons';

export default function AuthForm() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!supabase) return setError('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
    if (password.length < 6) return setError('Password must be at least 6 characters.');

    setLoading(true);
    try {
      if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        navigate('/dashboard', { replace: true });
      } else {
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (err) throw err;
        if (data.session) navigate('/dashboard', { replace: true });
        else {
          setNotice('Account created. Check your inbox to confirm your email, then sign in.');
          setMode('signin');
        }
      }
    } catch (err) {
      setError(err.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="glass w-full max-w-md p-8 animate-fade-up">
      <div className="mb-6 flex rounded-xl bg-ink-950/60 p-1 ring-1 ring-white/5">
        {['signin', 'signup'].map((m) => (
          <button
            key={m}
            id={`auth-tab-${m}`}
            type="button"
            onClick={() => { setMode(m); setError(''); }}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition cursor-pointer ${
              mode === m ? 'bg-ink-700 text-white shadow' : 'text-ink-400 hover:text-ink-200'
            }`}
          >
            {m === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        ))}
      </div>

      <h2 className="text-xl font-bold text-white">
        {mode === 'signin' ? 'Sign in to CareClaim' : 'Create your account'}
      </h2>
      <p className="mt-1 text-sm text-ink-400">For hospital billing staff and patients · Secured by Supabase Auth</p>

      {!supabaseConfigured && (
        <div className="mt-5 flex gap-2.5 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-200">
          <IconAlert className="h-4 w-4 shrink-0" />
          <span>Supabase env vars missing. Fill in <code className="font-mono">frontend/.env</code> and restart Vite.</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
        <div>
          <label htmlFor="auth-email" className="label">Email</label>
          <input
            id="auth-email"
            type="email"
            required
            autoComplete="email"
            className="input"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="auth-password" className="label">Password</label>
          <input
            id="auth-password"
            type="password"
            required
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            className="input"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300 ring-1 ring-rose-500/20">{error}</p>}
        {notice && <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300 ring-1 ring-emerald-500/20">{notice}</p>}

        <button id="auth-submit" type="submit" className="btn-primary w-full py-3" disabled={loading}>
          {loading && <Spinner />}
          {mode === 'signin' ? 'Sign in securely' : 'Create account'}
        </button>
      </form>
    </div>
  );
}
