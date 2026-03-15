import { useState, useEffect } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import axios from 'axios';

export default function BillingHandoverPage({ role }: { role?: string }) {
  
  const [handovers, setHandovers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/billing/handover').then(({ data: d }: any) => setHandovers(d.handovers ?? [])).catch(() => setHandovers([])).finally(() => setLoading(false), { headers: { Authorization: `Bearer ${localStorage.getItem('hms_token')}` } });
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-blue-500 flex items-center justify-center shadow-lg shadow-sky-500/20"><ArrowRightLeft className="w-5 h-5 text-white" /></div>
        <div><h1 className="text-xl font-bold">Billing Handover</h1><p className="text-sm text-[var(--color-text-muted)]">Shift handover records</p></div>
      </div>
      <div className="card">
        <div className="p-4 border-b border-[var(--color-border)]"><h2 className="font-semibold">Handover Records</h2></div>
        {loading ? <div className="p-8 text-center text-[var(--color-text-muted)]">Loading...</div> :
        handovers.length === 0 ? <div className="p-8 text-center text-[var(--color-text-muted)]">No handovers</div> :
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-[var(--color-border)] text-left">
          <th className="p-3">From</th><th className="p-3">To</th><th className="p-3">Amount</th><th className="p-3">Date</th><th className="p-3">Status</th>
        </tr></thead><tbody>{handovers.map((h: any, i: number) => (
          <tr key={h.id ?? i} className="border-b border-[var(--color-border)] hover:bg-[var(--color-primary-light)]">
            <td className="p-3">{h.from_user ?? '—'}</td><td className="p-3">{h.to_user ?? '—'}</td><td className="p-3">৳{h.total_amount ?? h.amount}</td>
            <td className="p-3">{h.handover_date ?? h.created_at?.split('T')[0]}</td><td className="p-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${h.status === 'verified' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{h.status ?? 'pending'}</span></td>
          </tr>))}</tbody></table></div>}
      </div>
    </div>
  );
}
