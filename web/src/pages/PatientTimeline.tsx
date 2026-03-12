import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { ChevronRight, Clock, Pill, FlaskConical, BedDouble, FileText, Stethoscope, Calendar } from 'lucide-react';
import axios from 'axios';
import DashboardLayout from '../components/DashboardLayout';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TimelineEvent {
  id: number;
  type: 'visit' | 'prescription' | 'lab' | 'admission' | 'discharge' | 'appointment';
  title: string;
  description: string;
  date: string;
  doctor?: string;
  status?: string;
  details?: Record<string, string>;
}

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

const TYPE_CONFIG: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  visit:        { icon: <Stethoscope className="w-4 h-4" />, color: '#088eaf', bg: '#088eaf15' },
  prescription: { icon: <Pill className="w-4 h-4" />,        color: '#6366f1', bg: '#6366f115' },
  lab:          { icon: <FlaskConical className="w-4 h-4" />, color: '#f59e0b', bg: '#f59e0b15' },
  admission:    { icon: <BedDouble className="w-4 h-4" />,    color: '#ef4444', bg: '#ef444415' },
  discharge:    { icon: <FileText className="w-4 h-4" />,     color: '#10b981', bg: '#10b98115' },
  appointment:  { icon: <Calendar className="w-4 h-4" />,     color: '#8b5cf6', bg: '#8b5cf615' },
};

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtTime(d: string): string {
  return new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

// ─── Demo data ───────────────────────────────────────────────────────────────

const DEMO_EVENTS: TimelineEvent[] = [
  { id: 1, type: 'appointment', title: 'Follow-up Appointment', description: 'Scheduled with Dr. Aminur Rahman', date: new Date(Date.now() + 5 * 86400000).toISOString(), doctor: 'Dr. Aminur Rahman', status: 'upcoming' },
  { id: 2, type: 'prescription', title: 'Prescription RX-00023', description: 'Azithromycin 500mg, Paracetamol 500mg, Benadryl syrup', date: new Date(Date.now() - 86400000).toISOString(), doctor: 'Dr. Aminur Rahman', status: 'active' },
  { id: 3, type: 'lab', title: 'Lab Report LAB-00045', description: 'CBC: Hemoglobin 11.2 (Low), WBC 12,500 (High), CRP 24 (High)', date: new Date(Date.now() - 86400000).toISOString(), status: 'completed',
    details: { Hemoglobin: '11.2 g/dL ⬇', WBC: '12,500 /cmm ⬆', CRP: '24 mg/L ⬆' } },
  { id: 4, type: 'visit', title: 'OPD Consultation', description: 'Chief complaint: Fever, body ache, cough for 3 days. Dx: URTI', date: new Date(Date.now() - 86400000).toISOString(), doctor: 'Dr. Aminur Rahman',
    details: { BP: '125/82', Temp: '99.1°F', Weight: '68 kg', SpO2: '97%' } },
  { id: 5, type: 'discharge', title: 'Discharge Summary', description: 'Discharged after 3-day treatment for dengue fever. Condition: improved.', date: new Date(Date.now() - 7 * 86400000).toISOString(), doctor: 'Dr. Nasreen Akter', status: 'final' },
  { id: 6, type: 'admission', title: 'IPD Admission ADM-0012', description: 'Admitted for dengue fever. Bed: Male Ward - B-05', date: new Date(Date.now() - 10 * 86400000).toISOString(), doctor: 'Dr. Nasreen Akter',
    details: { Ward: 'Male Ward', Bed: 'B-05', Diagnosis: 'Dengue Fever' } },
  { id: 7, type: 'visit', title: 'Emergency Visit', description: 'High fever 103°F with body pain and rash. Dengue NS1 positive.', date: new Date(Date.now() - 10 * 86400000).toISOString(), doctor: 'Dr. Nasreen Akter' },
  { id: 8, type: 'prescription', title: 'Prescription RX-00015', description: 'IV Paracetamol, ORS, Platelet monitoring', date: new Date(Date.now() - 10 * 86400000).toISOString(), doctor: 'Dr. Nasreen Akter' },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function PatientTimeline({ role = 'hospital_admin' }: { role?: string }) {
  const { slug = '', id = '' } = useParams<{ slug: string; id: string }>();
  const basePath = `/h/${slug}`;

  const [events, setEvents] = useState<TimelineEvent[]>(DEMO_EVENTS);
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [patientName, setPatientName] = useState('Mohammad Karim');

  useEffect(() => {
    setLoading(true);
    axios.get(`/api/patients/${id}/timeline`, { headers: authHeaders() })
      .then(r => {
        if (r.data.events?.length) setEvents(r.data.events);
        if (r.data.patient_name) setPatientName(r.data.patient_name);
      })
      .catch(() => { /* keep demo */ })
      .finally(() => setLoading(false));
  }, [id]);

  const filtered = filter === 'all' ? events : events.filter(e => e.type === filter);

  return (
    <DashboardLayout role={role}>
      <div className="space-y-5 max-w-3xl mx-auto">
        {/* Header */}
        <div>
          <div className="text-xs text-[var(--color-text-muted)] flex items-center gap-1 mb-1">
            <Link to={`${basePath}/dashboard`} className="hover:underline">Dashboard</Link>
            <ChevronRight className="w-3 h-3" />
            <Link to={`${basePath}/patients`} className="hover:underline">Patients</Link>
            <ChevronRight className="w-3 h-3" />
            <Link to={`${basePath}/patients/${id}`} className="hover:underline">{patientName}</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-[var(--color-text)] font-medium">Timeline</span>
          </div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Medical Timeline</h1>
          <p className="text-sm text-[var(--color-text-muted)]">Complete medical history for {patientName}</p>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap gap-2">
          {['all', 'visit', 'prescription', 'lab', 'admission', 'discharge', 'appointment'].map(t => (
            <button key={t} onClick={() => setFilter(t)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition capitalize ${
                filter === t
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-gray-100 text-[var(--color-text-muted)] hover:bg-gray-200'
              }`}>
              {t === 'all' ? `All (${events.length})` : `${t}s`}
            </button>
          ))}
        </div>

        {/* Timeline */}
        {loading ? (
          <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="animate-pulse h-24 bg-gray-100 rounded-xl" />)}</div>
        ) : (
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-[var(--color-border)]" />

            <div className="space-y-4">
              {filtered.map(event => {
                const cfg = TYPE_CONFIG[event.type] ?? TYPE_CONFIG.visit;
                return (
                  <div key={event.id} className="relative pl-14">
                    {/* Dot on timeline */}
                    <div className="absolute left-4 top-4 w-5 h-5 rounded-full border-2 border-white shadow-sm flex items-center justify-center"
                         style={{ background: cfg.color }}>
                      <div className="w-2 h-2 rounded-full bg-white" />
                    </div>

                    {/* Card */}
                    <div className="card p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: cfg.bg, color: cfg.color }}>
                            {cfg.icon}
                          </div>
                          <div>
                            <p className="font-semibold text-sm text-[var(--color-text)]">{event.title}</p>
                            {event.doctor && <p className="text-xs text-[var(--color-text-muted)]">{event.doctor}</p>}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs text-[var(--color-text-muted)]">{fmtDate(event.date)}</p>
                          <p className="text-xs text-[var(--color-text-muted)]">{fmtTime(event.date)}</p>
                        </div>
                      </div>
                      <p className="text-sm text-[var(--color-text-secondary)] mb-2">{event.description}</p>

                      {/* Detail chips */}
                      {event.details && (
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(event.details).map(([k, v]) => (
                            <span key={k} className="bg-gray-100 text-xs px-2 py-1 rounded-md text-[var(--color-text-muted)]">
                              <strong>{k}:</strong> {v}
                            </span>
                          ))}
                        </div>
                      )}

                      {event.status && (
                        <div className="mt-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full capitalize font-medium ${
                            event.status === 'completed' || event.status === 'final' ? 'bg-emerald-100 text-emerald-700' :
                            event.status === 'active' ? 'bg-blue-100 text-blue-700' :
                            event.status === 'upcoming' ? 'bg-amber-100 text-amber-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {event.status}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {filtered.length === 0 && (
              <div className="text-center py-12 text-[var(--color-text-muted)]">
                <Clock className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No events found</p>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
