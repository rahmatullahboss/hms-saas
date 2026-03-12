import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { api } from '../lib/apiClient';
import { saveToken } from '../hooks/useAuth';
import toast from 'react-hot-toast';
import {
  Lock,
  Mail,
  ShieldCheck,
  Heart,
  Activity,
  Stethoscope,
  Building2,
} from 'lucide-react';

export default function Login() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

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
    <div className="min-h-screen flex">
      {/* ── Left Panel: Form ── */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center px-6 sm:px-12 lg:px-16 xl:px-24 bg-white dark:bg-slate-900">
        {/* Logo */}
        <div className="mb-10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center shadow-md shadow-cyan-500/20">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold text-slate-800 dark:text-white tracking-tight">
              HMS SaaS
            </span>
          </div>
        </div>

        {/* Heading */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white leading-tight">
            Sign in to your hospital account
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Access your dashboard, manage patients, and more.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5 max-w-sm">
          {/* Email */}
          <div>
            <label htmlFor="email" className="label">
              Email or Username
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                id="email"
                type="email"
                placeholder="Enter your email or username"
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
            <label htmlFor="password" className="label">
              Password
            </label>
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

          {/* Remember / Forgot */}
          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
              />
              <span className="text-slate-600 dark:text-slate-400">Remember me</span>
            </label>
            <a
              href="#"
              className="font-medium text-cyan-600 hover:text-cyan-700 dark:text-cyan-400"
            >
              Forgot password?
            </a>
          </div>

          {/* Sign In */}
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-3 text-base font-semibold shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 transition-all"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Signing in…
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="relative my-6 max-w-sm">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200 dark:border-slate-700" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white dark:bg-slate-900 px-3 text-slate-400">
              or continue with
            </span>
          </div>
        </div>

        {/* Google */}
        <button
          type="button"
          onClick={() => {
            if (slug) window.location.href = `/api/auth/google?subdomain=${slug}`;
          }}
          className="btn-secondary max-w-sm w-full py-2.5 text-sm"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Google
        </button>

        {/* Register link */}
        <p className="mt-8 text-sm text-slate-500 dark:text-slate-400 max-w-sm">
          Don&apos;t have a hospital account?{' '}
          <a
            href="/signup"
            className="font-semibold text-cyan-600 hover:text-cyan-700 dark:text-cyan-400"
          >
            Register
          </a>
        </p>

        {/* HIPAA badge */}
        <div className="mt-4 flex items-center gap-1.5 text-xs text-slate-400 max-w-sm">
          <ShieldCheck className="w-3.5 h-3.5" />
          Protected by HIPAA-grade security
        </div>
      </div>

      {/* ── Right Panel: Branding ── */}
      <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-cyan-50 via-teal-50/60 to-sky-100 dark:from-slate-800 dark:via-cyan-950/40 dark:to-slate-900 items-center justify-center relative overflow-hidden">
        {/* Decorative blurs */}
        <div className="absolute -top-32 -right-32 w-72 h-72 bg-cyan-200/40 dark:bg-cyan-800/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-teal-200/40 dark:bg-teal-800/20 rounded-full blur-3xl" />
        <div className="absolute top-1/3 right-1/4 w-40 h-40 bg-sky-200/30 dark:bg-sky-800/10 rounded-full blur-2xl" />

        <div className="relative z-10 text-center px-12">
          {/* Floating cards */}
          <div className="relative mb-12">
            {/* Top-right icon */}
            <div className="absolute -top-6 -right-2 w-14 h-14 bg-white dark:bg-slate-700 rounded-2xl shadow-lg flex items-center justify-center rotate-6 animate-pulse">
              <Stethoscope className="w-7 h-7 text-cyan-600 dark:text-cyan-400" />
            </div>
            {/* Bottom-left icon */}
            <div className="absolute -bottom-4 -left-4 w-12 h-12 bg-white dark:bg-slate-700 rounded-xl shadow-lg flex items-center justify-center -rotate-6">
              <Building2 className="w-6 h-6 text-teal-600 dark:text-teal-400" />
            </div>

            {/* Central card */}
            <div className="w-56 h-56 mx-auto bg-white/80 dark:bg-slate-700/60 backdrop-blur-sm rounded-3xl shadow-xl border border-white/60 dark:border-slate-600 flex items-center justify-center">
              <div className="w-28 h-28 rounded-full bg-gradient-to-br from-cyan-400 to-teal-500 flex items-center justify-center shadow-lg shadow-cyan-400/30">
                <Heart className="w-14 h-14 text-white" fill="white" fillOpacity={0.2} />
              </div>
            </div>
          </div>

          {/* Tagline */}
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white leading-snug">
            Streamline your hospital
            <br />
            operations
          </h2>
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Trusted by 50+ hospitals in Bangladesh
          </p>
        </div>
      </div>
    </div>
  );
}
