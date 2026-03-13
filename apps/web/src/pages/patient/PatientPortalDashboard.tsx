import { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router';
import { useAuth } from '../../hooks/useAuth';
import { SkeletonCard } from '../../components/LoadingSkeleton';

interface DashboardData {
  nextAppointment: any;
  latestLabResult: any;
  activePrescriptions: number;
  billing: { totalDue: number; totalPaid: number; totalBilled: number };
  totalVisits: number;
}

export default function PatientPortalDashboard() {
  const { token } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const headers = {
      Authorization: `Bearer ${token}`,
      'X-Tenant-Subdomain': window.location.hostname.split('.')[0],
    };
    Promise.all([
      axios.get('/api/patient-portal/dashboard', { headers }),
      axios.get('/api/patient-portal/me', { headers }),
    ]).then(([dashRes, meRes]) => {
      setData(dashRes.data);
      setProfile(meRes.data);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <SkeletonCard count={5} />;

  const cards = [
    {
      icon: '📅', title: 'Next Appointment',
      value: data?.nextAppointment
        ? `${data.nextAppointment.doctor_name || 'Doctor'} — ${data.nextAppointment.appt_date}`
        : 'No upcoming appointments',
      color: '#3b82f6', bg: '#eff6ff',
    },
    {
      icon: '🧪', title: 'Latest Lab Result',
      value: data?.latestLabResult
        ? `${data.latestLabResult.test_names || 'Tests'} (${data.latestLabResult.status})`
        : 'No lab results yet',
      color: '#8b5cf6', bg: '#f5f3ff',
    },
    { icon: '💊', title: 'Active Prescriptions', value: String(data?.activePrescriptions ?? 0), color: '#059669', bg: '#ecfdf5' },
    {
      icon: '💰', title: 'Outstanding Balance',
      value: `৳ ${(data?.billing?.totalDue ?? 0).toLocaleString()}`,
      color: data?.billing?.totalDue ? '#dc2626' : '#059669',
      bg: data?.billing?.totalDue ? '#fef2f2' : '#ecfdf5',
    },
    { icon: '🏥', title: 'Total Visits', value: String(data?.totalVisits ?? 0), color: '#0891b2', bg: '#ecfeff' },
  ];

  const quickActions = [
    { to: '/patient/book-appointment', icon: '➕', label: 'Book Appointment', color: '#0891b2' },
    { to: '/patient/messages', icon: '💬', label: 'Messages', color: '#7c3aed' },
    { to: '/patient/lab-results', icon: '🧪', label: 'Lab Results', color: '#059669' },
    { to: '/patient/bills', icon: '💰', label: 'Bills', color: '#ea580c' },
    { to: '/patient/timeline', icon: '🕐', label: 'Health Timeline', color: '#6366f1' },
    { to: '/patient/family', icon: '👨‍👩‍👧', label: 'Family', color: '#ec4899' },
  ];

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
          👋 Hello, {profile?.name || 'Patient'}
        </h2>
        <p style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>
          {profile?.patient_code && <span style={{ background: '#e0f2fe', padding: '2px 8px', borderRadius: '6px', fontSize: '12px', color: '#0369a1', fontWeight: 500 }}>{profile.patient_code}</span>}
          {' '}{profile?.blood_group && `• ${profile.blood_group}`}
          {profile?.gender && ` • ${profile.gender}`}
          {profile?.age && ` • ${profile.age} yrs`}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
        {cards.map((card, i) => (
          <div key={i} style={{
            background: '#fff', borderRadius: '14px', padding: '16px',
            border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            display: 'flex', alignItems: 'flex-start', gap: '12px',
            transition: 'transform 0.15s, box-shadow 0.15s', cursor: 'default',
          }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; }}
          >
            <div style={{
              width: '44px', height: '44px', borderRadius: '12px',
              background: card.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '22px', flexShrink: 0,
            }}>{card.icon}</div>
            <div>
              <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500, marginBottom: '4px' }}>{card.title}</div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: card.color }}>{card.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div style={{ marginTop: '1.5rem' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#64748b', margin: '0 0 12px' }}>Quick Actions</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
          {quickActions.map((qa) => (
            <Link key={qa.to} to={qa.to} style={{
              textDecoration: 'none', display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: '6px', padding: '14px 8px',
              background: '#fff', borderRadius: '12px', border: '1px solid #f1f5f9',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)', transition: 'transform 0.15s',
            }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = ''; }}
            >
              <span style={{ fontSize: '24px' }}>{qa.icon}</span>
              <span style={{ fontSize: '12px', fontWeight: 500, color: qa.color, textAlign: 'center' }}>{qa.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {data?.billing && (
        <div style={{ marginTop: '1.5rem', background: '#fff', borderRadius: '14px', padding: '16px', border: '1px solid #f1f5f9' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#64748b', margin: '0 0 12px' }}>Financial Summary</h3>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '100px', textAlign: 'center', padding: '12px', background: '#f8fafc', borderRadius: '10px' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>Total Billed</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>৳ {(data.billing.totalBilled).toLocaleString()}</div>
            </div>
            <div style={{ flex: 1, minWidth: '100px', textAlign: 'center', padding: '12px', background: '#ecfdf5', borderRadius: '10px' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>Total Paid</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#059669' }}>৳ {(data.billing.totalPaid).toLocaleString()}</div>
            </div>
            <div style={{ flex: 1, minWidth: '100px', textAlign: 'center', padding: '12px', background: data.billing.totalDue > 0 ? '#fef2f2' : '#ecfdf5', borderRadius: '10px' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>Due</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: data.billing.totalDue > 0 ? '#dc2626' : '#059669' }}>৳ {(data.billing.totalDue).toLocaleString()}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
