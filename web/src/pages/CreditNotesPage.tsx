import { useState, useEffect } from 'react';
import { FileText } from 'lucide-react';
import axios from 'axios';

export default function CreditNotesPage({ role: _role }: { role?: string }) {
  
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/credit-notes', { headers: { Authorization: `Bearer ${localStorage.getItem('hms_token')}` } }).then(({ data: d }: any) => setNotes(d.creditNotes ?? d.credit_notes ?? [])).catch(() => setNotes([])).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-pink-500 flex items-center justify-center shadow-lg shadow-rose-500/20"><FileText className="w-5 h-5 text-white" /></div>
        <div><h1 className="text-xl font-bold">Credit Notes</h1><p className="text-sm text-[var(--color-text-muted)]">Manage refunds & adjustments</p></div>
      </div>
      <div className="card">
        <div className="p-4 border-b border-[var(--color-border)]"><h2 className="font-semibold">All Credit Notes</h2></div>
        {loading ? <div className="p-8 text-center text-[var(--color-text-muted)]">Loading...</div> :
        notes.length === 0 ? <div className="p-8 text-center text-[var(--color-text-muted)]">No credit notes</div> :
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-[var(--color-border)] text-left">
          <th className="p-3">CN #</th><th className="p-3">Patient</th><th className="p-3">Amount</th><th className="p-3">Reason</th><th className="p-3">Date</th>
        </tr></thead><tbody>{notes.map((n: any, i: number) => (
          <tr key={n.id ?? i} className="border-b border-[var(--color-border)] hover:bg-[var(--color-primary-light)]">
            <td className="p-3 font-medium">{n.credit_note_no ?? `CN-${n.id}`}</td><td className="p-3">{n.patient_name}</td><td className="p-3">৳{n.amount}</td>
            <td className="p-3">{n.reason ?? '—'}</td><td className="p-3">{n.created_at?.split('T')[0]}</td>
          </tr>))}</tbody></table></div>}
      </div>
    </div>
  );
}
