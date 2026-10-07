import { NavLink, Outlet, useNavigate } from 'react-router';
import { useAccount } from '../lib/account';
import { supabase } from '../lib/supabase';

const NAV = {
  HOSPITAL: [
    { to: '/dashboard', label: 'Claims' },
    { to: '/claims/new', label: 'New Claim' },
    { to: '/disputes', label: 'Disputes' },
    { to: '/analytics', label: 'Analytics' }
  ],
  PATIENT: [
    { to: '/dashboard', label: 'My Bills' },
    { to: '/claims/new', label: 'Check a Bill' },
    { to: '/disputes', label: 'My Disputes' },
    { to: '/analytics', label: 'Analytics' }
  ]
};

/** The bar every signed-in page sits under, so each page has a way to the others. */
export function AppShell() {
  const profile = useAccount();
  const navigate = useNavigate();

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  return (
    <>
      <header className="bg-paper border-b border-rule">
        <div className="max-w-[1600px] mx-auto px-6 md:px-10 py-3 flex flex-wrap items-center gap-x-8 gap-y-2">
          <NavLink to="/dashboard" className="font-serif text-xl text-pine-deep">
            CareClaim <span className="text-phosphor bg-pine px-1.5 py-0.5 rounded text-sm font-mono align-middle">AI</span>
          </NavLink>

          <nav aria-label="Main" className="flex items-center gap-1">
            {NAV[profile.role].map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end
                className={({ isActive }) =>
                  `rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive ? 'bg-pine text-bone' : 'text-ink-soft hover:bg-rule/40 hover:text-ink'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-4">
            <span className="text-xs font-mono uppercase tracking-wider text-ink-soft">
              {profile.role === 'PATIENT' ? `Patient · ${profile.patient_id}` : (profile.hospital_org ? `Hospital · ${profile.hospital_org}` : 'Hospital staff')}
            </span>
            <button onClick={signOut} className="text-sm text-ink-soft hover:underline">Sign out</button>
          </div>
        </div>
      </header>
      <Outlet />
    </>
  );
}
