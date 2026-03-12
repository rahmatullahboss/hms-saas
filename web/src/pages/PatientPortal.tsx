import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { ChevronRight, Calendar, Pill, FlaskConical, Receipt, Bell, User, Clock } from 'lucide-react';
import axios from 'axios';
import DashboardLayout from '../components/DashboardLayout';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PatientSummary {
  name: string;
  patient_code: string;
  age?: string;
  gender?: string;
  blood_group?: string;
  upcoming_appointment?: { date: string; doctor: string; department: string };
  recent_prescriptions: { rx_no: string; date: string; doctor: string; item_count: number }[];
  recent_labs: { lab_no: string; date: string; test_name: string; status: string }[];
  recent_bills: { bill_no: string; date: string; amount: number; status: string }[];
  notifications: { id: number; message: string; date: string; read: boolean }[];
}

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const DEMO: PatientSummary = {
  name: 'Mohammad Karim', patient_code: 'P-00001', age: '35Y', gender: 'Male', blood_group: 'B+',
  upcoming_appointment: { date: new Date(Date.now() + 5*86400000).toISOString(), doctor: 'Dr. Aminur Rahman', department: 'Internal Medicine' },
  recent_prescriptions: [
    { rx_no: 'RX-00023', date: new Date(Date.now() - 86400000).toISOString(), doctor: 'Dr. Aminur Rahman', item_count: 3 },
    { rx_no: 'RX-00015', date: new Date(Date.now() - 10*86400000).toISOString(), doctor: 'Dr. Nasreen Akter', item_count: 4 },
  ],
  recent_labs: [
    { lab_no: 'LAB-00045', date: new Date(Date.now() - 86400000).toISOString(), test_name: 'CBC + CRP', status: 'completed' },
    { lab_no: 'LAB-00038', date: new Date(Date.now() - 10*86400000).toISOString(), test_name: 'Dengue NS1 + IgG/IgM', status: 'completed' },
  ],
  recent_bills: [
    { bill_no: 'INV-5530', date: new Date(Date.now() - 86400000).toISOString(), amount: 2500, status: 'paid' },
    { bill_no: 'INV-5522', date: new Date(Date.now() - 10*86400000).toISOString(), amount: 25000, status: 'paid' },
  ],
  notifications: [
    { id: 1, message: 'Your lab report LAB-00045 is ready', date: new Date(Date.now() - 86400000).toISOString(), read: false },
    { id: 2, message: 'Appointment confirmed with Dr. Aminur Rahman', date: new Date(Date.now() - 2*86400000).toISOString(), read: true },
    { id: 3, message: 'Prescription RX-00023 has been dispensed', date: new Date(Date.now() - 3*86400000).toISOString(), read: true },
  ],
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function PatientPortal({ role = 'hospital_admin' }: { role?: string }) {
  const { slug = '' } = useParams<{ slug: string }>();
  const basePath = `/h/${slug}`;
  const [data, setData] = useState<PatientSummary>(DEMO);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    axios.get('/api/patient-portal/summary', { headers: authHeaders() })
      .then(r => { if (r.data.summary) setData(r.data.summary); })
      .catch(() => { /* keep demo */ })
      .finally(() => setLoading(false));
  }, []);

  const unreadCount = data.notifications.filter(n => !n.read).length;

  return (
    <DashboardLayout role={role}>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs text-[var(--color-text-muted)] flex items-center gap-1 mb-1">
              <Link to={`${basePath}/dashboard`} className="hover:underline">Dashboard</Link>
              <ChevronRight className="w-3 h-3" />
              <span className="text-[var(--color-text)] font-medium">Patient Portal</span>
            </div>
            <h1 className="text-2xl font-bold text-[var(--color-text)]">Patient Portal</h1>
            <p className="text-sm text-[var(--color-text-muted)]">Self-service patient dashboard</p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="animate-pulse h-32 bg-gray-100 rounded-xl" />)}</div>
        ) : (
          <>
            {/* Patient Card */}
            <div className="card p-5 flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-2xl font-bold flex-shrink-0"
                   style={{ background: 'var(--color-primary)' }}>
                <User className="w-8 h-8" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold text-[var(--color-text)]">{data.name}</h2>
                <div className="flex flex-wrap gap-3 text-xs text-[var(--color-text-muted)] mt-1">
                  <span>MRN: {data.patient_code}</span>
                  {data.age && <span>Age: {data.age}</span>}
                  {data.gender && <span>{data.gender}</span>}
                  {data.blood_group && <span className="font-medium text-red-600">Blood: {data.blood_group}</span>}
                </div>
              </div>
              {unreadCount > 0 && (
                <div className="relative">
                  <Bell className="w-6 h-6 text-[var(--color-text-muted)]" />
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">
                    {unreadCount}
                  </span>
                </div>
              )}
            </div>

            {/* Upcoming Appointment */}
            {data.upcoming_appointment && (
              <div className="card p-4 border-l-4" style={{ borderLeftColor: 'var(--color-primary)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#088eaf15', color: '#088eaf' }}>
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-[var(--color-text)]">Upcoming Appointment</p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {fmtDate(data.upcoming_appointment.date)} · {data.upcoming_appointment.doctor} · {data.upcoming_appointment.department}
                    </p>
                  </div>
                  <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full font-medium">Upcoming</span>
                </div>
              </div>
            )}

            {/* Grid: Prescriptions + Labs + Bills + Notifications */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Prescriptions */}
              <div className="card">
                <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center gap-2">
                  <Pill className="w-4 h-4 text-[var(--color-primary)]" />
                  <h3 className="font-semibold text-sm text-[var(--color-text)]">Recent Prescriptions</h3>
                </div>
                <div className="divide-y divide-[var(--color-border)]">
                  {data.recent_prescriptions.map(rx => (
                    <Link key={rx.rx_no} to={`${basePath}/prescriptions/${rx.rx_no}/print`}
                      className="flex items-center justify-between px-4 py-3 hover:bg-[var(--color-bg)] transition">
                      <div>
                        <p className="text-sm font-medium">{rx.rx_no}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">{rx.doctor} · {rx.item_count} medicines</p>
                      </div>
                      <span className="text-xs text-[var(--color-text-muted)]">{fmtDate(rx.date)}</span>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Lab Reports */}
              <div className="card">
                <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center gap-2">
                  <FlaskConical className="w-4 h-4 text-amber-600" />
                  <h3 className="font-semibold text-sm text-[var(--color-text)]">Lab Reports</h3>
                </div>
                <div className="divide-y divide-[var(--color-border)]">
                  {data.recent_labs.map(lab => (
                    <div key={lab.lab_no} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium">{lab.lab_no}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">{lab.test_name}</p>
                      </div>
                      <div className="text-right">
                        <span className="bg-emerald-100 text-emerald-700 text-xs px-2 py-0.5 rounded-full font-medium capitalize">{lab.status}</span>
                        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{fmtDate(lab.date)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bills */}
              <div className="card">
                <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-emerald-600" />
                  <h3 className="font-semibold text-sm text-[var(--color-text)]">Billing History</h3>
                </div>
                <div className="divide-y divide-[var(--color-border)]">
                  {data.recent_bills.map(bill => (
                    <div key={bill.bill_no} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium">{bill.bill_no}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">{fmtDate(bill.date)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-sm">৳{bill.amount.toLocaleString()}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full capitalize font-medium ${
                          bill.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}>{bill.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notifications */}
              <div className="card">
                <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center gap-2">
                  <Bell className="w-4 h-4 text-blue-600" />
                  <h3 className="font-semibold text-sm text-[var(--color-text)]">Notifications</h3>
                  {unreadCount > 0 && <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium">{unreadCount}</span>}
                </div>
                <div className="divide-y divide-[var(--color-border)]">
                  {data.notifications.map(n => (
                    <div key={n.id} className={`flex items-start gap-3 px-4 py-3 ${!n.read ? 'bg-blue-50/50' : ''}`}>
                      <Clock className="w-4 h-4 text-[var(--color-text-muted)] mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${!n.read ? 'font-medium' : 'text-[var(--color-text-muted)]'}`}>{n.message}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">{fmtDate(n.date)}</p>
                      </div>
                      {!n.read && <span className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
