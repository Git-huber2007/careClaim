import { useState } from 'react';
import { useNavigate } from 'react-router';
import { supabase } from '../lib/supabase';
import { motion } from 'motion/react';
import { toast } from 'sonner';

export function Login() {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        toast.success('Registration successful. Please log in.');
        setIsLogin(true);
        return;
      }
      navigate('/dashboard');
    } catch (err: any) {
      toast.error(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-paper">
        <div className="w-full max-w-sm space-y-8">
          <div>
            <h1 className="text-4xl font-serif text-pine-deep">CareClaim <span className="text-phosphor bg-pine px-2 py-0.5 rounded text-2xl align-middle inline-block transform -translate-y-1">AI</span></h1>
            <p className="text-ink-soft mt-2 text-sm">Autonomous hospital claim adjudication.</p>
          </div>

          <div className="flex gap-4 border-b border-rule pb-2">
            <button 
              className={`text-sm font-bold tracking-wide uppercase ${isLogin ? 'text-pine' : 'text-ink-soft'}`}
              onClick={() => setIsLogin(true)}
            >
              Sign In
            </button>
            <button 
              className={`text-sm font-bold tracking-wide uppercase ${!isLogin ? 'text-pine' : 'text-ink-soft'}`}
              onClick={() => setIsLogin(false)}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-ink-soft mb-1">Work Email</label>
              <input 
                type="email" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="doctor@hospital.org"
                className="w-full bg-bone border border-rule rounded px-3 py-2 text-sm focus:outline-none focus:border-pine focus:ring-1 focus:ring-pine transition-all"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-ink-soft mb-1">Password</label>
              <input 
                type="password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-bone border border-rule rounded px-3 py-2 text-sm focus:outline-none focus:border-pine focus:ring-1 focus:ring-pine transition-all"
                required
              />
            </div>
            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-pine hover:bg-pine-deep text-bone rounded px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {loading ? 'Processing...' : isLogin ? 'Access Terminal' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>

      {/* Right Composition */}
      <div className="hidden lg:flex w-1/2 bg-pine-deep items-center justify-center p-8 relative overflow-hidden">
        {/* Decorative Grid */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiLz48L3N2Zz4=')] opacity-50" />
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-paper w-80 shadow-2xl rounded-sm p-6 relative border-t-4 border-pine z-10"
        >
          <div className="text-[10px] font-mono text-ink-soft uppercase tracking-widest mb-4 border-b border-rule pb-2">
            Claim Ticket #8091
          </div>
          <div className="space-y-3 mb-8">
            <div className="h-2 bg-rule/50 rounded w-full" />
            <div className="h-2 bg-rule/50 rounded w-5/6" />
            <div className="h-2 bg-rule/50 rounded w-4/6" />
          </div>

          {/* Stamping animation */}
          <motion.div 
            initial={{ scale: 2, opacity: 0, rotate: -20 }}
            animate={{ scale: 1, opacity: 1, rotate: -5 }}
            transition={{ delay: 0.5, type: 'spring', stiffness: 200 }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border-4 border-moss text-moss px-4 py-1 text-2xl font-mono font-bold uppercase tracking-widest z-20"
          >
            Approved
          </motion.div>

          <div className="mt-8 pt-4 border-t border-rule font-mono text-xs flex justify-between">
            <span className="text-ink-soft">Payout</span>
            <span className="font-bold text-pine-deep">₹2,16,000</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
