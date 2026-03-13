import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../hooks/useAuth';
import { Link } from 'react-router';
import Pagination from '../../components/Pagination';

interface Appointment {
  id: number;
  appt_no: string;
  appt_date: string;
  appt_time: string;
  visit_type: string;
  status: string;
  chief_complaint: string;
  fee: number;
  doctor_name: string;
  doctor_specialization: string;
}

const statusColors: Record<string, { bg: string; color: string }> = {
  scheduled: { bg: '#dbeafe', color: '#1d4ed8' },
  'checked-in': { bg: '#fef9c3', color: '#a16207' },
  completed: { bg: '#dcfce7', color: '#15803d' },
  cancelled: { bg: '#fee2e2', color: '#b91c1c' },
  'no-show': { bg: '#f3e8ff', color: '#7e22ce' },
};

export default function PatientAppointments() {
  const { token } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'past'>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    setLoading(true);
    const headers = {
      Authorization: `Bearer ${token}`,
      'X-Tenant-Subdomain': window.location.hostname.split('.')[0],
    };
    axios.get(`/api/patient-portal/appointments?page=${page}&limit=20`, { headers })
      .then(({ data }) => {
        setAppointments(data.data ?? []);
        setTotalPages(data.pagination?.totalPages ?? 1);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token, page]);

  const today = new Date().toISOString().split('T')[0];
  const filtered = appointments.filter((a) => {
    if (filter === 'upcoming') return a.appt_date >= today && a.status !== 'cancelled';
    if (filter === 'past') return a.appt_date < today || a.status === 'completed';
    return true;
  });

  const cancelAppointment = async (id: number) => {
    if (!confirm('Are you sure you want to cancel this appointment?')) return;
    try {
      await axios.post(`/api/patient-portal/cancel-appointment/${id}`, {}, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Tenant-Subdomain': window.location.hostname.split('.')[0],
        },
      });
      setAppointments((prev) => prev.map((a) => a.id === id ? { ...a, status: 'cancelled' } : a));
    } catch {
      alert('Failed to cancel');
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>Loading...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 1rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
          📅 My Appointments
        </h2>
        <Link to="/patient/book-appointment" style={{
          padding: '6px 14px', borderRadius: '8px', border: '1px solid #0891b2',
          background: '#ecfeff', color: '#0891b2', fontSize: '13px', fontWeight: 500,
          textDecoration: 'none',
        }}>
          ➕ Book New
        </Link>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem' }}>
        {(['all', 'upcoming', 'past'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '6px 14px', borderRadius: '8px',
            border: filter === f ? '1.5px solid #0891b2' : '1px solid #e2e8f0',
            background: filter === f ? '#ecfeff' : '#fff',
            color: filter === f ? '#0891b2' : '#64748b',
            fontSize: '13px', fontWeight: 500, cursor: 'pointer',
          }}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>No appointments found</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map((a) => {
            const sc = statusColors[a.status] || { bg: '#f1f5f9', color: '#64748b' };
            return (
              <div key={a.id} style={{
                background: '#fff', borderRadius: '14px', padding: '14px 16px',
                border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '15px' }}>🩺 {a.doctor_name || 'Doctor'}</div>
                    {a.doctor_specialization && <div style={{ fontSize: '12px', color: '#94a3b8' }}>{a.doctor_specialization}</div>}
                  </div>
                  <span style={{
                    background: sc.bg, color: sc.color, padding: '3px 10px',
                    borderRadius: '6px', fontSize: '11px', fontWeight: 600, textTransform: 'capitalize',
                  }}>{a.status}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '13px', color: '#64748b' }}>
                  <span>📆 {a.appt_date}</span>
                  {a.appt_time && <span>🕐 {a.appt_time}</span>}
                  {a.visit_type && <span>📋 {a.visit_type}</span>}
                  {a.fee > 0 && <span>💰 ৳{a.fee}</span>}
                </div>
                {a.chief_complaint && (
                  <div style={{ marginTop: '8px', fontSize: '13px', color: '#475569', fontStyle: 'italic' }}>{a.chief_complaint}</div>
                )}
                {a.status === 'scheduled' && (
                  <button onClick={() => cancelAppointment(a.id)} style={{
                    marginTop: '8px', padding: '4px 10px', borderRadius: '6px',
                    border: '1px solid #fecaca', background: '#fff', color: '#dc2626',
                    fontSize: '12px', fontWeight: 500, cursor: 'pointer',
                  }}>
                    ✕ Cancel
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
