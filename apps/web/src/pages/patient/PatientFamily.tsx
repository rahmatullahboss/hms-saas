import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../hooks/useAuth';
import { SkeletonCard } from '../../components/LoadingSkeleton';

interface FamilyMember {
  link_id: number;
  relationship: string;
  child_patient_id: number;
  name: string;
  patient_code: string;
  age: number;
  gender: string;
  blood_group: string;
}

const relationships = ['spouse', 'child', 'parent', 'sibling', 'other'] as const;

export default function PatientFamily() {
  const { token } = useAuth();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [patientCode, setPatientCode] = useState('');
  const [relationship, setRelationship] = useState<string>('child');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const headers = {
    Authorization: `Bearer ${token}`,
    'X-Tenant-Subdomain': window.location.hostname.split('.')[0],
  };

  const loadMembers = () => {
    axios.get('/api/patient-portal/family', { headers })
      .then(({ data }) => setMembers(data.familyMembers ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadMembers(); }, [token]);

  const handleLink = async () => {
    if (!patientCode.trim()) return;
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const { data } = await axios.post('/api/patient-portal/family', {
        patientCode, relationship,
      }, { headers });
      setSuccess(data.message);
      setPatientCode('');
      setShowForm(false);
      loadMembers();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to link');
    }
    setSubmitting(false);
  };

  const handleUnlink = async (linkId: number) => {
    if (!confirm('Remove this family member link?')) return;
    try {
      await axios.delete(`/api/patient-portal/family/${linkId}`, { headers });
      setMembers((prev) => prev.filter((m) => m.link_id !== linkId));
    } catch {
      alert('Failed to unlink');
    }
  };

  if (loading) return <SkeletonCard count={3} />;

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0',
    fontSize: '14px', color: '#0f172a', outline: 'none', background: '#f8fafc', boxSizing: 'border-box',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 1rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
          👨‍👩‍👧‍👦 Family Members
        </h2>
        <button onClick={() => setShowForm(!showForm)} style={{
          padding: '6px 14px', borderRadius: '8px', border: '1px solid #0891b2',
          background: '#ecfeff', color: '#0891b2', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
        }}>
          {showForm ? '✕ Close' : '➕ Add Member'}
        </button>
      </div>

      {error && (
        <div style={{
          background: '#fef2f2', color: '#b91c1c', padding: '10px 14px',
          borderRadius: '8px', fontSize: '13px', marginBottom: '12px', border: '1px solid #fecaca',
        }}>{error}</div>
      )}
      {success && (
        <div style={{
          background: '#ecfdf5', color: '#059669', padding: '10px 14px',
          borderRadius: '8px', fontSize: '13px', marginBottom: '12px', border: '1px solid #bbf7d0',
        }}>{success}</div>
      )}

      {showForm && (
        <div style={{
          background: '#fff', borderRadius: '12px', padding: '16px',
          border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', marginBottom: '1rem',
        }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#0891b2', marginBottom: '12px' }}>
            Link a Family Member
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#64748b', fontWeight: 500, display: 'block', marginBottom: '4px' }}>
                Patient Code *
              </label>
              <input value={patientCode} onChange={(e) => setPatientCode(e.target.value)}
                placeholder="e.g., P-000042" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#64748b', fontWeight: 500, display: 'block', marginBottom: '4px' }}>
                Relationship
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {relationships.map((r) => (
                  <button key={r} onClick={() => setRelationship(r)} style={{
                    padding: '5px 12px', borderRadius: '8px',
                    border: relationship === r ? '1.5px solid #0891b2' : '1px solid #e2e8f0',
                    background: relationship === r ? '#ecfeff' : '#fff',
                    color: relationship === r ? '#0891b2' : '#64748b',
                    fontSize: '13px', fontWeight: 500, cursor: 'pointer', textTransform: 'capitalize',
                  }}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={handleLink} disabled={submitting} style={{
              padding: '10px', borderRadius: '8px', border: 'none',
              background: '#0891b2', color: '#fff', fontSize: '14px', fontWeight: 600,
              cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1,
            }}>
              {submitting ? 'Linking...' : '🔗 Link Member'}
            </button>
          </div>
        </div>
      )}

      {members.length === 0 && !showForm ? (
        <div style={{
          background: '#fff', borderRadius: '12px', padding: '2rem',
          textAlign: 'center', color: '#94a3b8', fontSize: '14px',
          border: '1px solid #f1f5f9',
        }}>
          No family members linked yet. Add your family members to manage their health records.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {members.map((m) => (
            <div key={m.link_id} style={{
              background: '#fff', borderRadius: '12px', padding: '14px',
              border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '14px' }}>{m.name}</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                  {m.relationship} • {m.gender || '—'} • Age {m.age || '—'}
                  {m.blood_group ? ` • ${m.blood_group}` : ''}
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                  Code: {m.patient_code || '—'}
                </div>
              </div>
              <button onClick={() => handleUnlink(m.link_id)} style={{
                padding: '4px 10px', borderRadius: '6px', border: '1px solid #fecaca',
                background: '#fff', color: '#dc2626', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
              }}>
                Unlink
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
