import { useState, useEffect } from 'react';
import { useParams } from 'react-router';
import { Scissors, Calendar, Clock, CheckCircle } from 'lucide-react';
import axios from 'axios';

export default function OTDashboard({ role }: { role?: string }) {
  
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/ot/bookings', { headers: { Authorization: `Bearer ${localStorage.getItem('hms_token')}` } })
      
      .then(({ data: d }: any) => setBookings(d.bookings ?? []))
      .catch(() => setBookings([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Scissors className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Operation Theatre</h1>
            <p className="text-sm text-[var(--color-text-muted)]">OT scheduling & management</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Bookings', value: bookings.length, icon: Calendar, color: 'from-blue-500 to-cyan-500' },
          { label: 'Scheduled', value: bookings.filter((b: any) => b.status === 'scheduled').length, icon: Clock, color: 'from-amber-500 to-orange-500' },
          { label: 'Completed', value: bookings.filter((b: any) => b.status === 'completed').length, icon: CheckCircle, color: 'from-emerald-500 to-green-500' },
        ].map((s) => (
          <div key={s.label} className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${s.color} flex items-center justify-center`}><s.icon className="w-4 h-4 text-white" /></div>
              <span className="text-sm text-[var(--color-text-muted)]">{s.label}</span>
            </div>
            <p className="text-2xl font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="p-4 border-b border-[var(--color-border)]"><h2 className="font-semibold">OT Bookings</h2></div>
        {loading ? <div className="p-8 text-center text-[var(--color-text-muted)]">Loading...</div> :
        bookings.length === 0 ? <div className="p-8 text-center text-[var(--color-text-muted)]">No OT bookings</div> :
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[var(--color-border)] text-left">
              <th className="p-3">Patient</th><th className="p-3">Surgery</th><th className="p-3">Surgeon</th><th className="p-3">Date</th><th className="p-3">Status</th>
            </tr></thead>
            <tbody>{bookings.map((b: any, i: number) => (
              <tr key={b.id ?? i} className="border-b border-[var(--color-border)] hover:bg-[var(--color-primary-light)]">
                <td className="p-3 font-medium">{b.patient_name}</td>
                <td className="p-3">{b.surgery_name ?? b.procedure_name}</td>
                <td className="p-3">{b.surgeon_name}</td>
                <td className="p-3">{b.surgery_date}</td>
                <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  b.status === 'completed' ? 'bg-green-100 text-green-700' :
                  b.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                }`}>{b.status}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>}
      </div>
    </div>
  );
}
