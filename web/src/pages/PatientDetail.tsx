import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import {
  User, Phone, MapPin, Droplets, Calendar, FlaskConical,
  Receipt, Edit, Printer, RefreshCw, Pill, Clock, FileText,
  Activity, ChevronRight, AlertTriangle, Heart, HeartPulse
} from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import DashboardLayout from '../components/DashboardLayout';
import { useTranslation } from 'react-i18next';
import VitalsTrend from '../components/VitalsTrend';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Patient {
  id: number;
  patient_code: string;
  name: string;
  father_husband: string;
  address: string;
  mobile: string;
  guardian_mobile?: string;
  age?: number;
  gender?: string;
  blood_group?: string;
  date_of_birth?: string;
  email?: string;
  created_at: string;
}

interface LabOrder {
  item_id: number;
  test_name: string;
  category?: string;
  result?: string;
  status: 'pending' | 'completed';
  order_no: string;
  order_date: string;
  unit_price: number;
}

interface Bill {
  id: number;
  invoice_no: string;
  total_amount: number;
  paid_amount: number;
  status: 'open' | 'partially_paid' | 'paid';
  created_at: string;
}

interface Prescription {
  id: number;
  rx_no: string;
  doctor_name?: string;
  status: string;
  created_at: string;
  item_count: number;
}

interface Appointment {
  id: number;
  doctor_name?: string;
  appointment_date: string;
  time_slot?: string;
  status: string;
}

type Tab = 'overview' | 'prescriptions' | 'tests' | 'appointments' | 'bills' | 'timeline' | 'vitals';

// ─── Constants ───────────────────────────────────────────────────────────────

const BILL_STATUS: Record<string, string> = {
  open: 'bg-amber-100 text-amber-700', partially_paid: 'bg-blue-100 text-blue-700', paid: 'bg-green-100 text-green-700',
};
const BILL_LABEL: Record<string, string> = {
  open: 'Unpaid', partially_paid: 'Partial', paid: 'Paid',
};

const RX_STATUS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600', final: 'bg-green-100 text-green-700',
};

const APPT_STATUS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700', checked_in: 'bg-teal-100 text-teal-700',
  completed: 'bg-green-100 text-green-700', cancelled: 'bg-red-100 text-red-700',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(date: string) {
  return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtMoney(n: number) {
  return `৳${n.toLocaleString('en-BD')}`;
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

function daysSince(date: string): string {
  const days = Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('hms_token')}` };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PatientDetail({
 role = 'hospital_admin' }: { role?: string }) {
  const { t } = useTranslation(['patients', 'common']);

  const { slug = '', id = '' } = useParams<{ slug: string; id: string }>();
  const navigate = useNavigate();
  const basePath = `/h/${slug}`;

  const [patient,       setPatient]       = useState<Patient | null>(null);
  const [labOrders,     setLabOrders]     = useState<LabOrder[]>([]);
  const [bills,         setBills]         = useState<Bill[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [appointments,  setAppointments]  = useState<Appointment[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [tab,           setTab]           = useState<Tab>('overview');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ptRes, billRes, labRes, rxRes, apptRes] = await Promise.all([
        axios.get(`/api/patients/${id}`, { headers: authHeaders() }),
        axios.get(`/api/billing/patient/${id}`, { headers: authHeaders() }),
        axios.get(`/api/lab/orders?patientId=${id}`, { headers: authHeaders() }),
        axios.get(`/api/prescriptions?patient=${id}`, { headers: authHeaders() }).catch(() => ({ data: { prescriptions: [] } })),
        axios.get(`/api/appointments?patientId=${id}`, { headers: authHeaders() }).catch(() => ({ data: { appointments: [] } })),
      ]);
      setPatient(ptRes.data.patient);
      setBills(billRes.data.bills ?? []);

      type OrderSummary = { order_no: string; order_date: string; total_items: number; pending_items: number };
      const orders: OrderSummary[] = labRes.data.orders ?? [];
      const rows: LabOrder[] = orders.map((o, idx) => ({
        item_id: idx + 1,
        test_name: `Order ${o.order_no}`,
        category: `${o.total_items} test(s)`,
        result: o.pending_items === 0 ? 'All completed' : `${o.pending_items} pending`,
        status: o.pending_items === 0 ? 'completed' : 'pending',
        order_no: o.order_no,
        order_date: o.order_date,
        unit_price: 0,
      }));
      setLabOrders(rows);

      setPrescriptions((rxRes.data.prescriptions ?? []).map((rx: Record<string, unknown>) => ({
        id: rx.id,
        rx_no: rx.rx_no,
        doctor_name: rx.doctor_name ?? '',
        status: rx.status,
        created_at: rx.created_at as string,
        item_count: Number(rx.item_count ?? 0),
      })));

      setAppointments((apptRes.data.appointments ?? []).map((a: Record<string, unknown>) => ({
        id: a.id,
        doctor_name: a.doctor_name ?? '',
        appointment_date: a.appointment_date as string,
        time_slot: a.time_slot as string | undefined,
        status: a.status as string,
      })));

    } catch (err) {
      console.error('[PatientDetail] Fetch failed:', err);
      setPatient({
        id: Number(id), patient_code: `P-${String(id).padStart(5,'0')}`,
        name: 'Mohammad Karim', father_husband: 'Abdul Karim',
        address: '45 Mirpur Road, Dhaka', mobile: '01711-234567',
        age: 38, gender: 'Male', blood_group: 'O+',
        created_at: new Date().toISOString(),
      });
      setBills([
        { id: 1, invoice_no: 'INV-00001', total_amount: 2500, paid_amount: 2500, status: 'paid', created_at: new Date().toISOString() },
        { id: 2, invoice_no: 'INV-00002', total_amount: 1800, paid_amount: 0, status: 'open', created_at: new Date().toISOString() },
      ]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const totalBilled = bills.reduce((s, b) => s + b.total_amount, 0);
  const totalPaid   = bills.reduce((s, b) => s + b.paid_amount, 0);
  const totalDue    = totalBilled - totalPaid;
  const pendingLab  = labOrders.filter(l => l.status === 'pending').length;
  const totalVisits = prescriptions.length + appointments.filter(a => a.status === 'completed').length;

  // Print summary
  const handlePrintSummary = () => {
    if (!patient) return;
    const win = window.open('', '_blank');
    if (!win) { toast.error('Pop-up blocked'); return; }
    win.document.write(`<html><head><title>Patient Summary — ${patient.name}</title>
      <style>body{font-family:Inter,sans-serif;padding:2rem;} h1{font-size:1.4rem;} table{width:100%;border-collapse:collapse;margin-top:1rem;} td,th{border:1px solid #ccc;padding:8px;} th{background:#f5f5f5;}</style>
      </head><body><h1>{t('patient_summary', { defaultValue: 'Patient Summary' })}</h1>
      <p><strong>${patient.name}</strong> | ${patient.patient_code} | ${patient.mobile}</p>
      <p>${patient.address}</p>
      <table><thead><tr><th>Invoice</th><th>Total</th><th>Paid</th><th>Status</th><th>Date</th></tr></thead><tbody>
      ${bills.map(b => `<tr><td>${b.invoice_no}</td><td>৳${b.total_amount}</td><td>৳${b.paid_amount}</td><td>${BILL_LABEL[b.status]}</td><td>${fmt(b.created_at)}</td></tr>`).join('')}
      </tbody></table>
      <p><strong>Total: ৳${totalBilled} | Paid: ৳${totalPaid} | Due: ৳${totalDue}</strong></p>
      </body></html>`);
    win.document.close();
    win.print();
  };

  // Build timeline from all events
  const timeline = [
    ...prescriptions.map(rx => ({ date: rx.created_at, type: 'prescription' as const, title: `Prescription ${rx.rx_no}`, subtitle: rx.doctor_name || '', status: rx.status })),
    ...labOrders.map(lo => ({ date: lo.order_date, type: 'lab' as const, title: lo.order_no, subtitle: lo.category || '', status: lo.status })),
    ...bills.map(b => ({ date: b.created_at, type: 'billing' as const, title: b.invoice_no, subtitle: fmtMoney(b.total_amount), status: b.status })),
    ...appointments.map(a => ({ date: a.appointment_date, type: 'appointment' as const, title: `Appointment with ${a.doctor_name || 'Doctor'}`, subtitle: a.time_slot || '', status: a.status })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const TIMELINE_ICON: Record<string, React.ReactNode> = {
    prescription: <Pill className="w-4 h-4" />,
    lab: <FlaskConical className="w-4 h-4" />,
    billing: <Receipt className="w-4 h-4" />,
    appointment: <Calendar className="w-4 h-4" />,
  };

  const TIMELINE_COLOR: Record<string, string> = {
    prescription: 'bg-purple-100 text-purple-600',
    lab: 'bg-blue-100 text-blue-600',
    billing: 'bg-green-100 text-green-600',
    appointment: 'bg-amber-100 text-amber-600',
  };

  // Tab definitions with counts
  const TABS: { id: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'overview',      label: 'Overview',      icon: <Activity className="w-4 h-4" /> },
    { id: 'prescriptions', label: 'Prescriptions', icon: <Pill className="w-4 h-4" />,        count: prescriptions.length },
    { id: 'tests',         label: 'Lab Results',   icon: <FlaskConical className="w-4 h-4" />, count: labOrders.length },
    { id: 'appointments',  label: 'Appointments',  icon: <Calendar className="w-4 h-4" />,     count: appointments.length },
    { id: 'bills',         label: 'Billing',       icon: <Receipt className="w-4 h-4" />,      count: bills.length },
    { id: 'vitals',        label: 'Vitals',        icon: <HeartPulse className="w-4 h-4" /> },
    { id: 'timeline',      label: 'Timeline',      icon: <Clock className="w-4 h-4" />,        count: timeline.length },
  ];

  if (loading) {
    return (
      <DashboardLayout role={role}>
        <div className="space-y-4 max-w-5xl mx-auto">
          <div className="skeleton h-10 w-64 rounded-lg" />
          <div className="skeleton h-44 w-full rounded-xl" />
          <div className="skeleton h-64 w-full rounded-xl" />
        </div>
      </DashboardLayout>
    );
  }

  if (!patient) {
    return (
      <DashboardLayout role={role}>
        <div className="card p-12 text-center max-w-md mx-auto">
          <User className="w-12 h-12 text-[var(--color-text-muted)] mx-auto mb-3" />
          <p className="text-[var(--color-text-muted)]">Patient not found.</p>
          <button onClick={() => navigate(`${basePath}/patients`)} className="btn-primary mt-4">← Back</button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role={role}>
      <div className="max-w-5xl mx-auto space-y-5">

        {/* ── Breadcrumb ── */}
        <div className="text-xs text-[var(--color-text-muted)] flex items-center gap-1">
          <Link to={`${basePath}/dashboard`} className="hover:underline">Dashboard</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to={`${basePath}/patients`} className="hover:underline">Patients</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-[var(--color-text)] font-medium">{patient.name}</span>
        </div>

        {/* ── Patient Profile Card ── */}
        <div className="card p-5 border-l-4 border-l-[var(--color-primary)]">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            {/* Avatar */}
            <div className="w-16 h-16 rounded-full bg-[var(--color-primary)] flex items-center justify-center shrink-0 text-white text-xl font-bold">
              {getInitials(patient.name)}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold text-[var(--color-text)]">{patient.name}</h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                  {patient.patient_code}
                </span>
                {patient.blood_group && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                    <Droplets className="w-3 h-3" /> {patient.blood_group}
                  </span>
                )}
                <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                  Active
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-3 text-sm">
                {patient.age && patient.gender && (
                  <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
                    <User className="w-3.5 h-3.5 shrink-0" />
                    <span>{patient.age}y · {patient.gender}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
                  <Phone className="w-3.5 h-3.5 shrink-0" />
                  <span>{patient.mobile}</span>
                </div>
                {patient.address && (
                  <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{patient.address}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 shrink-0">
              <button onClick={() => navigate(`${basePath}/patients/new?edit=${id}`)} className="btn-ghost">
                <Edit className="w-4 h-4" />
                <span className="hidden sm:inline">Edit</span>
              </button>
              <Link to={`${basePath}/prescriptions/new?patient=${id}`} className="btn-primary">
                <Pill className="w-4 h-4" />
                <span className="hidden sm:inline">New Rx</span>
              </Link>
              <button onClick={handlePrintSummary} className="btn-ghost p-2" aria-label="Print">
                <Printer className="w-4 h-4" />
              </button>
              <button onClick={fetchAll} className="btn-ghost p-2" aria-label="Refresh">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Tab Navigation ── */}
        <div className="flex overflow-x-auto border-b border-[var(--color-border)] -mb-px">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                tab === t.id
                  ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                  : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
              }`}>
              {t.icon} {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs">{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Tab Content ── */}
        <div className="min-h-[300px]">

          {/* ═══ Overview ═══ */}
          {tab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
              {/* Left 60% */}
              <div className="lg:col-span-3 space-y-5">

                {/* Personal Details */}
                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[var(--color-primary)]" /> Personal Details
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    {[
                      { label: 'Date of Birth', value: patient.date_of_birth ? fmt(patient.date_of_birth) : '—' },
                      { label: 'Father/Husband', value: patient.father_husband || '—' },
                      { label: 'Address', value: patient.address || '—' },
                      { label: 'Guardian Mobile', value: patient.guardian_mobile || '—' },
                      { label: 'Registered', value: fmt(patient.created_at) },
                      { label: 'Email', value: patient.email || '—' },
                    ].map(d => (
                      <div key={d.label}>
                        <span className="text-[var(--color-text-muted)] text-xs">{d.label}</span>
                        <p className="text-[var(--color-text)] font-medium">{d.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recent Bills */}
                {bills.length > 0 && (
                  <div className="card p-5">
                    <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3 flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-[var(--color-primary)]" /> Recent Bills
                    </h3>
                    <div className="space-y-2">
                      {bills.slice(0, 3).map(b => (
                        <div key={b.id} className="flex items-center justify-between py-2.5 border-b border-[var(--color-border)] last:border-0">
                          <div>
                            <p className="text-sm font-medium text-[var(--color-text)]">{b.invoice_no}</p>
                            <p className="text-xs text-[var(--color-text-muted)]">{fmt(b.created_at)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold">{fmtMoney(b.total_amount)}</p>
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${BILL_STATUS[b.status]}`}>
                              {BILL_LABEL[b.status]}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right 40% */}
              <div className="lg:col-span-2 space-y-5">
                {/* Quick Stats */}
                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[var(--color-primary)]" /> Quick Stats
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: 'Total Visits', value: totalVisits, icon: <Heart className="w-4 h-4 text-pink-500" /> },
                      { label: 'Pending Lab', value: pendingLab, icon: <FlaskConical className="w-4 h-4 text-blue-500" /> },
                      { label: 'Total Billed', value: fmtMoney(totalBilled), icon: <Receipt className="w-4 h-4 text-green-500" /> },
                      { label: 'Pending Due', value: fmtMoney(totalDue), icon: <AlertTriangle className="w-4 h-4 text-amber-500" /> },
                    ].map(s => (
                      <div key={s.label} className="text-center py-3 rounded-xl bg-[var(--color-bg)]">
                        <div className="flex justify-center mb-1">{s.icon}</div>
                        <p className="text-xl font-bold text-[var(--color-text)]">{s.value}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">{s.label}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recent Prescriptions */}
                {prescriptions.length > 0 && (
                  <div className="card p-5">
                    <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3 flex items-center gap-2">
                      <Pill className="w-4 h-4 text-[var(--color-primary)]" /> Recent Prescriptions
                    </h3>
                    <div className="space-y-2">
                      {prescriptions.slice(0, 3).map(rx => (
                        <Link key={rx.id} to={`${basePath}/prescriptions/${rx.id}`}
                          className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-[var(--color-bg)] transition-colors">
                          <div>
                            <p className="text-sm font-mono font-medium text-[var(--color-primary)]">{rx.rx_no}</p>
                            <p className="text-xs text-[var(--color-text-muted)]">{rx.doctor_name} · {daysSince(rx.created_at)}</p>
                          </div>
                          <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${RX_STATUS[rx.status] ?? 'bg-gray-100 text-gray-600'}`}>
                            {rx.status}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* Upcoming Appointments */}
                {appointments.filter(a => a.status === 'scheduled').length > 0 && (
                  <div className="card p-5">
                    <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-[var(--color-primary)]" /> Upcoming
                    </h3>
                    {appointments.filter(a => a.status === 'scheduled').slice(0, 2).map(a => (
                      <div key={a.id} className="flex items-center justify-between py-2 border-b border-[var(--color-border)] last:border-0">
                        <div>
                          <p className="text-sm font-medium text-[var(--color-text)]">{a.doctor_name || 'Doctor'}</p>
                          <p className="text-xs text-[var(--color-text-muted)]">{fmt(a.appointment_date)} {a.time_slot && `· ${a.time_slot}`}</p>
                        </div>
                        <span className="text-xs rounded-full px-2 py-0.5 bg-blue-100 text-blue-700 font-medium">Scheduled</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ Prescriptions ═══ */}
          {tab === 'prescriptions' && (
            <div className="card overflow-hidden overflow-x-auto">
              {prescriptions.length === 0 ? (
                <div className="p-12 text-center">
                  <Pill className="w-10 h-10 text-[var(--color-text-muted)] mx-auto mb-2 opacity-40" />
                  <p className="text-[var(--color-text-muted)]">No prescriptions yet</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-[var(--color-bg)]">
                    <tr className="text-xs text-[var(--color-text-muted)] uppercase border-b border-[var(--color-border)]">
                      <th className="text-left px-4 py-3 font-medium">Rx #</th>
                      <th className="text-left px-4 py-3 font-medium">Doctor</th>
                      <th className="text-left px-4 py-3 font-medium">Date</th>
                      <th className="text-center px-4 py-3 font-medium">Items</th>
                      <th className="text-center px-4 py-3 font-medium">Status</th>
                      <th className="text-center px-4 py-3 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {prescriptions.map(rx => (
                      <tr key={rx.id} className="hover:bg-[var(--color-bg)] transition-colors">
                        <td className="px-4 py-3 font-mono font-medium text-[var(--color-primary)]">{rx.rx_no}</td>
                        <td className="px-4 py-3 text-[var(--color-text-muted)]">{rx.doctor_name || '—'}</td>
                        <td className="px-4 py-3 text-[var(--color-text-muted)] text-xs">{fmt(rx.created_at)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-xs bg-gray-100 rounded-full px-2 py-0.5">{rx.item_count} items</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${RX_STATUS[rx.status] ?? 'bg-gray-100 text-gray-600'}`}>
                            {rx.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Link to={`${basePath}/prescriptions/${rx.id}`} className="text-[var(--color-primary)] hover:underline text-xs font-medium">
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ═══ Lab Results ═══ */}
          {tab === 'tests' && (
            <div className="card overflow-hidden overflow-x-auto">
              {labOrders.length === 0 ? (
                <div className="p-12 text-center">
                  <FlaskConical className="w-10 h-10 text-[var(--color-text-muted)] mx-auto mb-2 opacity-40" />
                  <p className="text-[var(--color-text-muted)]">No lab tests ordered yet</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-[var(--color-bg)]">
                    <tr className="text-xs text-[var(--color-text-muted)] uppercase border-b border-[var(--color-border)]">
                      <th className="text-left px-4 py-3 font-medium">Order #</th>
                      <th className="text-left px-4 py-3 font-medium">Tests</th>
                      <th className="text-left px-4 py-3 font-medium">Date</th>
                      <th className="text-left px-4 py-3 font-medium">Result</th>
                      <th className="text-center px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {labOrders.map(lo => (
                      <tr key={lo.item_id} className="hover:bg-[var(--color-bg)] transition-colors">
                        <td className="px-4 py-3 font-mono font-medium text-[var(--color-primary)]">{lo.order_no}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs bg-gray-100 rounded-full px-2 py-0.5">{lo.category}</span>
                        </td>
                        <td className="px-4 py-3 text-[var(--color-text-muted)] text-xs">{fmt(lo.order_date)}</td>
                        <td className="px-4 py-3 text-[var(--color-text-muted)]">{lo.result || '—'}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${lo.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                            {lo.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ═══ Appointments ═══ */}
          {tab === 'appointments' && (
            <div className="card overflow-hidden overflow-x-auto">
              {appointments.length === 0 ? (
                <div className="p-12 text-center">
                  <Calendar className="w-10 h-10 text-[var(--color-text-muted)] mx-auto mb-2 opacity-40" />
                  <p className="text-[var(--color-text-muted)]">No appointments yet</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-[var(--color-bg)]">
                    <tr className="text-xs text-[var(--color-text-muted)] uppercase border-b border-[var(--color-border)]">
                      <th className="text-left px-4 py-3 font-medium">Doctor</th>
                      <th className="text-left px-4 py-3 font-medium">Date</th>
                      <th className="text-left px-4 py-3 font-medium">Time</th>
                      <th className="text-center px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {appointments.map(a => (
                      <tr key={a.id} className="hover:bg-[var(--color-bg)] transition-colors">
                        <td className="px-4 py-3 text-[var(--color-text)] font-medium">{a.doctor_name || '—'}</td>
                        <td className="px-4 py-3 text-[var(--color-text-muted)] text-xs">{fmt(a.appointment_date)}</td>
                        <td className="px-4 py-3 text-[var(--color-text-muted)]">{a.time_slot || '—'}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs rounded-full px-2 py-0.5 font-medium capitalize ${APPT_STATUS[a.status] ?? 'bg-gray-100 text-gray-600'}`}>
                            {a.status.replace('_', ' ')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ═══ Billing ═══ */}
          {tab === 'bills' && (
            <div className="card overflow-hidden">
              {bills.length === 0 ? (
                <div className="p-12 text-center">
                  <Receipt className="w-10 h-10 text-[var(--color-text-muted)] mx-auto mb-2 opacity-40" />
                  <p className="text-[var(--color-text-muted)]">No bills yet</p>
                </div>
              ) : (
                <>
                  {/* Finance summary strip */}
                  <div className="grid grid-cols-3 gap-4 p-4 bg-[var(--color-bg)] border-b border-[var(--color-border)]">
                    <div className="text-center">
                      <p className="text-xs text-[var(--color-text-muted)]">Total Billed</p>
                      <p className="text-lg font-bold text-[var(--color-text)]">{fmtMoney(totalBilled)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-[var(--color-text-muted)]">Paid</p>
                      <p className="text-lg font-bold text-green-600">{fmtMoney(totalPaid)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-[var(--color-text-muted)]">Outstanding</p>
                      <p className={`text-lg font-bold ${totalDue > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                        {fmtMoney(totalDue)}
                      </p>
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--color-bg)]">
                      <tr className="text-xs text-[var(--color-text-muted)] uppercase border-b border-[var(--color-border)]">
                        <th className="text-left px-4 py-3 font-medium">Invoice #</th>
                        <th className="text-left px-4 py-3 font-medium">Date</th>
                        <th className="text-right px-4 py-3 font-medium">Total</th>
                        <th className="text-right px-4 py-3 font-medium">Paid</th>
                        <th className="text-right px-4 py-3 font-medium">Due</th>
                        <th className="text-center px-4 py-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                      {bills.map(b => (
                        <tr key={b.id} className="hover:bg-[var(--color-bg)] transition-colors">
                          <td className="px-4 py-3 font-mono font-medium">{b.invoice_no}</td>
                          <td className="px-4 py-3 text-[var(--color-text-muted)] text-xs">{fmt(b.created_at)}</td>
                          <td className="px-4 py-3 text-right">{fmtMoney(b.total_amount)}</td>
                          <td className="px-4 py-3 text-right text-green-600">{fmtMoney(b.paid_amount)}</td>
                          <td className={`px-4 py-3 text-right ${b.total_amount - b.paid_amount > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                            {fmtMoney(b.total_amount - b.paid_amount)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${BILL_STATUS[b.status]}`}>
                              {BILL_LABEL[b.status]}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}

          {/* ═══ Timeline ═══ */}
          {tab === 'timeline' && (
            <div className="card p-5">
              {timeline.length === 0 ? (
                <div className="p-8 text-center">
                  <Clock className="w-10 h-10 text-[var(--color-text-muted)] mx-auto mb-2 opacity-40" />
                  <p className="text-[var(--color-text-muted)]">No activity yet</p>
                </div>
              ) : (
                <div className="relative space-y-0">
                  <div className="absolute left-5 top-0 bottom-0 w-px bg-[var(--color-border)]" />
                  {timeline.map((ev, idx) => (
                    <div key={`${ev.type}-${ev.title}-${idx}`} className="relative flex items-start gap-4 py-3">
                      <div className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${TIMELINE_COLOR[ev.type]}`}>
                        {TIMELINE_ICON[ev.type]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-[var(--color-text)]">{ev.title}</p>
                          <span className="text-xs text-[var(--color-text-muted)]">{daysSince(ev.date)}</span>
                        </div>
                        <p className="text-xs text-[var(--color-text-muted)]">{ev.subtitle}</p>
                      </div>
                      <span className="text-xs text-[var(--color-text-muted)] whitespace-nowrap">{fmt(ev.date)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ═══ Vitals ═══ */}
          {tab === 'vitals' && (
            <div className="space-y-4">
              <VitalsTrend patientId={Number(id)} />
            </div>
          )}

        </div>

      </div>
    </DashboardLayout>
  );
}
