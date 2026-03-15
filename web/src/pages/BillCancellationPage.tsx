import { useState, useEffect } from 'react';
import { XCircle } from 'lucide-react';
import axios from 'axios';

export default function BillCancellationPage({ role: _role }: { role?: string }) {
  
  const [cancellations, setCancellations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/billing/cancellation', { headers: { Authorization: `Bearer ${localStorage.getItem('hms_token')}` } }).then(({ data: d }: any) => setCancellations(d.cancellations ?? [])).catch(() => setCancellations([])).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-rose-500 flex items-center justify-center shadow-lg shadow-red-500/20"><XCircle className="w-5 h-5 text-white" /></div>
        <div><h1 className="text-xl font-bold">Bill Cancellations</h1><p className="text-sm text-[var(--color-text-muted)]">Cancelled & voided bills</p></div>
      </div>
      <div className="card">
        <div className="p-4 border-b border-[var(--color-border)]"><h2 className="font-semibold">Cancellation Records</h2></div>
        {loading ? <div className="p-8 text-center text-[var(--color-text-muted)]">Loading...</div> :
        cancellations.length === 0 ? <div className="p-8 text-center text-[var(--color-text-muted)]">No cancellations</div> :
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-[var(--color-border)] text-left">
          <th className="p-3">Invoice</th><th className="p-3">Patient</th><th className="p-3">Amount</th><th className="p-3">Reason</th><th className="p-3">Date</th>
        </tr></thead><tbody>{cancellations.map((c: any, i: number) => (
          <tr key={c.id ?? i} className="border-b border-[var(--color-border)] hover:bg-[var(--color-primary-light)]">
            <td className="p-3 font-medium">{c.invoice_no ?? `INV-${c.bill_id}`}</td><td className="p-3">{c.patient_name ?? '—'}</td>
            <td className="p-3">৳{c.total_amount ?? c.amount}</td><td className="p-3">{c.cancel_reason ?? c.reason}</td><td className="p-3">{c.cancelled_at?.split('T')[0] ?? c.created_at?.split('T')[0]}</td>
          </tr>))}</tbody></table></div>}
      </div>
    </div>
  );
}
