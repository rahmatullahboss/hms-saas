import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../hooks/useAuth';

interface Doctor {
  id: number;
  name: string;
  specialty: string;
  consultation_fee: number;
}

export default function BookAppointment() {
  const { token } = useAuth();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [apptDate, setApptDate] = useState('');
  const [apptTime, setApptTime] = useState('');
  const [visitType, setVisitType] = useState<'opd' | 'followup'>('opd');
  const [complaint, setComplaint] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<any>(null);
  const [error, setError] = useState('');

  const headers = {
    Authorization: `Bearer ${token}`,
    'X-Tenant-Subdomain': window.location.hostname.split('.')[0],
  };

  useEffect(() => {
    axios.get('/api/patient-portal/available-doctors', { headers })
      .then(({ data }) => setDoctors(data.doctors ?? []))
      .catch(() => setError('Failed to load doctors'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleBook = async () => {
    if (!selectedDoctor || !apptDate) {
      setError('Please select a doctor and date');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const { data } = await axios.post('/api/patient-portal/book-appointment', {
        doctorId: selectedDoctor.id,
        apptDate,
        apptTime: apptTime || undefined,
        visitType,
        chiefComplaint: complaint || undefined,
      }, { headers });
      setSuccess(data.appointment);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Booking failed');
    } finally {
      setSubmitting(false);
    }
  };

  const today = new Date().toISOString().split('T')[0];

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>Loading...</div>;

  if (success) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <div style={{
          background: '#ecfdf5', borderRadius: '16px', padding: '24px', maxWidth: '400px',
          margin: '0 auto', border: '1px solid #bbf7d0',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
          <h2 style={{ color: '#059669', fontSize: '1.25rem', fontWeight: 700, margin: '0 0 12px' }}>
            Appointment Booked!
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '14px', color: '#334155' }}>
            <div><strong>Appointment #:</strong> {success.apptNo}</div>
            <div><strong>Token:</strong> {success.tokenNo}</div>
            <div><strong>Doctor:</strong> {success.doctorName}</div>
            <div><strong>Date:</strong> {success.date}</div>
            {success.time && <div><strong>Time:</strong> {success.time}</div>}
            <div><strong>Fee:</strong> ৳{success.fee}</div>
          </div>
          <button onClick={() => { setSuccess(null); setSelectedDoctor(null); setApptDate(''); setApptTime(''); setComplaint(''); }}
            style={{
              marginTop: '16px', padding: '10px 24px', borderRadius: '8px', border: 'none',
              background: '#0891b2', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
            }}>
            Book Another
          </button>
        </div>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0',
    fontSize: '14px', color: '#0f172a', outline: 'none', background: '#f8fafc', boxSizing: 'border-box',
  };

  return (
    <div>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', margin: '0 0 1.5rem' }}>
        📅 Book an Appointment
      </h2>

      {error && (
        <div style={{
          background: '#fef2f2', color: '#b91c1c', padding: '10px 14px',
          borderRadius: '8px', fontSize: '13px', marginBottom: '1rem', border: '1px solid #fecaca',
        }}>{error}</div>
      )}

      {/* Step 1: Select Doctor */}
      <div style={{
        background: '#fff', borderRadius: '14px', padding: '16px',
        border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', marginBottom: '1rem',
      }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#0891b2', marginBottom: '12px' }}>
          1. Select Doctor
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {doctors.map((d) => (
            <div key={d.id} onClick={() => setSelectedDoctor(d)}
              style={{
                padding: '12px', borderRadius: '10px', cursor: 'pointer',
                border: selectedDoctor?.id === d.id ? '2px solid #0891b2' : '1px solid #e2e8f0',
                background: selectedDoctor?.id === d.id ? '#ecfeff' : '#fff',
                transition: 'all 0.15s',
              }}>
              <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '14px' }}>🩺 {d.name}</div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                {d.specialty || 'General'} • ৳{d.consultation_fee}
              </div>
            </div>
          ))}
          {doctors.length === 0 && (
            <div style={{ color: '#94a3b8', fontSize: '14px', textAlign: 'center', padding: '1rem' }}>
              No doctors available
            </div>
          )}
        </div>
      </div>

      {/* Step 2: Date & Time */}
      {selectedDoctor && (
        <div style={{
          background: '#fff', borderRadius: '14px', padding: '16px',
          border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', marginBottom: '1rem',
        }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#0891b2', marginBottom: '12px' }}>
            2. Choose Date & Time
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '140px' }}>
              <label style={{ fontSize: '12px', color: '#64748b', fontWeight: 500, display: 'block', marginBottom: '4px' }}>
                Date *
              </label>
              <input type="date" value={apptDate} min={today}
                onChange={(e) => setApptDate(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: 1, minWidth: '140px' }}>
              <label style={{ fontSize: '12px', color: '#64748b', fontWeight: 500, display: 'block', marginBottom: '4px' }}>
                Preferred Time
              </label>
              <input type="time" value={apptTime}
                onChange={(e) => setApptTime(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <div style={{ marginTop: '12px' }}>
            <label style={{ fontSize: '12px', color: '#64748b', fontWeight: 500, display: 'block', marginBottom: '4px' }}>
              Visit Type
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['opd', 'followup'] as const).map((t) => (
                <button key={t} onClick={() => setVisitType(t)} style={{
                  padding: '6px 14px', borderRadius: '8px',
                  border: visitType === t ? '1.5px solid #0891b2' : '1px solid #e2e8f0',
                  background: visitType === t ? '#ecfeff' : '#fff',
                  color: visitType === t ? '#0891b2' : '#64748b',
                  fontSize: '13px', fontWeight: 500, cursor: 'pointer', textTransform: 'uppercase',
                }}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Complaint */}
      {selectedDoctor && apptDate && (
        <div style={{
          background: '#fff', borderRadius: '14px', padding: '16px',
          border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', marginBottom: '1rem',
        }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#0891b2', marginBottom: '12px' }}>
            3. Chief Complaint (Optional)
          </div>
          <textarea value={complaint} onChange={(e) => setComplaint(e.target.value)}
            placeholder="Briefly describe your symptoms or reason for visit..."
            style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} />
        </div>
      )}

      {/* Summary & Book */}
      {selectedDoctor && apptDate && (
        <div style={{
          background: 'linear-gradient(135deg, #0891b2, #059669)',
          borderRadius: '14px', padding: '16px', color: '#fff', marginBottom: '1rem',
        }}>
          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>Booking Summary</div>
          <div style={{ fontSize: '13px', opacity: 0.9, display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span>🩺 {selectedDoctor.name} ({selectedDoctor.specialty || 'General'})</span>
            <span>📆 {apptDate} {apptTime && `at ${apptTime}`}</span>
            <span>💰 Fee: ৳{selectedDoctor.consultation_fee}</span>
          </div>
          <button onClick={handleBook} disabled={submitting}
            style={{
              marginTop: '12px', width: '100%', padding: '12px', borderRadius: '8px',
              border: '2px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.15)',
              color: '#fff', fontSize: '15px', fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.7 : 1,
            }}>
            {submitting ? 'Booking...' : '✅ Confirm Booking'}
          </button>
        </div>
      )}
    </div>
  );
}
