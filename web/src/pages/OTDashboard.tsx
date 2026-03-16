import { useState, useEffect, useCallback, Fragment } from 'react';
import {
  Scissors, Plus, X, Search, Calendar, Clock, CheckCircle,
  AlertCircle, XCircle, ChevronDown, ChevronUp
} from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import DashboardLayout from '../components/DashboardLayout';
import KPICard from '../components/dashboard/KPICard';
import EmptyState from '../components/dashboard/EmptyState';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OTBooking {
  id: number;
  patient_name?: string;
  patient_code?: string;
  booked_for_date: string;
  surgery_type?: string;
  diagnosis?: string;
  anesthesia_type?: string;
  is_active: number;
  finalized?: boolean;
  surgeons?: { staff_name: string }[];
  anesthetist?: { staff_name: string } | null;
  scrub_nurse?: { staff_name: string } | null;
}

interface OTStats {
  today_bookings: number;
  this_week: number;
  total_upcoming: number;
  cancelled: number;
}

import { authHeader } from '../utils/auth';
const today = () => new Date().toISOString().split('T')[0];

const ANESTHESIA_TYPES = ['General', 'Spinal', 'Epidural', 'Local', 'Regional', 'IV Sedation'];
const SURGERY_TYPES = [
  'Appendectomy', 'Cholecystectomy', 'Hernia Repair', 'C-Section',
  'Hysterectomy', 'Laparotomy', 'TURP', 'Cataract', 'Other',
];

export default function OTDashboard({ role = 'hospital_admin' }: { role?: string }) {
  const [bookings, setBookings]       = useState<OTBooking[]>([]);
  const [stats, setStats]             = useState<OTStats | null>(null);
  const [loading, setLoading]         = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [dateFilter, setDateFilter]   = useState(today());
  const [search, setSearch]           = useState('');
  const [expandedId, setExpandedId]   = useState<number | null>(null);

  // Create booking modal
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [form, setForm] = useState({
    patient_id: '', booked_for_date: today(),
    surgery_type: '', anesthesia_type: '', diagnosis: '', remarks: '',
  });

  // Cancel modal
  const [cancelTarget, setCancelTarget] = useState<OTBooking | null>(null);
  const [cancelRemarks, setCancelRemarks] = useState('');
  const [cancelling, setCancelling]     = useState(false);

  // ESC to close
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setShowCreate(false); setCancelTarget(null); }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  // ── Fetch bookings ──
  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get('/api/ot/bookings', {
        params: { date: dateFilter },
        headers: authHeader(),
      });
      setBookings(data.bookings ?? []);
    } catch {
      toast.error('Failed to load OT bookings');
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, [dateFilter]);

  // ── Fetch stats ──
  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const { data } = await axios.get('/api/ot/stats', { headers: authHeader() });
      setStats(data);
    } catch {
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  // ── Create booking ──
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.patient_id) { toast.error('Patient ID is required'); return; }
    setSaving(true);
    try {
      await axios.post('/api/ot/bookings', {
        patient_id: parseInt(form.patient_id),
        booked_for_date: form.booked_for_date,
        surgery_type: form.surgery_type || undefined,
        anesthesia_type: form.anesthesia_type || undefined,
        diagnosis: form.diagnosis || undefined,
        remarks: form.remarks || undefined,
      }, { headers: authHeader() });
      toast.success('OT booking created');
      setShowCreate(false);
      setForm({ patient_id: '', booked_for_date: today(), surgery_type: '', anesthesia_type: '', diagnosis: '', remarks: '' });
      fetchBookings();
      fetchStats();
    } catch (err) {
      toast.error(axios.isAxiosError(err) ? err.response?.data?.message ?? 'Failed' : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  // ── Cancel booking ──
  const handleCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await axios.put(`/api/ot/bookings/${cancelTarget.id}/cancel`,
        { cancellation_remarks: cancelRemarks || undefined },
        { headers: authHeader() },
      );
      toast.success('OT booking cancelled');
      setCancelTarget(null);
      setCancelRemarks('');
      fetchBookings();
      fetchStats();
    } catch (err) {
      toast.error(axios.isAxiosError(err) ? err.response?.data?.message ?? 'Failed' : 'Failed');
    } finally {
      setCancelling(false);
    }
  };

  const filtered = bookings.filter(b =>
    !search ||
    b.patient_name?.toLowerCase().includes(search.toLowerCase()) ||
    b.patient_code?.toLowerCase().includes(search.toLowerCase()) ||
    b.surgery_type?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout role={role}>
      <div className="space-y-5 max-w-screen-2xl mx-auto">

        {/* Header */}
        <div className="page-header">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Scissors className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="page-title">Operation Theatre</h1>
              <p className="section-subtitle">OT scheduling &amp; management</p>
            </div>
          </div>
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> Schedule Booking
          </button>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard title="Today"    value={stats?.today_bookings ?? '—'} loading={statsLoading} icon={<Calendar className="w-5 h-5" />} iconBg="bg-[var(--color-primary-light)] text-[var(--color-primary)]" index={0} />
          <KPICard title="This Week" value={stats?.this_week ?? '—'}     loading={statsLoading} icon={<Clock className="w-5 h-5" />}    iconBg="bg-blue-50 text-blue-600"    index={1} />
          <KPICard title="Upcoming" value={stats?.total_upcoming ?? '—'} loading={statsLoading} icon={<CheckCircle className="w-5 h-5" />} iconBg="bg-emerald-50 text-emerald-600" index={2} />
          <KPICard title="Cancelled" value={stats?.cancelled ?? '—'}     loading={statsLoading} icon={<XCircle className="w-5 h-5" />}   iconBg="bg-rose-50 text-rose-600"    index={3} />
        </div>

        {/* Filters */}
        <div className="card p-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[var(--color-text-muted)]" />
            <input
              type="date"
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
              className="input py-1.5"
            />
          </div>
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
            <input
              type="text"
              placeholder="Search patient or surgery type…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input pl-9"
            />
          </div>
          <button onClick={() => setDateFilter(today())} className="btn-ghost text-sm">Today</button>
        </div>

        {/* Bookings Table */}
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Surgery</th>
                  <th>Date</th>
                  <th>Anesthesia</th>
                  <th>Diagnosis</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? [...Array(4)].map((_, i) => (
                      <tr key={i}>
                        {[...Array(7)].map((_, j) => (
                          <td key={j}><div className="skeleton h-4 w-full rounded" /></td>
                        ))}
                      </tr>
                    ))
                  : filtered.length === 0
                  ? (
                      <tr>
                        <td colSpan={7}>
                          <EmptyState
                            icon={<Scissors className="w-8 h-8 text-[var(--color-text-muted)]" />}
                            title="No OT bookings"
                            description={`No bookings scheduled for ${dateFilter}.`}
                            action={
                              <button onClick={() => setShowCreate(true)} className="btn-primary mt-2">
                                <Plus className="w-4 h-4" /> Schedule First Booking
                              </button>
                            }
                          />
                        </td>
                      </tr>
                    )
                  : filtered.map(b => (
                      <Fragment key={b.id}>
                        <tr className={b.is_active === 0 ? 'opacity-50' : ''}>
                          <td>
                            <p className="font-medium">{b.patient_name ?? '—'}</p>
                            {b.patient_code && <p className="text-xs text-[var(--color-text-muted)]">{b.patient_code}</p>}
                          </td>
                          <td>{b.surgery_type ?? '—'}</td>
                          <td className="font-data">{b.booked_for_date}</td>
                          <td>{b.anesthesia_type ?? '—'}</td>
                          <td className="max-w-xs truncate">{b.diagnosis ?? '—'}</td>
                          <td>
                            <span className={`badge ${b.is_active === 0 ? 'badge-error' : 'badge-success'}`}>
                              {b.is_active === 0 ? 'Cancelled' : 'Scheduled'}
                            </span>
                          </td>
                          <td>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setExpandedId(expandedId === b.id ? null : b.id)}
                                className="btn-ghost p-1.5 text-[var(--color-text-secondary)]"
                                title="View details"
                              >
                                {expandedId === b.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                              {b.is_active !== 0 && (
                                <button
                                  onClick={() => { setCancelTarget(b); setCancelRemarks(''); }}
                                  className="btn-ghost p-1.5 text-red-500"
                                  title="Cancel booking"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {expandedId === b.id && (
                          <tr key={`${b.id}-detail`} className="bg-[var(--color-border-light)]">
                            <td colSpan={7} className="p-4">
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                                <div>
                                  <p className="label mb-1">Surgeons</p>
                                  {b.surgeons && b.surgeons.length > 0
                                    ? b.surgeons.map((s, i) => <p key={i} className="font-medium">{s.staff_name}</p>)
                                    : <p className="text-[var(--color-text-muted)]">Not assigned</p>}
                                </div>
                                <div>
                                  <p className="label mb-1">Anesthetist</p>
                                  <p className="font-medium">{b.anesthetist?.staff_name ?? 'Not assigned'}</p>
                                </div>
                                <div>
                                  <p className="label mb-1">Scrub Nurse</p>
                                  <p className="font-medium">{b.scrub_nurse?.staff_name ?? 'Not assigned'}</p>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ─────────────── CREATE BOOKING MODAL ─────────────── */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-modal w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)] sticky top-0 bg-white dark:bg-slate-800">
              <h3 className="font-semibold">Schedule OT Booking</h3>
              <button onClick={() => setShowCreate(false)} className="btn-ghost p-1.5"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Patient ID *</label>
                  <input className="input" type="number" required value={form.patient_id} onChange={e => setForm(f => ({ ...f, patient_id: e.target.value }))} placeholder="e.g. 42" />
                </div>
                <div>
                  <label className="label">Date *</label>
                  <input className="input" type="date" required value={form.booked_for_date} onChange={e => setForm(f => ({ ...f, booked_for_date: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Surgery Type</label>
                  <select className="input" value={form.surgery_type} onChange={e => setForm(f => ({ ...f, surgery_type: e.target.value }))}>
                    <option value="">Select…</option>
                    {SURGERY_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Anesthesia</label>
                  <select className="input" value={form.anesthesia_type} onChange={e => setForm(f => ({ ...f, anesthesia_type: e.target.value }))}>
                    <option value="">Select…</option>
                    {ANESTHESIA_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Diagnosis</label>
                <input className="input" value={form.diagnosis} onChange={e => setForm(f => ({ ...f, diagnosis: e.target.value }))} placeholder="e.g. Acute appendicitis" />
              </div>
              <div>
                <label className="label">Remarks</label>
                <textarea className="input resize-none" rows={2} value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Create Booking'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────── CANCEL MODAL ─────────────── */}
      {cancelTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-modal w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)]">
              <h3 className="font-semibold flex items-center gap-2 text-red-600"><AlertCircle className="w-5 h-5" /> Cancel Booking</h3>
              <button onClick={() => setCancelTarget(null)} className="btn-ghost p-1.5"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCancel} className="p-5 space-y-4">
              <p className="text-sm text-[var(--color-text-secondary)]">
                Cancel OT booking for <span className="font-semibold">{cancelTarget.patient_name}</span> on {cancelTarget.booked_for_date}?
              </p>
              <div>
                <label className="label">Cancellation Reason</label>
                <textarea className="input resize-none" rows={2} value={cancelRemarks} onChange={e => setCancelRemarks(e.target.value)} placeholder="Optional reason…" />
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setCancelTarget(null)} className="btn-secondary">Back</button>
                <button type="submit" disabled={cancelling} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                  {cancelling ? 'Cancelling…' : 'Confirm Cancel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
