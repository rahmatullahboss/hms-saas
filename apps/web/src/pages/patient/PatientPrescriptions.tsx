import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../hooks/useAuth';
import Pagination from '../../components/Pagination';

interface Prescription {
  id: number;
  rx_no: string;
  diagnosis: string;
  chief_complaint: string;
  advice: string;
  follow_up_date: string;
  bp: string;
  temperature: string;
  weight: string;
  spo2: string;
  created_at: string;
  status: string;
  doctor_name: string;
  doctor_specialization: string;
}

interface PrescriptionItem {
  id: number;
  medicine_name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
}

export default function PatientPrescriptions() {
  const { token } = useAuth();
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [items, setItems] = useState<Record<number, PrescriptionItem[]>>({});

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    setLoading(true);
    const headers = {
      Authorization: `Bearer ${token}`,
      'X-Tenant-Subdomain': window.location.hostname.split('.')[0],
    };
    axios.get(`/api/patient-portal/prescriptions?page=${page}&limit=20`, { headers })
      .then(({ data }) => {
        setPrescriptions(data.data ?? []);
        setTotalPages(data.pagination?.totalPages ?? 1);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token, page]);

  const toggleExpand = async (id: number) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!items[id]) {
      try {
        const headers = {
          Authorization: `Bearer ${token}`,
          'X-Tenant-Subdomain': window.location.hostname.split('.')[0],
        };
        const { data } = await axios.get(`/api/patient-portal/prescriptions/${id}/items`, { headers });
        setItems((prev) => ({ ...prev, [id]: data.items }));
      } catch (e) { console.error(e); }
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>Loading...</div>;

  return (
    <div>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', margin: '0 0 1rem' }}>💊 My Prescriptions</h2>

      {prescriptions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>No prescriptions found</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {prescriptions.map((rx) => (
            <div key={rx.id} style={{
              background: '#fff', borderRadius: '14px',
              border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden',
            }}>
              <button onClick={() => toggleExpand(rx.id)} style={{
                width: '100%', padding: '14px 16px', border: 'none', background: 'transparent',
                cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              }}>
                <div>
                  <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '14px' }}>Rx #{rx.rx_no}</div>
                  <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>
                    🩺 {rx.doctor_name || 'Doctor'}{rx.doctor_specialization && ` • ${rx.doctor_specialization}`}
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>{new Date(rx.created_at).toLocaleDateString()}</div>
                </div>
                <span style={{ fontSize: '18px', color: '#94a3b8', transform: expandedId === rx.id ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>▼</span>
              </button>

              {expandedId === rx.id && (
                <div style={{ padding: '0 16px 16px', borderTop: '1px solid #f1f5f9' }}>
                  {(rx.bp || rx.temperature || rx.weight || rx.spo2) && (
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                      {rx.bp && <span style={{ background: '#fef3c7', padding: '3px 10px', borderRadius: '6px', fontSize: '12px', color: '#92400e' }}>BP: {rx.bp}</span>}
                      {rx.temperature && <span style={{ background: '#fee2e2', padding: '3px 10px', borderRadius: '6px', fontSize: '12px', color: '#b91c1c' }}>🌡 {rx.temperature}°F</span>}
                      {rx.weight && <span style={{ background: '#e0f2fe', padding: '3px 10px', borderRadius: '6px', fontSize: '12px', color: '#0369a1' }}>⚖ {rx.weight}kg</span>}
                      {rx.spo2 && <span style={{ background: '#dcfce7', padding: '3px 10px', borderRadius: '6px', fontSize: '12px', color: '#15803d' }}>SpO₂: {rx.spo2}%</span>}
                    </div>
                  )}

                  {rx.diagnosis && (
                    <div style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '2px' }}>Diagnosis</div>
                      <div style={{ fontSize: '14px', color: '#0f172a', fontWeight: 500 }}>{rx.diagnosis}</div>
                    </div>
                  )}

                  <div style={{ padding: '10px 0' }}>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px' }}>Medicines</div>
                    {!items[rx.id] ? (
                      <div style={{ color: '#94a3b8', fontSize: '13px' }}>Loading...</div>
                    ) : items[rx.id].length === 0 ? (
                      <div style={{ color: '#94a3b8', fontSize: '13px' }}>No medicines in this prescription</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {items[rx.id].map((med) => (
                          <div key={med.id} style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px' }}>
                            <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '14px' }}>💊 {med.medicine_name}</div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px', fontSize: '12px', color: '#64748b' }}>
                              {med.dosage && <span>📐 {med.dosage}</span>}
                              {med.frequency && <span>🔁 {med.frequency}</span>}
                              {med.duration && <span>⏱ {med.duration}</span>}
                            </div>
                            {med.instructions && <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px', fontStyle: 'italic' }}>{med.instructions}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {rx.advice && (
                    <div style={{ padding: '10px 0', borderTop: '1px solid #f1f5f9' }}>
                      <div style={{ fontSize: '12px', color: '#94a3b8' }}>Advice</div>
                      <div style={{ fontSize: '13px', color: '#475569' }}>{rx.advice}</div>
                    </div>
                  )}
                  {rx.follow_up_date && (
                    <div style={{ background: '#ecfeff', padding: '8px 12px', borderRadius: '8px', fontSize: '13px', color: '#0891b2', fontWeight: 500 }}>
                      📅 Follow-up: {rx.follow_up_date}
                    </div>
                  )}
                  <div style={{ paddingTop: '8px', borderTop: '1px solid #f1f5f9', marginTop: '8px' }}>
                    <button onClick={async (e) => {
                      e.stopPropagation();
                      const btn = e.currentTarget;
                      btn.disabled = true;
                      btn.textContent = 'Requesting...';
                      try {
                        await axios.post(`/api/patient-portal/prescriptions/${rx.id}/refill`, {}, {
                          headers: {
                            Authorization: `Bearer ${token}`,
                            'X-Tenant-Subdomain': window.location.hostname.split('.')[0],
                          },
                        });
                        btn.textContent = '✅ Refill Requested';
                        btn.style.background = '#ecfdf5';
                        btn.style.color = '#059669';
                        btn.style.borderColor = '#bbf7d0';
                      } catch (err: any) {
                        btn.textContent = err.response?.data?.message || 'Failed';
                        btn.style.color = '#b91c1c';
                        btn.disabled = false;
                      }
                    }} style={{
                      padding: '6px 14px', borderRadius: '8px',
                      border: '1px solid #e2e8f0', background: '#fff', color: '#0891b2',
                      fontSize: '13px', fontWeight: 500, cursor: 'pointer',
                    }}>🔄 Request Refill</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
