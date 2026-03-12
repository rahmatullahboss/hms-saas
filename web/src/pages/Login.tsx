import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { api } from '../lib/apiClient';
import { saveToken } from '../hooks/useAuth';
import toast from 'react-hot-toast';
import { Lock, Mail, Building2, ArrowRight, ShieldCheck } from 'lucide-react';

export default function Login() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!slug) {
      toast.error('Invalid hospital URL. Please use /h/your-hospital/login');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post<{
        token: string;
        user: { id: string; name: string; email: string; role: string };
      }>(
        '/api/auth/login',
        { email, password },
        { 'X-Tenant-Subdomain': slug }
      );

      saveToken(res.token);
      toast.success('Login successful!');

      // Route to the correct dashboard based on role
      const role = res.user.role;
      const roleRoutes: Record<string, string> = {
        hospital_admin: 'dashboard',
        laboratory: 'lab/dashboard',
        reception: 'reception/dashboard',
        md: 'md/dashboard',
        director: 'director/dashboard',
        pharmacist: 'pharmacy/dashboard',
      };
      const dest = roleRoutes[role] ?? 'dashboard';
      navigate(`/h/${slug}/${dest}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-cyan-50 via-slate-50 to-teal-50 dark:from-slate-900 dark:via-slate-800 dark:to-cyan-950 px-4">
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-cyan-200/30 dark:bg-cyan-800/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-teal-200/30 dark:bg-teal-800/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-100/20 dark:bg-cyan-900/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo & branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-600 shadow-lg shadow-cyan-500/25 mb-4">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
            Welcome Back
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Sign in to access your hospital dashboard
          </p>
        </div>

        {/* Card */}
        <div className="card p-8">
          {/* Hospital badge */}
          {slug && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-cyan-50 dark:bg-cyan-900/30 border border-cyan-200/60 dark:border-cyan-700/40 mb-6">
              <ShieldCheck className="w-4 h-4 text-cyan-600 dark:text-cyan-400 flex-shrink-0" />
              <span className="text-sm font-medium text-cyan-700 dark:text-cyan-300 truncate">
                {slug}
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label htmlFor="email" className="label">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="email"
                  type="email"
                  placeholder="you@hospital.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="input pl-10"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="label mb-0">
                  Password
                </label>
                <a
                  href="#"
                  className="text-xs font-medium text-cyan-600 hover:text-cyan-700 dark:text-cyan-400 dark:hover:text-cyan-300 transition-colors"
                >
                  Forgot password?
                </a>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="input pl-10"
                />
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="btn-primary w-full py-3 text-base font-semibold shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 transition-shadow group"
              disabled={loading}
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in…
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200 dark:border-slate-700" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white dark:bg-slate-800 px-3 text-slate-400">
                or
              </span>
            </div>
          </div>

          {/* Google sign-in */}
          <button
            type="button"
            onClick={() => {
              if(slug) window.location.href = `/api/auth/google?subdomain=${slug}`;
            }}
            className="btn-secondary w-full py-2.5 text-sm"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </button>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-6">
          Don&apos;t have an account?{' '}
          <a
            href="/signup"
            className="font-semibold text-cyan-600 hover:text-cyan-700 dark:text-cyan-400 dark:hover:text-cyan-300 transition-colors"
          >
            Register your hospital
          </a>
        </p>
      </div>
    </div>
  );
}
