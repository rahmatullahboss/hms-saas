import { useState } from 'react';
import { useNavigate } from 'react-router';
import axios from 'axios';
import toast from 'react-hot-toast';
import { saveToken } from '../../hooks/useAuth';

type Step = 'email' | 'otp';

export default function PatientLogin() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [devOtp, setDevOtp] = useState<string | null>(null);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Tenant-Subdomain': window.location.hostname.split('.')[0],
  };

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await axios.post('/api/patient-portal/request-otp', { email }, { headers });
      if (data.otp) setDevOtp(data.otp);
      toast.success(data.message || 'OTP sent!');
      setStep('otp');
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await axios.post('/api/patient-portal/verify-otp', { email, otp }, { headers });
      saveToken(data.token);
      toast.success(`Welcome, ${data.user.name}!`);
      navigate('/patient/dashboard', { replace: true });
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #e0f2fe 0%, #f0fdf4 50%, #fef3c7 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{
        width: '100%',
        maxWidth: '420px',
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(16px)',
        borderRadius: '20px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
        padding: '2.5rem',
        border: '1px solid rgba(255,255,255,0.6)',
      }}>
        {/* Logo / Title */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #0891b2, #059669)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1rem',
            fontSize: '28px',
          }}>
            🏥
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
            Patient Portal
          </h1>
          <p style={{ color: '#64748b', fontSize: '14px', marginTop: '6px' }}>
            Access your health records securely
          </p>
        </div>

        {step === 'email' ? (
          <form onSubmit={handleRequestOtp}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your registered email"
              required
              style={{
                width: '100%',
                padding: '12px 16px',
                border: '1.5px solid #e5e7eb',
                borderRadius: '12px',
                fontSize: '15px',
                outline: 'none',
                transition: 'border-color 0.2s',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => (e.target.style.borderColor = '#0891b2')}
              onBlur={(e) => (e.target.style.borderColor = '#e5e7eb')}
            />
            <button
              type="submit"
              disabled={loading || !email}
              style={{
                width: '100%',
                padding: '12px',
                marginTop: '1rem',
                background: loading ? '#94a3b8' : 'linear-gradient(135deg, #0891b2, #059669)',
                color: '#fff',
                border: 'none',
                borderRadius: '12px',
                fontSize: '15px',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {loading ? '...' : 'Send OTP'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp}>
            <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '1rem', textAlign: 'center' }}>
              OTP sent to <strong>{email}</strong>
            </p>

            {devOtp && (
              <div style={{
                background: '#fef3c7',
                border: '1px solid #fbbf24',
                borderRadius: '8px',
                padding: '8px 12px',
                marginBottom: '1rem',
                fontSize: '13px',
                color: '#92400e',
                textAlign: 'center',
              }}>
                🧪 Dev OTP: <strong>{devOtp}</strong>
              </div>
            )}

            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
              Enter 6-digit OTP
            </label>
            <input
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              required
              style={{
                width: '100%',
                padding: '12px 16px',
                border: '1.5px solid #e5e7eb',
                borderRadius: '12px',
                fontSize: '24px',
                fontWeight: 600,
                letterSpacing: '0.5em',
                textAlign: 'center',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              autoFocus
              onFocus={(e) => (e.target.style.borderColor = '#0891b2')}
              onBlur={(e) => (e.target.style.borderColor = '#e5e7eb')}
            />
            <button
              type="submit"
              disabled={loading || otp.length !== 6}
              style={{
                width: '100%',
                padding: '12px',
                marginTop: '1rem',
                background: loading ? '#94a3b8' : 'linear-gradient(135deg, #0891b2, #059669)',
                color: '#fff',
                border: 'none',
                borderRadius: '12px',
                fontSize: '15px',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? '...' : 'Verify & Login'}
            </button>

            <button
              type="button"
              onClick={() => { setStep('email'); setOtp(''); setDevOtp(null); }}
              style={{
                width: '100%',
                padding: '10px',
                marginTop: '0.5rem',
                background: 'transparent',
                color: '#0891b2',
                border: 'none',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              ← Change email
            </button>
          </form>
        )}

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '12px', color: '#94a3b8' }}>
          Hospital staff?{' '}
          <a href="/login" style={{ color: '#0891b2', textDecoration: 'none' }}>
            Staff Login
          </a>
        </div>
      </div>
    </div>
  );
}
