import { Navigate } from 'react-router-dom';
import AuthForm from '../components/AuthForm';
import { IconBolt, IconLogo, IconShield, IconTerminal } from '../components/Icons';
import { useAuth } from '../context/AuthContext';

const FEATURES = [
  { icon: IconBolt, title: '< 15s adjudication', text: 'Replace the 6–8 hour discharge wait with autonomous approval.' },
  { icon: IconTerminal, title: 'Transparent reasoning', text: 'Every decision streamed step-by-step to the Agent Terminal.' },
  { icon: IconShield, title: 'Fraud & overcharge checks', text: 'Exclusions, mismatched patients and anomalies flagged instantly.' },
];

export default function LoginPage() {
  const { session, loading } = useAuth();
  if (!loading && session) return <Navigate to="/dashboard" replace />;

  return (
    <div className="relative grid min-h-full overflow-hidden lg:grid-cols-2">
      {/* Ambient blobs */}
      <div className="pointer-events-none absolute -left-32 top-20 h-96 w-96 rounded-full bg-brand-400/10 blur-3xl animate-float" />
      <div className="pointer-events-none absolute bottom-0 right-1/3 h-80 w-80 rounded-full bg-iris-500/10 blur-3xl animate-float" style={{ animationDelay: '-4s' }} />

      <section className="relative hidden flex-col justify-between p-12 lg:flex">
        <div className="flex items-center gap-3">
          <IconLogo className="h-10 w-10" />
          <span className="text-lg font-bold text-white">CareClaim <span className="text-gradient">AI</span></span>
        </div>

        <div className="max-w-lg animate-fade-up">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-400/20 bg-brand-400/5 px-3 py-1 text-xs font-semibold text-brand-300">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-300 animate-pulse" /> Agentic AI · InsurTech
          </p>
          <h1 className="text-5xl font-extrabold leading-[1.05] tracking-tight text-white">
            Discharge claims, <br />
            <span className="text-gradient">adjudicated in seconds.</span>
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-ink-300">
            An autonomous Gemini agent that reads the itemized bill, cross-references the patient’s policy, and issues an
            auditable payout decision before the patient leaves the ward.
          </p>

          <div className="mt-10 space-y-4">
            {FEATURES.map(({ icon: Icon, title, text }, i) => (
              <div key={title} className="flex gap-4 animate-fade-up" style={{ animationDelay: `${150 + i * 100}ms` }}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.04] text-brand-300 ring-1 ring-white/10">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-semibold text-white">{title}</p>
                  <p className="text-sm text-ink-400">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-ink-400">© {new Date().getFullYear()} CareClaim AI · Prototype for hospital billing teams</p>
      </section>

      <section className="relative flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <IconLogo />
            <h1 className="text-xl font-bold text-white">CareClaim <span className="text-gradient">AI</span></h1>
          </div>
          <AuthForm />
        </div>
      </section>
    </div>
  );
}
