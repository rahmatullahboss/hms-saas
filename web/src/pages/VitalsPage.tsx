import { useState, useEffect } from 'react';
import { Heart } from 'lucide-react';
import axios from 'axios';

export default function VitalsPage({ role }: { role?: string }) {
  
  const [vitals, setVitals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/vitals').then(({ data: d }: any) => setVitals(d.vitals ?? [])).catch(() => setVitals([])).finally(() => setLoading(false), { headers: { Authorization: `Bearer ${localStorage.getItem('hms_token')}` } });
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center shadow-lg shadow-pink-500/20"><Heart className="w-5 h-5 text-white" /></div>
        <div><h1 className="text-xl font-bold">Vitals</h1><p className="text-sm text-[var(--color-text-muted)]">Patient vital signs records</p></div>
      </div>
      <div className="card">
        <div className="p-4 border-b border-[var(--color-border)]"><h2 className="font-semibold">Recent Vitals</h2></div>
        {loading ? <div className="p-8 text-center text-[var(--color-text-muted)]">Loading...</div> :
        vitals.length === 0 ? <div className="p-8 text-center text-[var(--color-text-muted)]">No vitals recorded</div> :
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-[var(--color-border)] text-left">
          <th className="p-3">Patient</th><th className="p-3">BP</th><th className="p-3">Pulse</th><th className="p-3">Temp</th><th className="p-3">SpO2</th><th className="p-3">Date</th>
        </tr></thead><tbody>{vitals.map((v: any, i: number) => (
          <tr key={v.id ?? i} className="border-b border-[var(--color-border)] hover:bg-[var(--color-primary-light)]">
            <td className="p-3 font-medium">{v.patient_name ?? '—'}</td><td className="p-3">{v.blood_pressure ?? '—'}</td><td className="p-3">{v.pulse ?? '—'} bpm</td>
            <td className="p-3">{v.temperature ?? '—'}°F</td><td className="p-3">{v.spo2 ?? '—'}%</td><td className="p-3">{v.recorded_at?.split('T')[0] ?? v.created_at?.split('T')[0]}</td>
          </tr>))}</tbody></table></div>}
      </div>
    </div>
  );
}
