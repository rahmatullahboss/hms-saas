import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../lib/apiClient';
import { saveToken } from '../hooks/useAuth';
import toast from 'react-hot-toast';

interface FormData {
  hospitalName: string;
  slug: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  confirmPassword: string;
}

export default function HospitalSignup() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormData>({
    hospitalName: '',
    slug: '',
    adminName: '',
    adminEmail: '',
    adminPassword: '',
    confirmPassword: '',
  });

  function toSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function handleHospitalNameChange(value: string) {
    setForm((f) => ({
      ...f,
      hospitalName: value,
      slug: toSlug(value),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.adminPassword !== form.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (form.slug.length < 3) {
      toast.error('Slug must be at least 3 characters');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post<{
        token: string;
        slug: string;
        user: { role: string };
      }>('/api/register', {
        hospitalName: form.hospitalName,
        slug: form.slug,
        adminName: form.adminName,
        adminEmail: form.adminEmail,
        adminPassword: form.adminPassword,
      });

      saveToken(res.token);
      toast.success(`Welcome! Hospital "${form.hospitalName}" registered.`);
      navigate(`/h/${res.slug}/dashboard`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="signup-page">
      <div className="signup-card">
        <div className="signup-header">
          <div className="signup-icon">🏥</div>
          <h1>Register Your Hospital</h1>
          <p>Set up your hospital management system in minutes</p>
        </div>

        <form onSubmit={handleSubmit} className="signup-form">
          <div className="form-section">
            <h3>Hospital Details</h3>

            <div className="form-group">
              <label htmlFor="hospitalName">Hospital Name</label>
              <input
                id="hospitalName"
                type="text"
                placeholder="City General Hospital"
                value={form.hospitalName}
                onChange={(e) => handleHospitalNameChange(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="slug">
                Hospital URL Slug
                <span className="label-hint">Only lowercase letters, numbers, hyphens</span>
              </label>
              <div className="slug-preview">
                <span className="slug-prefix">yourapp.com/h/</span>
                <input
                  id="slug"
                  type="text"
                  placeholder="city-general"
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: toSlug(e.target.value) }))}
                  required
                  minLength={3}
                />
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3>Admin Account</h3>

            <div className="form-group">
              <label htmlFor="adminName">Your Full Name</label>
              <input
                id="adminName"
                type="text"
                placeholder="Dr. John Doe"
                value={form.adminName}
                onChange={(e) => setForm((f) => ({ ...f, adminName: e.target.value }))}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="adminEmail">Admin Email</label>
              <input
                id="adminEmail"
                type="email"
                placeholder="admin@hospital.com"
                value={form.adminEmail}
                onChange={(e) => setForm((f) => ({ ...f, adminEmail: e.target.value }))}
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="adminPassword">Password</label>
                <input
                  id="adminPassword"
                  type="password"
                  placeholder="Min 8 characters"
                  value={form.adminPassword}
                  onChange={(e) => setForm((f) => ({ ...f, adminPassword: e.target.value }))}
                  required
                  minLength={8}
                />
              </div>
              <div className="form-group">
                <label htmlFor="confirmPassword">Confirm Password</label>
                <input
                  id="confirmPassword"
                  type="password"
                  placeholder="Repeat password"
                  value={form.confirmPassword}
                  onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                  required
                  minLength={8}
                />
              </div>
            </div>
          </div>

          <button type="submit" className="btn-primary signup-btn" disabled={loading}>
            {loading ? 'Creating account…' : 'Create Hospital Account'}
          </button>

          <p className="signin-link">
            Already registered?{' '}
            <a href={form.slug ? `/h/${form.slug}/login` : '/h/your-hospital/login'}>
              Sign in
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}
