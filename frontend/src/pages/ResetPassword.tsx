import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { PageTitle } from '../components/PageTitle';
import { ThemeToggle } from '../components/ThemeToggle';

const MIN_PASSWORD = 6; // Supabase's default minimum

/**
 * Where the emailed recovery link lands. The link signs the browser in
 * (supabase-js reads it from the URL as it loads), and that session is what
 * allows the password to be replaced.
 */
export function ResetPassword() {
  const navigate = useNavigate();
  const [linkState, setLinkState] = useState<'checking' | 'valid' | 'invalid'>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setLinkState(data.session ? 'valid' : 'invalid');
    });
    return () => { active = false; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) return setFormError(`Use at least ${MIN_PASSWORD} characters.`);
    if (password !== confirm) return setFormError('The two passwords do not match.');
    setFormError('');
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success('Password updated');
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      setFormError(err.message || 'Could not update the password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-paper relative">
      <PageTitle>Set a new password</PageTitle>
      <div className="absolute top-4 right-4 sm:top-6 sm:right-8 z-20">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md bg-paper p-8 rounded-lg border border-rule space-y-6">
        <h1 className="text-3xl font-serif text-pine-deep">Set a new password</h1>

        {linkState === 'checking' && <div className="font-mono text-sm">Checking your reset link...</div>}

        {linkState === 'invalid' && (
          <div className="space-y-4">
            <div className="text-sm text-vermilion font-mono bg-vermilion/5 border border-vermilion/20 p-3 rounded">
              This reset link is invalid or has expired.
            </div>
            <Link to="/login" className="inline-block text-sm text-pine font-medium hover:underline">
              Back to sign in, to request a new link
            </Link>
          </div>
        )}

        {linkState === 'valid' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="new-password" className="field-label">New Password</label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="field"
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="field-label">Repeat New Password</label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="field"
              />
            </div>
            {formError && <p role="alert" className="form-error">{formError}</p>}
            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary w-full py-2.5"
            >
              {saving ? 'Saving...' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
