import { Routes, Route, Navigate } from 'react-router';
import { RequireAccount } from './components/RequireAccount';
import { Login } from './pages/Login';
import { AccountSetup } from './pages/AccountSetup';
import { Dashboard } from './pages/Dashboard';
import { NewClaim } from './pages/NewClaim';
import { ClaimView } from './pages/ClaimView';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/setup" element={<AccountSetup />} />
      <Route path="/dashboard" element={<RequireAccount><Dashboard /></RequireAccount>} />
      <Route path="/claims/new" element={<RequireAccount><NewClaim /></RequireAccount>} />
      <Route path="/claims/:id" element={<RequireAccount><ClaimView /></RequireAccount>} />
    </Routes>
  );
}
