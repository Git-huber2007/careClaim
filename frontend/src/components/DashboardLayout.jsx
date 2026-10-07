import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { IconGrid, IconLogo, IconLogout, IconPlus, IconShield } from './Icons';

const NAV = [
  { to: '/dashboard', label: 'Claims Queue', icon: IconGrid, id: 'nav-dashboard' },
  { to: '/claims/new', label: 'New Claim', icon: IconPlus, id: 'nav-new-claim' },
];

export default function DashboardLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex min-h-full">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/5 bg-ink-900/60 backdrop-blur-xl md:flex">
        <div className="flex items-center gap-3 px-6 py-6">
          <IconLogo />
          <div>
            <p className="text-[15px] font-bold leading-tight text-white">CareClaim <span className="text-gradient">AI</span></p>
            <p className="text-[11px] font-medium uppercase tracking-widest text-ink-400">Adjudication Agent</p>
          </div>
        </div>

        <nav className="mt-2 flex-1 space-y-1 px-3">
          {NAV.map(({ to, label, icon: Icon, id }) => (
            <NavLink
              key={to}
              to={to}
              id={id}
              end
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? 'bg-gradient-to-r from-brand-400/15 to-iris-400/5 text-white ring-1 ring-inset ring-brand-400/20'
                    : 'text-ink-300 hover:bg-white/[0.04] hover:text-white'
                }`
              }
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="m-3 rounded-xl border border-white/5 bg-ink-950/50 p-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-brand-300">
            <IconShield className="h-3.5 w-3.5" /> Secure session
          </div>
          <p className="mt-1.5 truncate text-sm text-ink-200" title={user?.email}>{user?.email}</p>
          <button id="sign-out" onClick={handleSignOut} className="btn-ghost mt-3 w-full py-2 text-xs">
            <IconLogout className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b border-white/5 bg-ink-900/90 px-4 py-3 backdrop-blur md:hidden">
        <div className="flex items-center gap-2">
          <IconLogo className="h-7 w-7" />
          <span className="font-bold text-white">CareClaim AI</span>
        </div>
        <div className="flex gap-1">
          {NAV.map(({ to, icon: Icon, id }) => (
            <NavLink key={to} to={to} id={`${id}-m`} end className={({ isActive }) => `rounded-lg p-2 ${isActive ? 'bg-white/10 text-white' : 'text-ink-300'}`}>
              <Icon />
            </NavLink>
          ))}
          <button onClick={handleSignOut} className="rounded-lg p-2 text-ink-300" aria-label="Sign out"><IconLogout /></button>
        </div>
      </div>

      <main className="min-w-0 flex-1 px-4 pb-12 pt-20 md:px-10 md:pt-10">
        <Outlet />
      </main>
    </div>
  );
}
