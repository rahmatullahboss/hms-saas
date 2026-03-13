import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../hooks/useAuth';
import Pagination from '../../components/Pagination';

interface Bill {
  id: number;
  invoice_no: string;
  total: number;
  paid: number;
  due: number;
  discount: number;
  status: string;
  description: string;
  created_at: string;
}

export default function PatientBills() {
  const { token } = useAuth();
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    setLoading(true);
    const headers = {
      Authorization: `Bearer ${token}`,
      'X-Tenant-Subdomain': window.location.hostname.split('.')[0],
    };
    axios.get(`/api/patient-portal/bills?page=${page}&limit=20`, { headers })
      .then(({ data }) => {
        setBills(data.data ?? []);
        setTotalPages(data.pagination?.totalPages ?? 1);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token, page]);

  const totalBilled = bills.reduce((s, b) => s + b.total, 0);
  const totalPaid = bills.reduce((s, b) => s + b.paid, 0);
  const totalDue = bills.reduce((s, b) => s + b.due, 0);

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>Loading...</div>;

  return (
    <div>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', margin: '0 0 1rem' }}>💰 My Bills</h2>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '100px', background: '#f8fafc', padding: '12px', borderRadius: '10px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#94a3b8' }}>Total</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>৳ {totalBilled.toLocaleString()}</div>
        </div>
        <div style={{ flex: 1, minWidth: '100px', background: '#ecfdf5', padding: '12px', borderRadius: '10px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#94a3b8' }}>Paid</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#059669' }}>৳ {totalPaid.toLocaleString()}</div>
        </div>
        <div style={{ flex: 1, minWidth: '100px', background: totalDue > 0 ? '#fef2f2' : '#ecfdf5', padding: '12px', borderRadius: '10px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#94a3b8' }}>Due</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: totalDue > 0 ? '#dc2626' : '#059669' }}>৳ {totalDue.toLocaleString()}</div>
        </div>
      </div>

      {bills.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>No bills found</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {bills.map((bill) => (
            <div key={bill.id} style={{
              background: '#fff', borderRadius: '14px', padding: '14px 16px',
              border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '14px' }}>Invoice #{bill.invoice_no}</div>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>{new Date(bill.created_at).toLocaleDateString()}</div>
                </div>
                <span style={{
                  padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                  background: bill.due > 0 ? '#fef3c7' : '#dcfce7',
                  color: bill.due > 0 ? '#a16207' : '#15803d',
                }}>{bill.due > 0 ? 'Unpaid' : 'Paid'}</span>
              </div>

              {bill.description && <div style={{ fontSize: '13px', color: '#64748b', marginTop: '6px' }}>{bill.description}</div>}

              <div style={{ display: 'flex', gap: '1rem', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #f1f5f9', fontSize: '13px' }}>
                <div><span style={{ color: '#94a3b8' }}>Amount: </span><span style={{ fontWeight: 600, color: '#0f172a' }}>৳{bill.total.toLocaleString()}</span></div>
                {bill.discount > 0 && <div><span style={{ color: '#94a3b8' }}>Disc: </span><span style={{ fontWeight: 600, color: '#059669' }}>-৳{bill.discount.toLocaleString()}</span></div>}
                <div><span style={{ color: '#94a3b8' }}>Paid: </span><span style={{ fontWeight: 600, color: '#059669' }}>৳{bill.paid.toLocaleString()}</span></div>
                {bill.due > 0 && <div><span style={{ color: '#94a3b8' }}>Due: </span><span style={{ fontWeight: 600, color: '#dc2626' }}>৳{bill.due.toLocaleString()}</span></div>}
              </div>
            </div>
          ))}
        </div>
      )}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
