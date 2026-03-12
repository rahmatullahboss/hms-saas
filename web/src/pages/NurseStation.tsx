import { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router';
import {
  Stethoscope, Users, HeartPulse, Thermometer, Activity,
  ChevronRight, RefreshCw, AlertCircle, CheckCircle
} from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import DashboardLayout from '../components/DashboardLayout';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PatientWithVitals {
  admission_id: number;
  admission_no: string;
  patient_id: number;
  patient_name: string;
  patient_code: string;
  ward_name?: string;
  bed_number?: string;
  doctor_name?: string;
  provisional_diagnosis?: string;
  admission_status: string;
  latestVitals: {
    systolic?: number;
    diastolic?: number;
    temperature?: number;
    heart_rate?: number;
    spo2?: number;
    recorded_at: string;
  } | null;
}

interface VitalLog {
  id: number;
  patient_name: string;
  systolic?: number;
  diastolic?: number;
  temperature?: number;
  heart_rate?: number;
  spo2?: number;
  recorded_by: string;
  recorded_at: string;
}

interface Stats {
  activePatients: number;
  pendingVitals: number;
  roundsCompleted: number;
  totalRounds: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

function vitalStatus(v: PatientWithVitals['latestVitals']): { label: string; color: string } {
  if (!v) return { label: 'Pending', color: 'text-amber-600' };
  if (v.spo2 && v.spo2 < 92) return { label: 'Critical', color: 'text-red-600' };
  if (v.heart_rate && (v.heart_rate > 120 || v.heart_rate < 50)) return { label: 'Warning', color: 'text-amber-600' };
  if (v.systolic && (v.systolic > 160 || v.systolic < 80)) return { label: 'Warning', color: 'text-amber-600' };
  if (v.temperature && (v.temperature > 101 || v.temperature < 96)) return { label: 'Warning', color: 'text-amber-600' };
  return { label: 'Normal', color: 'text-emerald-600' };
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Demo data ───────────────────────────────────────────────────────────────

const DEMO_PATIENTS: PatientWithVitals[] = [
  { admission_id: 1, admission_no: 'ADM-00001', patient_id: 1, patient_name: 'Mohammad Karim', patient_code: 'P-00001', ward_name: 'Ward A', bed_number: 'A-1', doctor_name: 'Dr. Rahman', provisional_diagnosis: 'Acute appendicitis', admission_status: 'admitted', latestVitals: { systolic: 125, diastolic: 82, temperature: 99.1, heart_rate: 78, spo2: 97, recorded_at: new Date(Date.now() - 3600000).toISOString() } },
  { admission_id: 2, admission_no: 'ADM-00002', patient_id: 2, patient_name: 'Fatima Begum', patient_code: 'P-00002', ward_name: 'ICU', bed_number: 'ICU-1', doctor_name: 'Dr. Hossain', provisional_diagnosis: 'Severe pneumonia', admission_status: 'critical', latestVitals: { systolic: 95, diastolic: 60, temperature: 102.4, heart_rate: 110, spo2: 89, recorded_at: new Date(Date.now() - 1800000).toISOString() } },
  { admission_id: 3, admission_no: 'ADM-00004', patient_id: 4, patient_name: 'Rahim Uddin', patient_code: 'P-00004', ward_name: 'Ward B', bed_number: 'B-1', doctor_name: 'Dr. Akter', provisional_diagnosis: 'Fracture repair', admission_status: 'admitted', latestVitals: null },
  { admission_id: 4, admission_no: 'ADM-00005', patient_id: 5, patient_name: 'Sultana Khatun', patient_code: 'P-00005', ward_name: 'Ward A', bed_number: 'A-3', doctor_name: 'Dr. Rahman', provisional_diagnosis: 'Post-op monitoring', admission_status: 'admitted', latestVitals: { systolic: 118, diastolic: 76, temperature: 98.6, heart_rate: 72, spo2: 99, recorded_at: new Date(Date.now() - 7200000).toISOString() } },
];

const DEMO_VITALS_LOG: VitalLog[] = [
  { id: 1, patient_name: 'Fatima Begum', systolic: 95, diastolic: 60, temperature: 102.4, heart_rate: 110, spo2: 89, recorded_by: 'Nurse Rina', recorded_at: new Date(Date.now() - 1800000).toISOString() },
  { id: 2, patient_name: 'Mohammad Karim', systolic: 125, diastolic: 82, temperature: 99.1, heart_rate: 78, spo2: 97, recorded_by: 'Nurse Rina', recorded_at: new Date(Date.now() - 3600000).toISOString() },
  { id: 3, patient_name: 'Sultana Khatun', systolic: 118, diastolic: 76, temperature: 98.6, heart_rate: 72, spo2: 99, recorded_by: 'Nurse Afia', recorded_at: new Date(Date.now() - 7200000).toISOString() },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function NurseStation({ role = 'hospital_admin' }: { role?: string }) {
  const { slug = '' } = useParams<{ slug: string }>();
  const basePath = `/h/${slug}`;

  const [patients, setPatients] = useState<PatientWithVitals[]>([]);
  const [vitalsLog, setVitalsLog] = useState<VitalLog[]>([]);
  const [stats, setStats] = useState<Stats>({ activePatients: 0, pendingVitals: 0, roundsCompleted: 0, totalRounds: 0 });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [vitalsForm, setVitalsForm] = useState({
    patient_id: 0,
    systolic: '',
    diastolic: '',
    temperature: '',
    heart_rate: '',
    spo2: '',
    respiratory_rate: '',
    weight: '',
    notes: '',
  });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, logRes] = await Promise.all([
        axios.get('/api/nurse-station/dashboard', { headers: authHeaders() }),
        axios.get('/api/nurse-station/vitals?limit=10', { headers: authHeaders() }),
      ]);
      setPatients(dashRes.data.patients ?? []);
      setStats(dashRes.data.stats ?? { activePatients: 0, pendingVitals: 0, roundsCompleted: 0, totalRounds: 0 });
      setVitalsLog(logRes.data.vitals ?? []);
    } catch {
      setPatients(DEMO_PATIENTS);
      setStats({ activePatients: 4, pendingVitals: 1, roundsCompleted: 3, totalRounds: 4 });
      setVitalsLog(DEMO_VITALS_LOG);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleRecordVitals = async () => {
    if (!vitalsForm.patient_id) { toast.error('Select a patient'); return; }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { patient_id: vitalsForm.patient_id };
      if (vitalsForm.systolic) body.systolic = parseInt(vitalsForm.systolic);
      if (vitalsForm.diastolic) body.diastolic = parseInt(vitalsForm.diastolic);
      if (vitalsForm.temperature) body.temperature = parseFloat(vitalsForm.temperature);
      if (vitalsForm.heart_rate) body.heart_rate = parseInt(vitalsForm.heart_rate);
      if (vitalsForm.spo2) body.spo2 = parseInt(vitalsForm.spo2);
      if (vitalsForm.respiratory_rate) body.respiratory_rate = parseInt(vitalsForm.respiratory_rate);
      if (vitalsForm.weight) body.weight = parseFloat(vitalsForm.weight);
      if (vitalsForm.notes) body.notes = vitalsForm.notes;

      await axios.post('/api/nurse-station/vitals', body, { headers: authHeaders() });
      toast.success('Vitals recorded');
      setVitalsForm({ patient_id: 0, systolic: '', diastolic: '', temperature: '', heart_rate: '', spo2: '', respiratory_rate: '', weight: '', notes: '' });
      fetchAll();
    } catch {
      toast.error('Failed to record vitals');
    } finally {
      setSubmitting(false);
    }
  };

  const kpis = [
    { label: 'Active Patients', value: stats.activePatients, icon: <Users className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50' },
    { label: 'Pending Vitals', value: stats.pendingVitals, icon: <AlertCircle className="w-5 h-5 text-amber-500" />, bg: 'bg-amber-50' },
    { label: 'Medications Due', value: 0, icon: <Activity className="w-5 h-5 text-red-500" />, bg: 'bg-red-50' },
    { label: 'Rounds', value: `${stats.roundsCompleted}/${stats.totalRounds}`, icon: <CheckCircle className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50' },
  ];

  return (
    <DashboardLayout role={role}>
      <div className="space-y-5">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs text-[var(--color-text-muted)] flex items-center gap-1 mb-1">
              <Link to={`${basePath}/dashboard`} className="hover:underline">Dashboard</Link>
              <ChevronRight className="w-3 h-3" />
              <span className="text-[var(--color-text)] font-medium">Nurse Station</span>
            </div>
            <h1 className="text-2xl font-bold text-[var(--color-text)] flex items-center gap-2">
              <Stethoscope className="w-6 h-6" /> Nurse Station
            </h1>
          </div>
          <button onClick={fetchAll} className="btn btn-outline text-sm p-2" aria-label="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map(k => (
            <div key={k.label} className="card p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${k.bg}`}>{k.icon}</div>
              <div>
                <p className="text-2xl font-bold text-[var(--color-text)]">{k.value}</p>
                <p className="text-xs text-[var(--color-text-muted)]">{k.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

          {/* Left: Inpatient List */}
          <div className="lg:col-span-3 space-y-3">
            <h2 className="text-sm font-semibold text-[var(--color-text)]">Inpatients</h2>
            {loading ? (
              <div className="card p-8 text-center text-[var(--color-text-muted)]">Loading...</div>
            ) : patients.length === 0 ? (
              <div className="card p-8 text-center text-[var(--color-text-muted)]">No active inpatients</div>
            ) : (
              patients.map(p => {
                const vs = vitalStatus(p.latestVitals);
                return (
                  <div key={p.admission_id} className={`card p-4 border-l-4 ${
                    p.admission_status === 'critical' ? 'border-l-red-500' : 'border-l-[var(--color-primary)]'
                  }`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Link to={`${basePath}/patients/${p.patient_id}`}
                            className="font-semibold text-[var(--color-text)] hover:text-[var(--color-primary)]">
                            {p.patient_name}
                          </Link>
                          {p.admission_status === 'critical' && (
                            <span className="text-[10px] bg-red-100 text-red-700 rounded-full px-2 py-0.5 font-medium">CRITICAL</span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--color-text-muted)]">
                          {p.ward_name && p.bed_number ? `${p.ward_name} — ${p.bed_number}` : ''} · {p.doctor_name || 'No doctor'} · {p.provisional_diagnosis || ''}
                        </p>
                      </div>
                      <span className={`text-xs font-medium ${vs.color}`}>{vs.label}</span>
                    </div>

                    {/* Vitals summary */}
                    {p.latestVitals ? (
                      <div className="mt-3 flex flex-wrap gap-4 text-xs">
                        <span className="flex items-center gap-1">
                          <HeartPulse className="w-3.5 h-3.5 text-red-400" />
                          {p.latestVitals.systolic}/{p.latestVitals.diastolic} mmHg
                        </span>
                        <span className="flex items-center gap-1">
                          <Thermometer className="w-3.5 h-3.5 text-amber-400" />
                          {p.latestVitals.temperature}°F
                        </span>
                        <span className="flex items-center gap-1">
                          <Activity className="w-3.5 h-3.5 text-blue-400" />
                          HR {p.latestVitals.heart_rate}
                        </span>
                        <span className="flex items-center gap-1">SpO₂ {p.latestVitals.spo2}%</span>
                        <span className="text-[var(--color-text-muted)] ml-auto">{timeAgo(p.latestVitals.recorded_at)}</span>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-amber-600 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" /> No vitals recorded
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Right: Record Vitals */}
          <div className="lg:col-span-2">
            <div className="card p-5 sticky top-4">
              <h2 className="text-sm font-semibold text-[var(--color-text)] mb-4 flex items-center gap-2">
                <HeartPulse className="w-4 h-4 text-[var(--color-primary)]" /> Record Vitals
              </h2>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-[var(--color-text)] mb-1 block">Patient *</label>
                  <select value={vitalsForm.patient_id}
                    onChange={e => setVitalsForm(f => ({ ...f, patient_id: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm">
                    <option value={0}>Select patient</option>
                    {patients.map(p => (
                      <option key={p.patient_id} value={p.patient_id}>
                        {p.patient_name} — {p.bed_number || 'No bed'}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-[var(--color-text)] mb-1 block">Systolic</label>
                    <input type="number" value={vitalsForm.systolic}
                      onChange={e => setVitalsForm(f => ({ ...f, systolic: e.target.value }))}
                      placeholder="120" className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[var(--color-text)] mb-1 block">Diastolic</label>
                    <input type="number" value={vitalsForm.diastolic}
                      onChange={e => setVitalsForm(f => ({ ...f, diastolic: e.target.value }))}
                      placeholder="80" className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-[var(--color-text)] mb-1 block">Temp (°F)</label>
                    <input type="number" step="0.1" value={vitalsForm.temperature}
                      onChange={e => setVitalsForm(f => ({ ...f, temperature: e.target.value }))}
                      placeholder="98.6" className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[var(--color-text)] mb-1 block">Heart Rate</label>
                    <input type="number" value={vitalsForm.heart_rate}
                      onChange={e => setVitalsForm(f => ({ ...f, heart_rate: e.target.value }))}
                      placeholder="72" className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-[var(--color-text)] mb-1 block">SpO₂ (%)</label>
                    <input type="number" value={vitalsForm.spo2}
                      onChange={e => setVitalsForm(f => ({ ...f, spo2: e.target.value }))}
                      placeholder="98" className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[var(--color-text)] mb-1 block">Resp. Rate</label>
                    <input type="number" value={vitalsForm.respiratory_rate}
                      onChange={e => setVitalsForm(f => ({ ...f, respiratory_rate: e.target.value }))}
                      placeholder="18" className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm" />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-[var(--color-text)] mb-1 block">Weight (kg)</label>
                  <input type="number" step="0.1" value={vitalsForm.weight}
                    onChange={e => setVitalsForm(f => ({ ...f, weight: e.target.value }))}
                    placeholder="65" className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm" />
                </div>

                <div>
                  <label className="text-xs font-medium text-[var(--color-text)] mb-1 block">Notes</label>
                  <textarea value={vitalsForm.notes}
                    onChange={e => setVitalsForm(f => ({ ...f, notes: e.target.value }))}
                    rows={2} placeholder="Additional observations..."
                    className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm resize-none" />
                </div>

                <button onClick={handleRecordVitals} disabled={submitting || !vitalsForm.patient_id}
                  className="btn btn-primary text-sm w-full">
                  {submitting ? 'Recording...' : 'Submit Recording'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Vitals Log */}
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border)]">
            <h2 className="text-sm font-semibold text-[var(--color-text)]">Recent Vitals Log</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-bg)]">
                <tr className="text-xs text-[var(--color-text-muted)] uppercase">
                  <th className="text-left px-4 py-2">Time</th>
                  <th className="text-left px-4 py-2">Patient</th>
                  <th className="text-center px-4 py-2">BP</th>
                  <th className="text-center px-4 py-2">Temp</th>
                  <th className="text-center px-4 py-2">HR</th>
                  <th className="text-center px-4 py-2">SpO₂</th>
                  <th className="text-left px-4 py-2">Nurse</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {vitalsLog.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-6 text-center text-[var(--color-text-muted)]">No vitals recorded</td></tr>
                ) : (
                  vitalsLog.map(v => (
                    <tr key={v.id} className="hover:bg-[var(--color-bg)]">
                      <td className="px-4 py-2 text-xs text-[var(--color-text-muted)]">{timeAgo(v.recorded_at)}</td>
                      <td className="px-4 py-2 font-medium">{v.patient_name}</td>
                      <td className="px-4 py-2 text-center">{v.systolic ?? '-'}/{v.diastolic ?? '-'}</td>
                      <td className="px-4 py-2 text-center">{v.temperature ?? '-'}°F</td>
                      <td className="px-4 py-2 text-center">{v.heart_rate ?? '-'}</td>
                      <td className="px-4 py-2 text-center">{v.spo2 ?? '-'}%</td>
                      <td className="px-4 py-2 text-[var(--color-text-muted)]">{v.recorded_by}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}
