import { useState, useEffect } from 'react';
import { Handshake } from 'lucide-react';
import axios from 'axios';

export default function SettlementsPage({ role: _role }: { role?: string }) {
  
  const [settlements, setSettlements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/settlements', { headers: { Authorization: `Bearer ${localStorage.getItem('hms_token')}` } }).then(({ data: d }: any) => setSettlements(d.settlements ?? [])).catch(() => setSettlements([])).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20"><Handshake className="w-5 h-5 text-white" /></div>
        <div><h1 className="text-xl font-bold">Settlements</h1><p className="text-sm text-[var(--color-text-muted)]">Doctor & vendor settlements</p></div>
      </div>
      <div className="card">
        <div className="p-4 border-b border-[var(--color-border)]"><h2 className="font-semibold">All Settlements</h2></div>
        {loading ? <div className="p-8 text-center text-[var(--color-text-muted)]">Loading...</div> :
        settlements.length === 0 ? <div className="p-8 text-center text-[var(--color-text-muted)]">No settlements</div> :
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-[var(--color-border)] text-left">
          <th className="p-3">Party</th><th className="p-3">Amount</th><th className="p-3">Type</th><th className="p-3">Date</th><th className="p-3">Status</th>
        </tr></thead><tbody>{settlements.map((s: any, i: number) => (
          <tr key={s.id ?? i} className="border-b border-[var(--color-border)] hover:bg-[var(--color-primary-light)]">
            <td className="p-3 font-medium">{s.party_name ?? s.doctor_name ?? '—'}</td><td className="p-3">৳{s.amount}</td><td className="p-3 capitalize">{s.settlement_type ?? 'general'}</td>
            <td className="p-3">{s.settlement_date ?? s.created_at?.split('T')[0]}</td><td className="p-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{s.status ?? 'pending'}</span></td>
          </tr>))}</tbody></table></div>}
      </div>
    </div>
  );
}
