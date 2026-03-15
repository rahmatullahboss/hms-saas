import { useState, useEffect } from 'react';
import { ShieldAlert } from 'lucide-react';
import axios from 'axios';

export default function AllergiesPage({ role: _role }: { role?: string }) {
  
  const [allergies, setAllergies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/allergies', { headers: { Authorization: `Bearer ${localStorage.getItem('hms_token')}` } }).then(({ data: d }: any) => setAllergies(d.allergies ?? [])).catch(() => setAllergies([])).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20"><ShieldAlert className="w-5 h-5 text-white" /></div>
        <div><h1 className="text-xl font-bold">Allergies</h1><p className="text-sm text-[var(--color-text-muted)]">Patient allergy records</p></div>
      </div>
      <div className="card">
        <div className="p-4 border-b border-[var(--color-border)]"><h2 className="font-semibold">All Allergies</h2></div>
        {loading ? <div className="p-8 text-center text-[var(--color-text-muted)]">Loading...</div> :
        allergies.length === 0 ? <div className="p-8 text-center text-[var(--color-text-muted)]">No documented allergies</div> :
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-[var(--color-border)] text-left">
          <th className="p-3">Patient</th><th className="p-3">Allergen</th><th className="p-3">Type</th><th className="p-3">Severity</th><th className="p-3">Reaction</th>
        </tr></thead><tbody>{allergies.map((a: any, i: number) => (
          <tr key={a.id ?? i} className="border-b border-[var(--color-border)] hover:bg-[var(--color-primary-light)]">
            <td className="p-3 font-medium">{a.patient_name ?? '—'}</td><td className="p-3">{a.allergen}</td><td className="p-3 capitalize">{a.allergy_type ?? 'drug'}</td>
            <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${a.severity === 'severe' ? 'bg-red-100 text-red-700' : a.severity === 'moderate' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>{a.severity ?? 'mild'}</span></td>
            <td className="p-3">{a.reaction ?? '—'}</td>
          </tr>))}</tbody></table></div>}
      </div>
    </div>
  );
}
