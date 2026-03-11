import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { api } from '../lib/apiClient';
import { saveToken } from '../hooks/useAuth';
import toast from 'react-hot-toast';

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
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div className="login-icon">🏥</div>
          <h1>Hospital Login</h1>
          {slug && <p className="login-hospital-slug">{slug}</p>}
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              placeholder="you@hospital.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn-primary login-btn" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="login-footer">
          Don't have an account?{' '}
          <a href="/signup">Register your hospital</a>
        </p>
      </div>
    </div>
  );
}
