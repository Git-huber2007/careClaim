import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router';
import { RequireAccount } from './components/RequireAccount';
import { AppShell } from './components/AppShell';
import { Loading } from './components/Loading';
import { supabase } from './lib/supabase';

// Each page is its own chunk, so the first screen does not download the others.
const Login = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const ResetPassword = lazy(() => import('./pages/ResetPassword').then(m => ({ default: m.ResetPassword })));
const AccountSetup = lazy(() => import('./pages/AccountSetup').then(m => ({ default: m.AccountSetup })));
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const NewClaim = lazy(() => import('./pages/NewClaim').then(m => ({ default: m.NewClaim })));
const ClaimView = lazy(() => import('./pages/ClaimView').then(m => ({ default: m.ClaimView })));
const Disputes = lazy(() => import('./pages/Disputes').then(m => ({ default: m.Disputes })));
const Analytics = lazy(() => import('./pages/Analytics').then(m => ({ default: m.Analytics })));
const Verify = lazy(() => import('./pages/Verify').then(m => ({ default: m.Verify })));

// Read as the module loads, before supabase-js consumes the link and clears it from the URL.
const openedByRecoveryLink = /type=recovery/.test(window.location.hash + window.location.search);

export default function App() {
  const navigate = useNavigate();

  // A password-reset link signs the browser in wherever it lands. Supabase only
  // sends it to /reset-password if that URL is on the project's redirect
  // allow-list, and otherwise to the site's home page, so follow the event.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(event => {
      // The event is also relayed to the app's other open tabs; only the tab
      // the link opened in should leave what it was doing.
      if (event === 'PASSWORD_RECOVERY' && openedByRecoveryLink) navigate('/reset-password', { replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/setup" element={<AccountSetup />} />
        {/* Public: what the QR code on a printed discharge slip opens. */}
        <Route path="/verify/:id" element={<Verify />} />
        <Route element={<RequireAccount><AppShell /></RequireAccount>}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/claims/new" element={<NewClaim />} />
          <Route path="/claims/:id" element={<ClaimView />} />
          <Route path="/disputes" element={<Disputes />} />
          <Route path="/analytics" element={<Analytics />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}
