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
        if (!cancelled) setError(err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  if (error) {
    return (
      <div className="p-10 text-center space-y-3">
        <div className="font-serif text-2xl text-pine-deep">Unable to load your account</div>
        <div className="text-sm text-vermilion font-mono">{error}</div>
        <button onClick={() => window.location.reload()} className="text-sm text-pine font-medium hover:underline">Retry</button>
      </div>
    );
  }
  if (!profile) return <div className="p-10 text-center font-mono">Loading...</div>;

  return <AccountContext.Provider value={profile}>{children}</AccountContext.Provider>;
}
