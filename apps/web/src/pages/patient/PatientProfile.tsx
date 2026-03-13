import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../hooks/useAuth';

interface PatientProfile {
  id: number;
  name: string;
  patient_code: string;
  email: string;
  mobile: string;
  guardian_mobile: string;
  father_husband: string;
  age: number;
  gender: string;
  blood_group: string;
  address: string;
  date_of_birth: string;
  created_at: string;
}

export default function PatientProfilePage() {
  const { token } = useAuth();
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editData, setEditData] = useState({ mobile: '', guardian_mobile: '', address: '', email: '' });

  const headers = {
    Authorization: `Bearer ${token}`,
    'X-Tenant-Subdomain': window.location.hostname.split('.')[0],
  };

  useEffect(() => {
    axios.get('/api/patient-portal/me', { headers })
      .then(({ data }) => {
        setProfile(data);
        setEditData({
          mobile: data.mobile || '',
          guardian_mobile: data.guardian_mobile || '',
          address: data.address || '',
          email: data.email || '',
        });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.patch('/api/patient-portal/me', editData, { headers });
      setProfile((prev) => prev ? { ...prev, ...editData } : prev);
      setEditing(false);
    } catch (e) {
      console.error(e);
      alert('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    if (profile) {
      setEditData({
        mobile: profile.mobile || '',
        guardian_mobile: profile.guardian_mobile || '',
        address: profile.address || '',
        email: profile.email || '',
      });
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>Loading...</div>;
  if (!profile) return <div style={{ textAlign: 'center', padding: '3rem', color: '#ef4444' }}>Profile not found</div>;

  const readOnlyFields = [
    { label: 'Patient ID', value: profile.patient_code, icon: '🆔' },
    { label: 'Full Name', value: profile.name, icon: '👤' },
    { label: 'Father/Husband', value: profile.father_husband, icon: '👨' },
    { label: 'Age', value: profile.age ? `${profile.age} years` : null, icon: '🎂' },
    { label: 'Gender', value: profile.gender, icon: '⚧' },
    { label: 'Blood Group', value: profile.blood_group, icon: '🩸' },
    { label: 'Date of Birth', value: profile.date_of_birth, icon: '📅' },
    { label: 'Member Since', value: profile.created_at ? new Date(profile.created_at).toLocaleDateString() : null, icon: '🗓' },
  ].filter((f) => f.value);

  const editableFields = [
    { label: 'Email', key: 'email' as const, icon: '📧' },
    { label: 'Mobile', key: 'mobile' as const, icon: '📱' },
    { label: 'Guardian Mobile', key: 'guardian_mobile' as const, icon: '📞' },
    { label: 'Address', key: 'address' as const, icon: '📍' },
  ];

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0',
    fontSize: '14px', color: '#0f172a', outline: 'none', background: '#f8fafc',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>👤 My Profile</h2>
        {!editing && (
          <button onClick={() => setEditing(true)} style={{
            padding: '6px 14px', borderRadius: '8px', border: '1px solid #0891b2',
            background: '#ecfeff', color: '#0891b2', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
          }}>
            ✏️ Edit
          </button>
        )}
      </div>

      {/* Hero card */}
      <div style={{
        background: 'linear-gradient(135deg, #0891b2, #059669)',
        borderRadius: '16px', padding: '24px', color: '#fff', textAlign: 'center', marginBottom: '1.5rem',
      }}>
        <div style={{
          width: '72px', height: '72px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 12px', fontSize: '32px', fontWeight: 700,
        }}>{profile.name?.[0]?.toUpperCase() || '?'}</div>
        <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{profile.name}</div>
        <div style={{ opacity: 0.85, fontSize: '14px', marginTop: '4px' }}>{profile.patient_code}</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '10px', fontSize: '13px' }}>
          {profile.blood_group && <span style={{ background: 'rgba(255,255,255,0.2)', padding: '3px 10px', borderRadius: '6px' }}>{profile.blood_group}</span>}
          {profile.gender && <span style={{ background: 'rgba(255,255,255,0.2)', padding: '3px 10px', borderRadius: '6px' }}>{profile.gender}</span>}
          {profile.age && <span style={{ background: 'rgba(255,255,255,0.2)', padding: '3px 10px', borderRadius: '6px' }}>{profile.age} yrs</span>}
        </div>
      </div>

      {/* Editable fields */}
      {editing && (
        <div style={{
          background: '#fff', borderRadius: '14px', border: '1px solid #f1f5f9',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)', padding: '16px', marginBottom: '1rem',
        }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#0891b2', marginBottom: '12px' }}>Edit Information</div>
          {editableFields.map((f) => (
            <div key={f.key} style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '12px', color: '#64748b', fontWeight: 500, display: 'block', marginBottom: '4px' }}>
                {f.icon} {f.label}
              </label>
              <input
                type={f.key === 'email' ? 'email' : 'text'}
                value={editData[f.key]}
                onChange={(e) => setEditData((prev) => ({ ...prev, [f.key]: e.target.value }))}
                style={inputStyle}
              />
            </div>
          ))}
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button onClick={handleSave} disabled={saving} style={{
              flex: 1, padding: '10px', borderRadius: '8px', border: 'none',
              background: '#0891b2', color: '#fff', fontSize: '14px', fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
            }}>
              {saving ? 'Saving...' : '✅ Save Changes'}
            </button>
            <button onClick={handleCancel} style={{
              padding: '10px 16px', borderRadius: '8px', border: '1px solid #e2e8f0',
              background: '#fff', color: '#64748b', fontSize: '14px', fontWeight: 500, cursor: 'pointer',
            }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Read-only fields */}
      <div style={{
        background: '#fff', borderRadius: '14px', border: '1px solid #f1f5f9',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden',
      }}>
        {/* Show editable fields as read-only when not editing */}
        {!editing && editableFields.map((f) => {
          const value = profile[f.key as keyof PatientProfile];
          if (!value) return null;
          return (
            <div key={f.key} style={{
              padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px',
              borderBottom: '1px solid #f1f5f9',
            }}>
              <span style={{ fontSize: '18px', width: '28px', textAlign: 'center' }}>{f.icon}</span>
              <div>
                <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500 }}>{f.label}</div>
                <div style={{ fontSize: '14px', color: '#0f172a', fontWeight: 500 }}>{String(value)}</div>
              </div>
            </div>
          );
        })}
        {readOnlyFields.map((field, i) => (
          <div key={i} style={{
            padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px',
            borderBottom: i < readOnlyFields.length - 1 ? '1px solid #f1f5f9' : 'none',
          }}>
            <span style={{ fontSize: '18px', width: '28px', textAlign: 'center' }}>{field.icon}</span>
            <div>
              <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500 }}>{field.label}</div>
              <div style={{ fontSize: '14px', color: '#0f172a', fontWeight: 500 }}>{field.value}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
