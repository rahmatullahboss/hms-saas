import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../hooks/useAuth';
import Pagination from '../../components/Pagination';

interface TimelineEvent {
  event_type: string;
  id: number;
  event_date: string;
  title: string;
  detail: string;
  description: string;
  icon: string;
}

const typeColors: Record<string, string> = {
  appointment: '#0891b2',
  prescription: '#7c3aed',
  lab_order: '#059669',
  bill: '#ea580c',
};

export default function PatientTimeline() {
  const { token } = useAuth();
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const headers = {
    Authorization: `Bearer ${token}`,
    'X-Tenant-Subdomain': window.location.hostname.split('.')[0],
  };

  useEffect(() => {
    setLoading(true);
    axios.get(`/api/patient-portal/timeline?page=${page}&limit=20`, { headers })
      .then(({ data }) => {
        setEvents(data.data ?? []);
        setTotalPages(data.pagination?.totalPages ?? 1);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, page]);

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>Loading...</div>;

  return (
    <div>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', margin: '0 0 1.5rem' }}>
        🕐 Health Timeline
      </h2>

      {events.length === 0 ? (
        <div style={{
          background: '#fff', borderRadius: '12px', padding: '2rem',
          textAlign: 'center', color: '#94a3b8', fontSize: '14px',
          border: '1px solid #f1f5f9',
        }}>
          No health events yet
        </div>
      ) : (
        <div style={{ position: 'relative', paddingLeft: '28px' }}>
          {/* Timeline line */}
          <div style={{
            position: 'absolute', left: '10px', top: 0, bottom: 0,
            width: '2px', background: '#e2e8f0', borderRadius: '1px',
          }} />

          {events.map((e, i) => {
            const color = typeColors[e.event_type] || '#64748b';
            return (
              <div key={`${e.event_type}-${e.id}-${i}`} style={{ position: 'relative', marginBottom: '16px' }}>
                {/* Dot */}
                <div style={{
                  position: 'absolute', left: '-24px', top: '14px',
                  width: '14px', height: '14px', borderRadius: '50%',
                  background: color, border: '3px solid #fff', boxShadow: '0 0 0 2px ' + color + '40',
                }} />

                <div style={{
                  background: '#fff', borderRadius: '12px', padding: '14px',
                  border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  borderLeft: `3px solid ${color}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{
                        fontSize: '13px', fontWeight: 600, color, textTransform: 'uppercase',
                        letterSpacing: '0.3px', marginBottom: '4px',
                      }}>
                        {e.icon} {e.event_type.replace('_', ' ')}
                      </div>
                      <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '14px' }}>{e.title}</div>
                      {e.detail && (
                        <div style={{ fontSize: '13px', color: '#475569', marginTop: '2px' }}>{e.detail}</div>
                      )}
                      {e.description && (
                        <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px', fontStyle: 'italic' }}>
                          {e.description}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', whiteSpace: 'nowrap', marginLeft: '12px' }}>
                      {new Date(e.event_date).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
