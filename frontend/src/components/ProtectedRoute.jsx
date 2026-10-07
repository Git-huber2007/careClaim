import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { IconAlert, Spinner } from './Icons';

export default function ProtectedRoute({ children }) {
  const { session, loading, profile, profileLoading, profileError, refreshProfile, signOut } = useAuth();
  const location = useLocation();

  if (loading || profileLoading) {
    return (
      <div className="grid h-screen place-items-center text-ink-400">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;
  if (profileError) {
    return (
      <div className="mx-auto grid h-screen max-w-md place-items-center px-6 text-center">
        <div>
          <IconAlert className="mx-auto h-10 w-10 text-rose-300" />
          <p className="mt-3 text-lg font-semibold text-white">Unable to load your account</p>
          <p className="mt-1 text-sm text-ink-400">{profileError}</p>
          <div className="mt-6 flex justify-center gap-2">
            <button onClick={signOut} className="btn-ghost">Sign out</button>
            <button onClick={refreshProfile} className="btn-primary">Retry</button>
          </div>
        </div>
      </div>
    );
  }
  // Signed in, but the account has not chosen hospital or patient yet.
  if (!profile) return <Navigate to="/onboarding" replace />;
  return children;
}
