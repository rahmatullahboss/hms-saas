import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../hooks/useAuth';
import Pagination from '../../components/Pagination';

interface LabResult {
  id: number;
  order_no: string;
  created_at: string;
  status: string;
  test_name: string;
  result: string;
  result_numeric: number | null;
  abnormal_flag: string;
  sample_status: string;
  unit: string;
  normal_range: string;
  severity: string;
  explanation: string;
}

export default function PatientLabResults() {
  const { token } = useAuth();
  const [results, setResults] = useState<LabResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    setLoading(true);
    const headers = {
      Authorization: `Bearer ${token}`,
      'X-Tenant-Subdomain': window.location.hostname.split('.')[0],
    };
    axios.get(`/api/patient-portal/lab-results?page=${page}&limit=50`, { headers })
      .then(({ data }) => {
        setResults(data.data ?? []);
        setTotalPages(data.pagination?.totalPages ?? 1);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token, page]);

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>Loading...</div>;

  const grouped = results.reduce((acc, r) => {
    const key = `${r.order_no}||${r.created_at}`;
    if (!acc[key]) acc[key] = { order_no: r.order_no, created_at: r.created_at, status: r.status, items: [] };
    acc[key].items.push(r);
    return acc;
  }, {} as Record<string, { order_no: string; created_at: string; status: string; items: LabResult[] }>);

  const orders = Object.values(grouped);

  return (
    <div>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', margin: '0 0 1rem' }}>🧪 Lab Results</h2>

      {orders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>No lab results found</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {orders.map((order, oi) => (
            <div key={oi} style={{
              background: '#fff', borderRadius: '14px', padding: '16px',
              border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '14px' }}>#{order.order_no}</div>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>{new Date(order.created_at).toLocaleDateString()}</div>
                </div>
                <span style={{
                  padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                  background: order.status === 'completed' ? '#dcfce7' : '#fef9c3',
                  color: order.status === 'completed' ? '#15803d' : '#a16207',
                  textTransform: 'capitalize',
                }}>{order.status}</span>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: '#64748b', fontWeight: 500 }}>Test</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', color: '#64748b', fontWeight: 500 }}>Result</th>
                      <th style={{ textAlign: 'center', padding: '6px 8px', color: '#64748b', fontWeight: 500 }}>Unit</th>
                      <th style={{ textAlign: 'center', padding: '6px 8px', color: '#64748b', fontWeight: 500 }}>Normal</th>
                      <th style={{ textAlign: 'center', padding: '6px 8px', color: '#64748b', fontWeight: 500 }}>Flag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item, ii) => {
                      const isAbnormal = item.abnormal_flag && item.abnormal_flag !== 'normal';
                      return (
                        <tr key={ii} style={{ borderBottom: '1px solid #f1f5f9', background: isAbnormal ? '#fef2f2' : 'transparent' }}>
                          <td style={{ padding: '8px', fontWeight: 500, color: '#0f172a' }}>{item.test_name}</td>
                          <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600, color: isAbnormal ? '#dc2626' : '#059669' }}>
                            {item.result || item.result_numeric || '—'}
                          </td>
                          <td style={{ padding: '8px', textAlign: 'center', color: '#94a3b8' }}>{item.unit || '—'}</td>
                          <td style={{ padding: '8px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>{item.normal_range || '—'}</td>
                          <td style={{ padding: '8px', textAlign: 'center' }}>
                            {isAbnormal ? (
                              <span title={item.explanation} style={{ background: item.severity === 'critical' ? '#fca5a5' : '#fecaca', color: '#b91c1c', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: 'help' }}>
                                {item.severity === 'critical' ? '🚨' : '⚠'} {item.abnormal_flag}
                              </span>
                            ) : <span style={{ color: '#059669', fontSize: '13px' }}>✓</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
