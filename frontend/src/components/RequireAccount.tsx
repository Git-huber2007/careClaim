import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { fetchApi } from '../lib/api';
import { supabase } from '../lib/supabase';
import { AccountContext } from '../lib/account';
import type { Profile } from '../lib/account';
import { Loading } from './Loading';
import { ErrorState } from './ErrorState';

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
        setError(err.message || 'Failed to authenticate account with CareClaim backend.');
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
        <ErrorState title="Unable to load your account" message={error}>
          <button onClick={() => window.location.reload()} className="btn btn-secondary">
            Retry
          </button>
          <button onClick={handleSignOut} className="btn btn-primary">
            Sign in again
          </button>
        </ErrorState>
      </div>
    );
  }
  if (!profile) return <Loading />;

  return <AccountContext.Provider value={profile}>{children}</AccountContext.Provider>;
}
