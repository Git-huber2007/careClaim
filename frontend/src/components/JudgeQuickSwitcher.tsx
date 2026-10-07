import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Building2, User, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

interface JudgeQuickSwitcherProps {
  currentRole: 'HOSPITAL' | 'PATIENT';
}

export function JudgeQuickSwitcher({ currentRole }: JudgeQuickSwitcherProps) {
  const [switching, setSwitching] = useState(false);
  const [minimized, setMinimized] = useState(false);

  const switchPersona = async (targetRole: 'HOSPITAL' | 'PATIENT') => {
    if (targetRole === currentRole || switching) return;

    setSwitching(true);
    const email = targetRole === 'HOSPITAL' ? 'doctor.demo@careclaim.org' : 'patient.demo@careclaim.org';
    const password = 'CareClaim2026!';

    try {
      let { error } = await supabase.auth.signInWithPassword({ email, password });
      
      // If demo user does not exist in this Supabase project yet, auto-register it
      if (error && error.message.toLowerCase().includes('invalid login')) {
        const signUpRes = await supabase.auth.signUp({ email, password });
        if (signUpRes.error) throw signUpRes.error;
      } else if (error) {
        throw error;
      }

      toast.success(
        targetRole === 'HOSPITAL'
          ? 'Switched to Hospital Desk (Doctor Demo)'
          : 'Switched to Patient Portal (Patient Demo)'
      );

      // Reload to dashboard to let AccountProvider re-fetch clean profile
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 350);
    } catch (err: any) {
      toast.error(err.message || 'Could not switch accounts');
      setSwitching(false);
    }
  };

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="fixed bottom-4 right-4 z-40 bg-pine-deep hover:bg-pine text-phosphor px-3 py-2 rounded-full shadow-2xl border border-bone/20 font-mono text-xs flex items-center gap-1.5 cursor-pointer transition-all"
        title="Open Judge Persona Quick-Switcher"
      >
        <span>⚖️</span>
        <span className="font-bold text-bone">Judge Mode</span>
        <ChevronUp size={14} className="text-bone/70" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 bg-pine-deep/95 backdrop-blur-md text-bone rounded-xl shadow-2xl border border-bone/20 p-2.5 flex items-center gap-3 font-mono text-xs animate-in fade-in slide-in-from-bottom-2 duration-150">
      <div className="flex items-center gap-1.5 pr-1 border-r border-bone/20">
        <span className="text-base">⚖️</span>
        <div className="leading-tight">
          <div className="text-[10px] text-phosphor font-bold uppercase tracking-wider">Judge Switcher</div>
          <div className="text-[9px] text-bone/60">Live Evaluation Mode</div>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={switching || currentRole === 'HOSPITAL'}
          onClick={() => switchPersona('HOSPITAL')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer font-medium ${
            currentRole === 'HOSPITAL'
              ? 'bg-phosphor text-pine-deep font-bold shadow-xs cursor-default'
              : 'text-bone/80 hover:text-bone hover:bg-white/10'
          }`}
          title="Switch to Hospital Desk"
        >
          <Building2 size={13} />
          <span>Hospital Desk</span>
        </button>

        <button
          type="button"
          disabled={switching || currentRole === 'PATIENT'}
          onClick={() => switchPersona('PATIENT')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer font-medium ${
            currentRole === 'PATIENT'
              ? 'bg-phosphor text-pine-deep font-bold shadow-xs cursor-default'
              : 'text-bone/80 hover:text-bone hover:bg-white/10'
          }`}
          title="Switch to Patient Portal"
        >
          <User size={13} />
          <span>Patient Portal</span>
        </button>
      </div>

      {switching && (
        <RefreshCw size={14} className="animate-spin text-phosphor shrink-0" />
      )}

      <button
        type="button"
        onClick={() => setMinimized(true)}
        className="text-bone/50 hover:text-bone p-1 rounded hover:bg-white/10 transition-colors cursor-pointer shrink-0"
        title="Minimize Judge Switcher"
      >
        <ChevronDown size={14} />
      </button>
    </div>
  );
}
