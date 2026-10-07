import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';

const AuthContext = createContext({
  session: null,
  user: null,
  loading: true,
  profile: null,
  profileLoading: false,
  profileError: '',
  refreshProfile: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  // The profile (role) loaded for `userId`; stale as soon as the signed-in user changes.
  const [account, setAccount] = useState({ userId: null, profile: null, error: '' });

  useEffect(() => {
    if (!supabase) return;
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .catch(() => {})
      .finally(() => setLoading(false));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id ?? null;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const loadProfile = useCallback(async (uid) => {
    let next;
    try {
      const { profile } = await api.getMe();
      next = { userId: uid, profile, error: '' };
    } catch (e) {
      next = { userId: uid, profile: null, error: e.message };
    }
    if (userIdRef.current === uid) setAccount(next); // ignore a reply for a user who has since signed out
  }, []);

  useEffect(() => {
    if (userId) loadProfile(userId);
  }, [userId, loadProfile]);

  const profileReady = Boolean(userId) && account.userId === userId;

  const value = {
    session,
    user: session?.user ?? null,
    loading,
    profile: profileReady ? account.profile : null,
    profileLoading: Boolean(userId) && !profileReady,
    profileError: profileReady ? account.error : '',
    refreshProfile: () => (userId ? loadProfile(userId) : Promise.resolve()),
    signOut: async () => supabase?.auth.signOut(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
