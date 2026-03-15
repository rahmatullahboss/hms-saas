import { useState, useEffect } from 'react';
import { Wallet } from 'lucide-react';
import axios from 'axios';

export default function DepositsPage({ role }: { role?: string }) {
  
  const [deposits, setDeposits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/deposits').then(({ data: d }: any) => setDeposits(d.deposits ?? [])).catch(() => setDeposits([])).finally(() => setLoading(false), { headers: { Authorization: `Bearer ${localStorage.getItem('hms_token')}` } });
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-teal-500/20"><Wallet className="w-5 h-5 text-white" /></div>
        <div><h1 className="text-xl font-bold">Patient Deposits</h1><p className="text-sm text-[var(--color-text-muted)]">Manage advance payments</p></div>
      </div>
      <div className="card">
        <div className="p-4 border-b border-[var(--color-border)]"><h2 className="font-semibold">All Deposits</h2></div>
        {loading ? <div className="p-8 text-center text-[var(--color-text-muted)]">Loading...</div> :
        deposits.length === 0 ? <div className="p-8 text-center text-[var(--color-text-muted)]">No deposits found</div> :
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-[var(--color-border)] text-left">
          <th className="p-3">Patient</th><th className="p-3">Amount</th><th className="p-3">Type</th><th className="p-3">Date</th><th className="p-3">Status</th>
        </tr></thead><tbody>{deposits.map((d: any, i: number) => (
          <tr key={d.id ?? i} className="border-b border-[var(--color-border)] hover:bg-[var(--color-primary-light)]">
            <td className="p-3 font-medium">{d.patient_name}</td><td className="p-3">৳{d.amount}</td><td className="p-3 capitalize">{d.deposit_type ?? 'advance'}</td>
            <td className="p-3">{d.created_at?.split('T')[0]}</td><td className="p-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${d.status === 'refunded' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>{d.status ?? 'active'}</span></td>
          </tr>))}</tbody></table></div>}
      </div>
    </div>
  );
}
