import { useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import DashboardLayout from '../../components/DashboardLayout';

const api = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

interface Vitals { id: number; recorded_at: string; sbp?: number; dbp?: number; pulse?: number; temperature?: number; spo2?: number; weight?: number; height?: number; bmi?: number; recorded_by_name?: string; }

const BMI_LABEL = (bmi?: number) => {
  if (!bmi) return null;
  if (bmi < 18.5) return { label: 'Underweight', color: 'text-blue-500' };
  if (bmi < 25)   return { label: 'Normal', color: 'text-green-600' };
  if (bmi < 30)   return { label: 'Overweight', color: 'text-yellow-600' };
  return { label: 'Obese', color: 'text-red-600' };
};

const isAbnormal = (key: string, val?: number) => {
  if (!val) return false;
  const ranges: Record<string, [number, number]> = { sbp: [90, 140], dbp: [60, 90], pulse: [60, 100], temperature: [36, 37.5], spo2: [95, 100] };
  if (!ranges[key]) return false;
  const [min, max] = ranges[key];
  return val < min || val > max;
};

export default function VitalsPage({ role = 'hospital_admin' }: { role?: string }) {
  const [patientSearch, setPatientSearch] = useState('');
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [vitals, setVitals] = useState<Vitals[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ sbp: '', dbp: '', pulse: '', temperature: '', spo2: '', weight: '', height: '', notes: '' });
  const [loading, setLoading] = useState(false);

  const searchPatients = async (q: string) => { setPatientSearch(q); if (q.length < 2) { setPatients([]); return; } try { const { data } = await axios.get(`/api/patients?search=${q}`, api()); setPatients(data.patients?.slice(0, 6) || []); } catch { } };

  const selectPatient = async (p: any) => {
    setPatients([]); setPatientSearch(p.name); setSelectedPatient(p);
    setLoading(true);
    try { const { data } = await axios.get(`/api/vitals/patient/${p.id}`, api()); setVitals(data.vitals || []); }
    catch { toast.error('Failed to load vitals'); }
    finally { setLoading(false); }
  };

  const bmi = form.weight && form.height ? (Number(form.weight) / Math.pow(Number(form.height) / 100, 2)).toFixed(1) : null;

  const handleSave = async () => {
    if (!selectedPatient) { toast.error('Select a patient'); return; }
    if (!form.sbp && !form.pulse && !form.temperature && !form.spo2) { toast.error('Enter at least one vital sign'); return; }
    try {
      await axios.post('/api/vitals', {
        patient_id: selectedPatient.id,
        sbp: form.sbp ? Number(form.sbp) : undefined, dbp: form.dbp ? Number(form.dbp) : undefined,
        pulse: form.pulse ? Number(form.pulse) : undefined, temperature: form.temperature ? Number(form.temperature) : undefined,
        spo2: form.spo2 ? Number(form.spo2) : undefined, weight: form.weight ? Number(form.weight) : undefined,
        height: form.height ? Number(form.height) : undefined, bmi: bmi ? Number(bmi) : undefined,
        notes: form.notes,
      }, api());
      toast.success('Vitals recorded');
      setShowForm(false);
      setForm({ sbp: '', dbp: '', pulse: '', temperature: '', spo2: '', weight: '', height: '', notes: '' });
      selectPatient(selectedPatient);
    } catch { toast.error('Failed to save vitals'); }
  };

  const latest = vitals[0];

  return (
    <DashboardLayout role={role}>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div><h1 className="text-2xl font-bold">Vitals</h1><p className="text-sm text-[var(--color-text-muted)] mt-0.5">Record and track patient vital signs</p></div>
        </div>

        {/* Patient search */}
        <div className="relative max-w-lg">
          <input className="input" placeholder="Search patient to view vitals…" value={patientSearch} onChange={e => searchPatients(e.target.value)} />
          {patients.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-10 card shadow-lg mt-1 overflow-hidden">
              {patients.map(p => <button key={p.id} onClick={() => selectPatient(p)} className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--color-bg-secondary)] border-b border-[var(--color-border-light)]">{p.name} <span className="text-xs text-[var(--color-text-muted)]">{p.patient_code}</span></button>)}
            </div>
          )}
        </div>

        {selectedPatient && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Vitals History — <span className="text-[var(--color-primary)]">{selectedPatient.name}</span></h2>
              <button onClick={() => setShowForm(true)} className="btn-primary text-sm px-4">+ Record Vitals</button>
            </div>

            {/* Latest vitals quick view */}
            {latest && (
              <div className="grid grid-cols-5 gap-3">
                {[
                  { key: 'sbp', label: 'BP Systolic', value: latest.sbp, unit: 'mmHg' },
                  { key: 'pulse', label: 'Pulse', value: latest.pulse, unit: 'bpm' },
                  { key: 'temperature', label: 'Temperature', value: latest.temperature, unit: '°C' },
                  { key: 'spo2', label: 'SpO₂', value: latest.spo2, unit: '%' },
                  { key: 'bmi', label: 'BMI', value: latest.bmi, unit: '' },
                ].map(({ key, label, value, unit }) => {
                  const abnormal = isAbnormal(key, value);
                  const bmiInfo = key === 'bmi' ? BMI_LABEL(value) : null;
                  return (
                    <div key={key} className={`card p-4 ${abnormal ? 'border-red-300 bg-red-50 dark:bg-red-900/20' : ''}`}>
                      <div className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">{label}</div>
                      <div className={`text-2xl font-bold mt-1 ${abnormal ? 'text-red-600' : bmiInfo?.color || 'text-[var(--color-text-primary)]'}`}>
                        {value ?? '—'}{value && unit ? <span className="text-sm font-normal ml-0.5">{unit}</span> : null}
                      </div>
                      {abnormal && <div className="text-xs text-red-500 mt-0.5">⚠ Abnormal</div>}
                      {bmiInfo && <div className={`text-xs mt-0.5 ${bmiInfo.color}`}>{bmiInfo.label}</div>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* History table */}
            <div className="card overflow-hidden">
              <table className="table text-sm">
                <thead><tr><th>Date & Time</th><th>BP</th><th>Pulse</th><th>Temp</th><th>SpO₂</th><th>Weight</th><th>BMI</th><th>By</th></tr></thead>
                <tbody>
                  {loading ? <tr><td colSpan={8} className="py-6 text-center text-[var(--color-text-muted)]">Loading…</td></tr>
                    : vitals.length === 0 ? <tr><td colSpan={8} className="py-6 text-center text-[var(--color-text-muted)]">No vitals recorded yet</td></tr>
                    : vitals.map(v => (
                      <tr key={v.id}>
                        <td className="text-xs">{new Date(v.recorded_at).toLocaleString()}</td>
                        <td className={isAbnormal('sbp', v.sbp) ? 'text-red-500 font-semibold' : ''}>{v.sbp && v.dbp ? `${v.sbp}/${v.dbp}` : v.sbp ?? '—'}</td>
                        <td className={isAbnormal('pulse', v.pulse) ? 'text-red-500 font-semibold' : ''}>{v.pulse ?? '—'}</td>
                        <td className={isAbnormal('temperature', v.temperature) ? 'text-red-500 font-semibold' : ''}>{v.temperature ? `${v.temperature}°C` : '—'}</td>
                        <td className={isAbnormal('spo2', v.spo2) ? 'text-red-500 font-semibold' : ''}>{v.spo2 ? `${v.spo2}%` : '—'}</td>
                        <td>{v.weight ? `${v.weight}kg` : '—'}</td>
                        <td>
                          {v.bmi ? (
                            <span className={BMI_LABEL(v.bmi)?.color || ''}>{v.bmi}</span>
                          ) : '—'}
                        </td>
                        <td className="text-xs text-[var(--color-text-muted)]">{v.recorded_by_name || '—'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-md">
            <h3 className="font-bold text-lg mb-1">Record Vitals</h3>
            <p className="text-sm text-[var(--color-text-muted)] mb-4">{selectedPatient?.name}</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">BP Systolic (mmHg)</label><input type="number" className="input" placeholder="e.g. 120" value={form.sbp} onChange={e => setForm({ ...form, sbp: e.target.value })} /></div>
              <div><label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">BP Diastolic (mmHg)</label><input type="number" className="input" placeholder="e.g. 80" value={form.dbp} onChange={e => setForm({ ...form, dbp: e.target.value })} /></div>
              <div><label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Pulse (bpm)</label><input type="number" className="input" placeholder="e.g. 72" value={form.pulse} onChange={e => setForm({ ...form, pulse: e.target.value })} /></div>
              <div><label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Temperature (°C)</label><input type="number" step="0.1" className="input" placeholder="e.g. 37.0" value={form.temperature} onChange={e => setForm({ ...form, temperature: e.target.value })} /></div>
              <div><label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">SpO₂ (%)</label><input type="number" min={1} max={100} className="input" placeholder="e.g. 98" value={form.spo2} onChange={e => setForm({ ...form, spo2: e.target.value })} /></div>
              <div></div>
              <div><label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Weight (kg)</label><input type="number" step="0.1" className="input" value={form.weight} onChange={e => setForm({ ...form, weight: e.target.value })} /></div>
              <div><label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Height (cm)</label><input type="number" className="input" value={form.height} onChange={e => setForm({ ...form, height: e.target.value })} /></div>
            </div>
            {bmi && (
              <div className={`mt-3 p-3 rounded-lg text-sm flex justify-between ${Number(bmi) >= 25 ? 'bg-yellow-50 dark:bg-yellow-900/20' : 'bg-green-50 dark:bg-green-900/20'}`}>
                <span>Calculated BMI</span>
                <span className={`font-bold ${BMI_LABEL(Number(bmi))?.color}`}>{bmi} — {BMI_LABEL(Number(bmi))?.label}</span>
              </div>
            )}
            <div className="mt-3"><label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Notes</label><input className="input" placeholder="Optional…" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            <div className="flex gap-3 mt-5"><button onClick={handleSave} className="btn-primary flex-1">Save Vitals</button><button onClick={() => setShowForm(false)} className="btn-secondary px-5">Cancel</button></div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
