import { useState, useEffect } from 'react';
import { useParams } from 'react-router';
import { Siren, Plus, Clock, AlertTriangle, CheckCircle, Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

export default function EmergencyDashboard({ role: _role }: { role?: string }) {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation('common');
  
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/emergency/dashboard', { headers: { Authorization: `Bearer ${localStorage.getItem('hms_token')}` } })
      
      .then(({ data: d }: any) => setCases(d.cases ?? d.patients ?? []))
      .catch(() => setCases([]))
      .finally(() => setLoading(false));
  }, []);

  const stats = {
    total: cases.length,
    critical: cases.filter((c: any) => c.triage_category === 'critical' || c.priority === 'critical').length,
    active: cases.filter((c: any) => c.status === 'treating' || c.status === 'admitted').length,
    discharged: cases.filter((c: any) => c.status === 'discharged').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center shadow-lg shadow-red-500/20">
            <Siren className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Emergency Department</h1>
            <p className="text-sm text-[var(--color-text-muted)]">Real-time ER monitoring</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Cases', value: stats.total, icon: Activity, color: 'from-blue-500 to-cyan-500' },
          { label: 'Critical', value: stats.critical, icon: AlertTriangle, color: 'from-red-500 to-pink-500' },
          { label: 'Active', value: stats.active, icon: Clock, color: 'from-amber-500 to-orange-500' },
          { label: 'Discharged', value: stats.discharged, icon: CheckCircle, color: 'from-emerald-500 to-green-500' },
        ].map((s) => (
          <div key={s.label} className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${s.color} flex items-center justify-center`}>
                <s.icon className="w-4 h-4 text-white" />
              </div>
              <span className="text-sm text-[var(--color-text-muted)]">{s.label}</span>
            </div>
            <p className="text-2xl font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="p-4 border-b border-[var(--color-border)]">
          <h2 className="font-semibold">Current ER Patients</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-[var(--color-text-muted)]">Loading...</div>
        ) : cases.length === 0 ? (
          <div className="p-8 text-center text-[var(--color-text-muted)]">No active ER cases</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-[var(--color-border)] text-left">
                <th className="p-3">Patient</th><th className="p-3">Triage</th><th className="p-3">Status</th><th className="p-3">Doctor</th><th className="p-3">Time</th>
              </tr></thead>
              <tbody>
                {cases.map((c: any, i: number) => (
                  <tr key={c.id ?? i} className="border-b border-[var(--color-border)] hover:bg-[var(--color-primary-light)]">
                    <td className="p-3 font-medium">{c.patient_name ?? c.name}</td>
                    <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      c.triage_category === 'critical' ? 'bg-red-100 text-red-700' :
                      c.triage_category === 'urgent' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                    }`}>{c.triage_category ?? 'standard'}</span></td>
                    <td className="p-3 capitalize">{c.status}</td>
                    <td className="p-3">{c.doctor_name ?? '—'}</td>
                    <td className="p-3">{c.arrival_time ?? c.created_at ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
