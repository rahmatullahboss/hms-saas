import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import toast from 'react-hot-toast';
import DashboardLayout from '../components/DashboardLayout';
import {
  Activity, Calendar, Pill, FlaskConical, HeartPulse,
  Receipt, Video, AlertCircle, CheckCircle2, Clock,
  Plus, RefreshCw, ExternalLink, ChevronRight,
  TrendingUp, User
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('hms_token')}` };
}
function fmt(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-BD', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Tab = 'overview' | 'appointments' | 'prescriptions' | 'labs' | 'vitals' | 'bills' | 'telemedicine';

interface Summary {
  patient: { name: string; patient_code: string; gender?: string; date_of_birth?: string };
  stats: { total_visits: number; active_prescriptions: number; pending_bills: number; upcoming_appointments: number };
  recent_vitals?: Record<string, string | number>;
}

interface Appointment { id: number; appointment_date: string; appointment_time?: string; reason?: string; status: string; doctor_name?: string; }
interface Prescription { id: number; rx_no: string; created_at: string; status: string; diagnosis?: string; doctor_name?: string; delivery_status?: string; }
interface LabResult { id: number; test_name: string; ordered_date: string; result_value?: string; status: string; }
interface VitalEntry { id: number; recorded_at: string; bp?: string; temperature?: string; weight?: string; spo2?: string; pulse?: string; source?: string; }
interface Bill { id: number; invoice_no: string; amount: number; status: string; created_at: string; }
interface TelemedicineSession { id: number; scheduled_at: string; status: string; doctor_name?: string; room_url?: string; }

// ─── Component ────────────────────────────────────────────────────────────────
export default function PatientPortal() {
  const [tab, setTab] = useState<Tab>('overview');
  const role = localStorage.getItem('hms_role') ?? 'patient';
  const qc = useQueryClient();
  const { t } = useTranslation(['patients', 'common']);

  // Appointment form
  const [apptDate,   setApptDate]   = useState('');
  const [apptReason, setApptReason] = useState('');
  const [showApptForm, setShowApptForm] = useState(false);

  // Vitals form
  const [vBp,   setVBp]   = useState('');
  const [vTemp, setVTemp] = useState('');
  const [vWt,   setVWt]   = useState('');
  const [vSpo2, setVSpo2] = useState('');
  const [vPulse, setVPulse] = useState('');
  const [showVitalsForm, setShowVitalsForm] = useState(false);

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: summary, isLoading: sumLoading } = useQuery<Summary>({
    queryKey: ['portal-summary'],
    queryFn: () => axios.get('/api/portal/summary', { headers: authHeaders() }).then(r => r.data),
  });

  const { data: appointments = [] } = useQuery<Appointment[]>({
    queryKey: ['portal-appointments'],
    enabled: tab === 'appointments' || tab === 'overview',
    queryFn: () => axios.get('/api/portal/appointments', { headers: authHeaders() }).then(r => r.data.appointments ?? []),
  });

  const { data: prescriptions = [] } = useQuery<Prescription[]>({
    queryKey: ['portal-prescriptions'],
    enabled: tab === 'prescriptions',
    queryFn: () => axios.get('/api/portal/prescriptions', { headers: authHeaders() }).then(r => r.data.prescriptions ?? []),
  });

  const { data: labs = [] } = useQuery<LabResult[]>({
    queryKey: ['portal-labs'],
    enabled: tab === 'labs',
    queryFn: () => axios.get('/api/portal/lab-results', { headers: authHeaders() }).then(r => r.data.results ?? []),
  });

  const { data: vitals = [] } = useQuery<VitalEntry[]>({
    queryKey: ['portal-vitals'],
    enabled: tab === 'vitals',
    queryFn: () => axios.get('/api/portal/vitals', { headers: authHeaders() }).then(r => r.data.vitals ?? []),
  });

  const { data: bills = [] } = useQuery<Bill[]>({
    queryKey: ['portal-bills'],
    enabled: tab === 'bills',
    queryFn: () => axios.get('/api/portal/bills', { headers: authHeaders() }).then(r => r.data.bills ?? []),
  });

  const { data: sessions = [] } = useQuery<TelemedicineSession[]>({
    queryKey: ['portal-telemedicine'],
    enabled: tab === 'telemedicine',
    queryFn: () => axios.get('/api/portal/telemedicine', { headers: authHeaders() }).then(r => r.data.sessions ?? []),
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const scheduleAppt = useMutation({
    mutationFn: () => axios.post('/api/portal/appointments', { date: apptDate, reason: apptReason }, { headers: authHeaders() }),
    onSuccess: () => {
      toast.success('Appointment requested!');
      setShowApptForm(false); setApptDate(''); setApptReason('');
      qc.invalidateQueries({ queryKey: ['portal-appointments'] });
    },
    onError: () => toast.error('Failed to schedule appointment'),
  });

  const recordVitals = useMutation({
    mutationFn: () => axios.post('/api/portal/vitals',
      { bp: vBp, temperature: vTemp, weight: vWt, spo2: vSpo2, pulse: vPulse },
      { headers: authHeaders() }),
    onSuccess: () => {
      toast.success('Vitals recorded!');
      setShowVitalsForm(false); setVBp(''); setVTemp(''); setVWt(''); setVSpo2(''); setVPulse('');
      qc.invalidateQueries({ queryKey: ['portal-vitals'] });
      qc.invalidateQueries({ queryKey: ['portal-summary'] });
    },
    onError: () => toast.error('Failed to record vitals'),
  });

  // ── Tabs config ───────────────────────────────────────────────────────────
  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview',      label: 'Overview',      icon: <Activity className="w-4 h-4" /> },
    { id: 'appointments',  label: 'Appointments',  icon: <Calendar className="w-4 h-4" /> },
    { id: 'prescriptions', label: 'Prescriptions', icon: <Pill className="w-4 h-4" /> },
    { id: 'labs',          label: 'Lab Results',   icon: <FlaskConical className="w-4 h-4" /> },
    { id: 'vitals',        label: 'Vitals',        icon: <HeartPulse className="w-4 h-4" /> },
    { id: 'bills',         label: 'Bills',         icon: <Receipt className="w-4 h-4" /> },
    { id: 'telemedicine',  label: 'Telemedicine',  icon: <Video className="w-4 h-4" /> },
  ];

  if (sumLoading) return (
    <DashboardLayout role={role}>
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-[var(--color-primary)]" />
      </div>
    </DashboardLayout>
  );

  const s = summary?.stats;
  const p = summary?.patient;

  return (
    <DashboardLayout role={role}>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* ─── Patient header ─────────────────────────────────────────── */}
        <div className="card p-5 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center text-2xl font-bold">
            {p?.name?.[0] ?? <User className="w-7 h-7" />}
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text)]">{p?.name ?? 'My Health Portal'}</h1>
            <div className="text-sm text-[var(--color-text-muted)] flex gap-3 mt-0.5">
              <span>{p?.patient_code}</span>
              {p?.gender && <span className="capitalize">{p.gender}</span>}
            </div>
          </div>
        </div>

        {/* ─── Stat cards ─────────────────────────────────────────────── */}
        {s && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total Visits',      value: s.total_visits,           icon: <Activity className="w-5 h-5 text-blue-500" />,    color: 'blue' },
              { label: 'Active Rx',         value: s.active_prescriptions,   icon: <Pill className="w-5 h-5 text-green-500" />,       color: 'green' },
              { label: 'Upcoming Appts',    value: s.upcoming_appointments,  icon: <Calendar className="w-5 h-5 text-purple-500" />,  color: 'purple' },
              { label: 'Pending Bills',     value: s.pending_bills,          icon: <Receipt className="w-5 h-5 text-orange-500" />,   color: 'orange' },
            ].map(c => (
              <div key={c.label} className="card p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl bg-${c.color}-50 flex items-center justify-center`}>
                  {c.icon}
                </div>
                <div>
                  <div className="text-2xl font-bold text-[var(--color-text)]">{c.value}</div>
                  <div className="text-xs text-[var(--color-text-muted)]">{c.label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── Tabs ───────────────────────────────────────────────────── */}
        <div className="border-b border-[var(--color-border)] overflow-x-auto">
          <div className="flex gap-1 min-w-max pb-0">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                  tab === t.id
                    ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                    : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                }`}
              >
                {t.icon}{t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ─── Tab Content ────────────────────────────────────────────── */}
        <div>

          {/* OVERVIEW */}
          {tab === 'overview' && (
            <div className="space-y-4">
              {/* Latest vitals */}
              {summary?.recent_vitals && Object.keys(summary.recent_vitals).length > 0 && (
                <div className="card p-4">
                  <h2 className="font-semibold text-[var(--color-text)] mb-3 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-[var(--color-primary)]" /> Recent Vitals
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {Object.entries(summary.recent_vitals).map(([k, v]) => (
                      <div key={k} className="bg-[var(--color-bg)] rounded-lg p-3">
                        <div className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">{k}</div>
                        <div className="text-lg font-semibold text-[var(--color-text)]">{String(v)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Upcoming appointments */}
              <div className="card p-4">
                <h2 className="font-semibold text-[var(--color-text)] mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[var(--color-primary)]" /> Upcoming Appointments
                </h2>
                {appointments.filter(a => a.status !== 'cancelled').slice(0, 3).length === 0 ? (
                  <p className="text-sm text-[var(--color-text-muted)]">No upcoming appointments</p>
                ) : (
                  <div className="space-y-2">
                    {appointments.filter(a => a.status !== 'cancelled').slice(0, 3).map(appt => (
                      <div key={appt.id} className="flex items-center gap-3 py-2 border-b border-[var(--color-border)] last:border-0">
                        <Calendar className="w-4 h-4 text-purple-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-[var(--color-text)]">{appt.reason || 'General Visit'}</div>
                          <div className="text-xs text-[var(--color-text-muted)]">{fmt(appt.appointment_date)} {appt.appointment_time ?? ''}</div>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          appt.status === 'scheduled' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                        }`}>{appt.status}</span>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={() => setTab('appointments')} className="mt-3 text-sm text-[var(--color-primary)] flex items-center gap-1 hover:underline">
                  View all <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}

          {/* APPOINTMENTS */}
          {tab === 'appointments' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button onClick={() => setShowApptForm(v => !v)} className="btn-primary flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Request Appointment
                </button>
              </div>

              {showApptForm && (
                <div className="card p-4 border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5 space-y-3">
                  <h3 className="font-semibold text-sm text-[var(--color-text)]">Schedule New Appointment</h3>
                  <input type="date" value={apptDate} onChange={e => setApptDate(e.target.value)} className="input w-full text-sm" />
                  <input placeholder="Reason for visit" value={apptReason} onChange={e => setApptReason(e.target.value)} className="input w-full text-sm" />
                  <div className="flex gap-2">
                    <button onClick={() => scheduleAppt.mutate()} disabled={scheduleAppt.isPending || !apptDate}
                      className="btn-primary flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" /> {scheduleAppt.isPending ? 'Saving…' : 'Request'}
                    </button>
                    <button onClick={() => setShowApptForm(false)} className="btn border border-[var(--color-border)] text-sm">Cancel</button>
                  </div>
                </div>
              )}

              {appointments.length === 0 ? (
                <div className="text-center py-12 text-[var(--color-text-muted)]">
                  <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No appointments found
                </div>
              ) : (
                <div className="card divide-y divide-[var(--color-border)]">
                  {appointments.map(appt => (
                    <div key={appt.id} className="flex items-center gap-3 p-4">
                      <Calendar className="w-5 h-5 text-purple-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-[var(--color-text)] text-sm">{appt.reason || 'General Visit'}</div>
                        <div className="text-xs text-[var(--color-text-muted)]">{fmt(appt.appointment_date)} {appt.appointment_time ?? ''}{appt.doctor_name ? ` · Dr. ${appt.doctor_name}` : ''}</div>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        appt.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
                        appt.status === 'completed' ? 'bg-green-100 text-green-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>{appt.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* PRESCRIPTIONS */}
          {tab === 'prescriptions' && (
            <div>
              {prescriptions.length === 0 ? (
                <div className="text-center py-12 text-[var(--color-text-muted)]">
                  <Pill className="w-8 h-8 mx-auto mb-2 opacity-40" />No prescriptions found
                </div>
              ) : (
                <div className="card divide-y divide-[var(--color-border)]">
                  {prescriptions.map(rx => (
                    <div key={rx.id} className="flex items-center gap-3 p-4">
                      <Pill className="w-5 h-5 text-green-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-[var(--color-text)]">{rx.rx_no}</div>
                        <div className="text-xs text-[var(--color-text-muted)]">{fmt(rx.created_at)}{rx.diagnosis ? ` · ${rx.diagnosis}` : ''}{rx.doctor_name ? ` · Dr. ${rx.doctor_name}` : ''}</div>
                        {rx.delivery_status && (
                          <span className="inline-block mt-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                            Delivery: {rx.delivery_status}
                          </span>
                        )}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        rx.status === 'final' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      }`}>{rx.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* LAB RESULTS */}
          {tab === 'labs' && (
            <div>
              {labs.length === 0 ? (
                <div className="text-center py-12 text-[var(--color-text-muted)]">
                  <FlaskConical className="w-8 h-8 mx-auto mb-2 opacity-40" />No lab results found
                </div>
              ) : (
                <div className="card divide-y divide-[var(--color-border)]">
                  {labs.map(lab => (
                    <div key={lab.id} className="flex items-center gap-3 p-4">
                      <FlaskConical className="w-5 h-5 text-amber-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-[var(--color-text)]">{lab.test_name}</div>
                        <div className="text-xs text-[var(--color-text-muted)]">{fmt(lab.ordered_date)}</div>
                        {lab.result_value && (
                          <div className="text-sm font-semibold text-[var(--color-text)] mt-0.5">{lab.result_value}</div>
                        )}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        lab.status === 'completed' ? 'bg-green-100 text-green-700' :
                        lab.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>{lab.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* VITALS */}
          {tab === 'vitals' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button onClick={() => setShowVitalsForm(v => !v)} className="btn-primary flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Record Vitals
                </button>
              </div>

              {showVitalsForm && (
                <div className="card p-4 border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5 space-y-3">
                  <h3 className="font-semibold text-sm text-[var(--color-text)]">Record Home Vitals</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {[
                      { label: 'BP (mmHg)',  val: vBp,    set: setVBp,    ph: '120/80' },
                      { label: 'Temp (°F)',  val: vTemp,  set: setVTemp,  ph: '98.6' },
                      { label: 'Weight(kg)', val: vWt,    set: setVWt,    ph: '70' },
                      { label: 'SpO₂ (%)',   val: vSpo2,  set: setVSpo2,  ph: '98' },
                      { label: 'Pulse',      val: vPulse, set: setVPulse, ph: '75 bpm' },
                    ].map(f => (
                      <div key={f.label}>
                        <label className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide block mb-1">{f.label}</label>
                        <input value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph} className="input w-full text-sm" />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => recordVitals.mutate()} disabled={recordVitals.isPending}
                      className="btn-primary flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" /> {recordVitals.isPending ? 'Saving…' : 'Save Vitals'}
                    </button>
                    <button onClick={() => setShowVitalsForm(false)} className="btn border border-[var(--color-border)] text-sm">Cancel</button>
                  </div>
                </div>
              )}

              {vitals.length === 0 ? (
                <div className="text-center py-12 text-[var(--color-text-muted)]">
                  <HeartPulse className="w-8 h-8 mx-auto mb-2 opacity-40" />No vitals recorded yet
                </div>
              ) : (
                <div className="card overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-[var(--color-text-muted)] uppercase border-b border-[var(--color-border)]">
                      <tr>
                        <th className="text-left p-3 font-medium">Date</th>
                        <th className="text-left p-3 font-medium">BP</th>
                        <th className="text-left p-3 font-medium">Temp</th>
                        <th className="text-left p-3 font-medium">Weight</th>
                        <th className="text-left p-3 font-medium">SpO₂</th>
                        <th className="text-left p-3 font-medium">Pulse</th>
                        <th className="text-left p-3 font-medium">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vitals.map((v, i) => (
                        <tr key={v.id} className={i % 2 === 0 ? 'bg-[var(--color-bg)]' : 'bg-white'}>
                          <td className="p-3">{fmt(v.recorded_at)}</td>
                          <td className="p-3">{v.bp ?? '—'}</td>
                          <td className="p-3">{v.temperature ?? '—'}</td>
                          <td className="p-3">{v.weight ?? '—'}</td>
                          <td className="p-3">{v.spo2 ?? '—'}</td>
                          <td className="p-3">{v.pulse ?? '—'}</td>
                          <td className="p-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              v.source === 'self' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                            }`}>{v.source ?? 'clinic'}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* BILLS */}
          {tab === 'bills' && (
            <div>
              {bills.length === 0 ? (
                <div className="text-center py-12 text-[var(--color-text-muted)]">
                  <Receipt className="w-8 h-8 mx-auto mb-2 opacity-40" />No billing records found
                </div>
              ) : (
                <div className="card divide-y divide-[var(--color-border)]">
                  {bills.map(b => (
                    <div key={b.id} className="flex items-center gap-3 p-4">
                      <Receipt className="w-5 h-5 text-orange-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-[var(--color-text)]">{b.invoice_no}</div>
                        <div className="text-xs text-[var(--color-text-muted)]">{fmt(b.created_at)}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-[var(--color-text)]">৳{(b.amount / 100).toLocaleString()}</div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          b.status === 'paid' ? 'bg-green-100 text-green-700' :
                          b.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }`}>{b.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TELEMEDICINE */}
          {tab === 'telemedicine' && (
            <div>
              {sessions.length === 0 ? (
                <div className="text-center py-12 text-[var(--color-text-muted)]">
                  <Video className="w-8 h-8 mx-auto mb-2 opacity-40" />No telemedicine sessions found
                </div>
              ) : (
                <div className="card divide-y divide-[var(--color-border)]">
                  {sessions.map(s => (
                    <div key={s.id} className="flex items-center gap-3 p-4">
                      <Video className="w-5 h-5 text-blue-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-[var(--color-text)]">{s.doctor_name ? `Dr. ${s.doctor_name}` : 'Telemedicine'}</div>
                        <div className="text-xs text-[var(--color-text-muted)] flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {fmt(s.scheduled_at)}
                        </div>
                      </div>
                      {s.status === 'scheduled' && s.room_url ? (
                        <a href={s.room_url} target="_blank" rel="noopener noreferrer"
                          className="btn-primary text-xs flex items-center gap-1">
                          <ExternalLink className="w-3 h-3" /> Join
                        </a>
                      ) : (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          s.status === 'completed' ? 'bg-green-100 text-green-700' :
                          s.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>{s.status}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </DashboardLayout>
  );
}
