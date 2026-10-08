import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { Menu, Moon, Sun, X } from 'lucide-react';
import { useAccount } from '../lib/account';
import { supabase } from '../lib/supabase';
import { setTheme, useTheme } from '../lib/theme';

const NAV = {
  HOSPITAL: [
    { to: '/dashboard', label: 'Claims' },
    { to: '/claims/new', label: 'New claim' },
    { to: '/disputes', label: 'Disputes' },
    { to: '/analytics', label: 'Analytics' }
  ],
  PATIENT: [
    { to: '/dashboard', label: 'My bills' },
    { to: '/claims/new', label: 'Check a bill' },
    { to: '/disputes', label: 'My disputes' },
    { to: '/analytics', label: 'Analytics' }
  ]
};

/** The bar every signed-in page sits under, so each page has a way to the others. */
export function AppShell() {
  const profile = useAccount();
  const navigate = useNavigate();
  const theme = useTheme();
  // On a phone the links and the account line sit behind a menu button.
  const [menuOpen, setMenuOpen] = useState(false);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  return (
    <>
      <header className="bg-paper border-b border-rule">
        <div className="max-w-[1600px] mx-auto px-6 md:px-10 py-3 flex flex-wrap items-center gap-x-8 gap-y-3">
          <NavLink to="/dashboard" className="font-serif text-xl text-pine-deep">
            CareClaim <span className="theme-fixed text-bone bg-pine px-1.5 py-0.5 rounded text-sm font-mono align-middle font-bold">AI</span>
          </NavLink>

          <button
            type="button"
            onClick={() => setMenuOpen(open => !open)}
            aria-expanded={menuOpen}
            aria-controls="main-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            className="md:hidden ml-auto p-1.5 rounded text-ink-soft hover:bg-rule/40 hover:text-ink cursor-pointer"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <div
            id="main-menu"
            className={`${menuOpen ? 'flex' : 'hidden'} md:flex basis-full md:basis-auto md:flex-1 flex-col md:flex-row md:items-center gap-x-8 gap-y-3`}
          >
            <nav aria-label="Main" className="flex flex-col md:flex-row md:items-center gap-1">
              {NAV[profile.role].map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) => `tab ${isActive ? 'tab-active' : ''}`}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <div className="md:ml-auto flex items-center justify-between gap-4 border-t border-rule pt-3 md:border-0 md:pt-0">
              <span className="text-xs font-mono uppercase tracking-wider text-ink-soft">
                {profile.role === 'PATIENT' ? `Patient · ${profile.patient_id}` : (profile.hospital_org ? `Hospital · ${profile.hospital_org}` : 'Hospital staff')}
              </span>
              <span className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  aria-label={theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'}
                  className="p-1.5 rounded text-ink-soft hover:bg-rule/40 hover:text-ink cursor-pointer"
                >
                  {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                </button>
                <button onClick={signOut} className="text-sm text-ink-soft hover:underline cursor-pointer">Sign out</button>
              </span>
            </div>
          </div>
        </div>
      </header>
      <Outlet />
    </>
  );
}
