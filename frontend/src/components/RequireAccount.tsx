import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { fetchApi } from '../lib/api';
import { supabase } from '../lib/supabase';
import { AccountContext } from '../lib/account';
import type { Profile } from '../lib/account';

/**
 * Gate for every signed-in page. The backend refuses claim routes until the
 * account has a role, so: no session → /login, no role yet → /setup.
 */
export function RequireAccount({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!data.session) return navigate('/login', { replace: true });

      try {
        const me = await fetchApi('/api/me');
        if (cancelled) return;
        if (!me.profile) return navigate('/setup', { replace: true });
        setProfile(me.profile);
      } catch (err: any) {
        if (cancelled) return;
        // If session is expired or token is invalid, wipe the stale session and redirect to login
        const msg = String(err?.message || '').toLowerCase();
        if (err?.status === 401 || msg.includes('token') || msg.includes('expired') || msg.includes('session')) {
          await supabase.auth.signOut();
          navigate('/login', { replace: true });
          return;
        }
        setError(err.message || 'Failed to authenticate account');
      }
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-paper">
        <div className="w-full max-w-md bg-paper p-8 rounded-lg border border-rule text-center space-y-4 shadow-sm">
          <div className="font-serif text-2xl text-pine-deep">Unable to load your account</div>
          <div className="text-sm text-vermilion font-mono bg-vermilion/5 border border-vermilion/20 p-3 rounded">{error}</div>
          <div className="flex justify-center gap-3 pt-2">
            <button onClick={() => window.location.reload()} className="px-4 py-2 border border-rule text-sm rounded hover:bg-bone transition-colors font-medium">
              Retry
            </button>
            <button onClick={handleSignOut} className="px-4 py-2 bg-pine hover:bg-pine-deep text-bone text-sm rounded transition-colors font-medium">
              Sign In Again
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (!profile) return <div className="p-10 text-center font-mono">Loading...</div>;

  return <AccountContext.Provider value={profile}>{children}</AccountContext.Provider>;
}
