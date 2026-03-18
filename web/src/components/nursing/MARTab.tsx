import { useState, useEffect, useCallback } from 'react';
import {
  Pill, Plus, X, CheckCircle, XCircle, Clock, AlertTriangle,
  RefreshCw, ChevronDown, BarChart2, Calendar,
} from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { authHeader } from '../../utils/auth';
import EmptyState from '../dashboard/EmptyState';

// ─── Types ───────────────────────────────────────────────────────────────────

interface MAREntry {
  id: number;
  patient_id: number;
  visit_id?: number;
  medication_name: string;
  dose?: string;
  route?: string;
  frequency?: string;
  scheduled_time?: string;
  actual_time?: string;
  administered_on?: string;
  status?: string;
  reason_not_given?: string;
  remarks?: string;
  order_id?: number;
  formulary_item_id?: number;
  generic_name?: string;
  strength?: string;
  formulary_name?: string;
  order_status?: string;
  order_priority?: string;
  created_at: string;
}

interface MARStats {
  total: number;
  given_count: number;
  withheld_count: number;
  refused_count: number;
  not_given_count: number;
  pending_count: number;
}

interface Patient {
  patient_id: number;
  patient_code: string;
  name: string;
  visit_id?: number;
}

interface MARTabProps {
  patients: Patient[];
  selectedPatient: number | null;
  onSelectPatient: (id: number | null) => void;
}

// ─── Status badge helper ──────────────────────────────────────────────────────

function StatusBadge({ status }: { status?: string }) {
  const map: Record<string, string> = {
    given: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    withheld: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    refused: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    not_given: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
  };
  const s = status ?? 'pending';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${map[s] ?? 'bg-slate-100 text-slate-500'}`}>
      {s === 'given' && <CheckCircle className="w-3 h-3" />}
      {s === 'withheld' && <AlertTriangle className="w-3 h-3" />}
      {s === 'refused' && <XCircle className="w-3 h-3" />}
      {(!s || s === 'not_given') && <Clock className="w-3 h-3" />}
      {s.replace(/_/g, ' ')}
    </span>
  );
}

// ─── Administer Modal ─────────────────────────────────────────────────────────

function AdministerModal({
  entry,
  onClose,
  onDone,
}: {
  entry: MAREntry;
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    status: 'given' as string,
    actual_time: new Date().toISOString().slice(0, 16),
    reason_not_given: '',
    remarks: '',
    barcode_scanned: 0,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.post(`/api/nursing/mar/${entry.id}/administer`, {
        ...form,
        actual_time: form.actual_time ? new Date(form.actual_time).toISOString() : undefined,
      }, { headers: authHeader() });
      toast.success('Administration recorded');
      onDone();
      onClose();
    } catch (err) {
      toast.error(axios.isAxiosError(err) ? err.response?.data?.message ?? 'Failed' : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-modal w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)]">
          <div>
            <h3 className="font-semibold">Record Administration</h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              {entry.medication_name} {entry.dose && `· ${entry.dose}`} {entry.route && `· ${entry.route}`}
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Status */}
          <div>
            <label className="label">Status *</label>
            <div className="grid grid-cols-2 gap-2">
              {(['given', 'withheld', 'refused', 'not_given'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setForm(f => ({ ...f, status: s }))}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    form.status === s
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                      : 'border-[var(--color-border)] hover:border-[var(--color-primary)] text-[var(--color-text-secondary)]'
                  }`}
                >
                  {s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </button>
              ))}
            </div>
          </div>

          {/* Actual time */}
          <div>
            <label className="label">Actual Time</label>
            <input
              type="datetime-local"
              value={form.actual_time}
              onChange={e => setForm(f => ({ ...f, actual_time: e.target.value }))}
              className="input"
            />
          </div>

          {/* Reason (if not given / withheld / refused) */}
          {form.status !== 'given' && (
            <div>
              <label className="label">Reason *</label>
              <input
                type="text"
                value={form.reason_not_given}
                onChange={e => setForm(f => ({ ...f, reason_not_given: e.target.value }))}
                placeholder="e.g. Patient refused, nausea, NPO..."
                className="input"
              />
            </div>
          )}

          {/* Remarks */}
          <div>
            <label className="label">Remarks</label>
            <input
              type="text"
              value={form.remarks}
              onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
              placeholder="Optional clinical notes..."
              className="input"
            />
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button onClick={onClose} className="btn-secondary">Cancel</button>
            <button
              onClick={handleSave}
              disabled={saving || (form.status !== 'given' && !form.reason_not_given)}
              className="btn-primary"
            >
              {saving ? 'Recording…' : 'Record'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── New MAR Entry Modal ──────────────────────────────────────────────────────

function NewMARModal({
  patients,
  selectedPatient,
  onClose,
  onDone,
}: {
  patients: Patient[];
  selectedPatient: number | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    patient_id: selectedPatient ? String(selectedPatient) : '',
    medication_name: '',
    generic_name: '',
    dose: '',
    route: 'Oral',
    frequency: '',
    scheduled_time: '',
    remarks: '',
    status: 'given',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.patient_id || !form.medication_name) {
      toast.error('Patient and medication name are required');
      return;
    }
    setSaving(true);
    try {
      const pt = patients.find(p => p.patient_id === parseInt(form.patient_id));
      await axios.post('/api/nursing/mar', {
        patient_id: parseInt(form.patient_id),
        visit_id: pt?.visit_id,
        medication_name: form.medication_name,
        generic_name: form.generic_name || undefined,
        dose: form.dose || undefined,
        route: form.route || undefined,
        frequency: form.frequency || undefined,
        scheduled_time: form.scheduled_time ? new Date(form.scheduled_time).toISOString() : undefined,
        remarks: form.remarks || undefined,
        status: form.status,
      }, { headers: authHeader() });
      toast.success('MAR entry created');
      onDone();
      onClose();
    } catch (err) {
      toast.error(axios.isAxiosError(err) ? err.response?.data?.message ?? 'Failed' : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-modal w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)] sticky top-0 bg-white dark:bg-slate-800">
          <h3 className="font-semibold">New MAR Entry</h3>
          <button onClick={onClose} className="btn-ghost p-1.5"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="label">Patient *</label>
            <select
              value={form.patient_id}
              onChange={e => setForm(f => ({ ...f, patient_id: e.target.value }))}
              className="input"
              required
            >
              <option value="">Select patient</option>
              {patients.map(p => (
                <option key={p.patient_id} value={p.patient_id}>
                  {p.name} ({p.patient_code})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Medication Name *</label>
              <input
                type="text"
                value={form.medication_name}
                onChange={e => setForm(f => ({ ...f, medication_name: e.target.value }))}
                placeholder="e.g. Amoxicillin 500mg"
                className="input"
                required
              />
            </div>
            <div>
              <label className="label">Generic Name</label>
              <input
                type="text"
                value={form.generic_name}
                onChange={e => setForm(f => ({ ...f, generic_name: e.target.value }))}
                placeholder="e.g. Amoxicillin"
                className="input"
              />
            </div>
            <div>
              <label className="label">Dose</label>
              <input
                type="text"
                value={form.dose}
                onChange={e => setForm(f => ({ ...f, dose: e.target.value }))}
                placeholder="e.g. 500mg"
                className="input"
              />
            </div>
            <div>
              <label className="label">Route</label>
              <select
                value={form.route}
                onChange={e => setForm(f => ({ ...f, route: e.target.value }))}
                className="input"
              >
                {['Oral', 'IV', 'IM', 'SC', 'Topical', 'Inhalation', 'Sublingual', 'Rectal'].map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Frequency</label>
              <input
                type="text"
                value={form.frequency}
                onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}
                placeholder="e.g. TDS, BD, OD"
                className="input"
              />
            </div>
            <div className="col-span-2">
              <label className="label">Scheduled Time</label>
              <input
                type="datetime-local"
                value={form.scheduled_time}
                onChange={e => setForm(f => ({ ...f, scheduled_time: e.target.value }))}
                className="input"
              />
            </div>
            <div>
              <label className="label">Status</label>
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                className="input"
              >
                {['given', 'withheld', 'refused', 'not_given'].map(s => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Remarks</label>
              <input
                type="text"
                value={form.remarks}
                onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
                placeholder="Optional notes"
                className="input"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button onClick={onClose} className="btn-secondary">Cancel</button>
            <button
              onClick={handleSave}
              disabled={saving || !form.patient_id || !form.medication_name}
              className="btn-primary"
            >
              {saving ? 'Saving…' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main MARTab ──────────────────────────────────────────────────────────────

export default function MARTab({ patients, selectedPatient, onSelectPatient }: MARTabProps) {
  const [entries, setEntries] = useState<MAREntry[]>([]);
  const [stats, setStats] = useState<MARStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [viewMode, setViewMode] = useState<'list' | 'schedule'>('list');
  const [adminEntry, setAdminEntry] = useState<MAREntry | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchEntries = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page: p, limit: 20 };
      if (selectedPatient) params.patient_id = selectedPatient;
      const { data } = await axios.get('/api/nursing/mar', { params, headers: authHeader() });
      setEntries(data.Results ?? []);
      setTotal(data.pagination?.total ?? 0);
      setPage(p);
    } catch {
      toast.error('Failed to load MAR');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [selectedPatient]);

  const fetchStats = useCallback(async () => {
    if (!selectedPatient) return;
    try {
      const { data } = await axios.get('/api/nursing/mar/stats', {
        params: { patient_id: selectedPatient, date },
        headers: authHeader(),
      });
      setStats(data.Results ?? null);
    } catch {
      setStats(null);
    }
  }, [selectedPatient, date]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);
  useEffect(() => { if (selectedPatient) fetchStats(); }, [fetchStats, selectedPatient]);

  const complianceRate = stats && stats.total > 0
    ? Math.round((stats.given_count / stats.total) * 100)
    : null;

  return (
    <div className="space-y-4">
      {/* ── Toolbar ── */}
      <div className="card p-3 flex flex-wrap items-center gap-3">
        {/* Patient selector */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-[var(--color-text-secondary)]">Patient:</label>
          <select
            value={selectedPatient ?? ''}
            onChange={e => onSelectPatient(e.target.value ? parseInt(e.target.value) : null)}
            className="input max-w-xs"
          >
            <option value="">All Patients</option>
            {patients.map(p => (
              <option key={p.patient_id} value={p.patient_id}>
                {p.name} ({p.patient_code})
              </option>
            ))}
          </select>
        </div>

        {/* Date picker */}
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[var(--color-text-muted)]" />
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="input max-w-40"
          />
        </div>

        {/* View toggle */}
        <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden">
          {(['list', 'schedule'] as const).map(v => (
            <button
              key={v}
              onClick={() => setViewMode(v)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === v
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'hover:bg-[var(--color-border-light)] text-[var(--color-text-secondary)]'
              }`}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => fetchEntries(page)} className="btn-ghost p-2" aria-label="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => setShowNewModal(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> New Entry
          </button>
        </div>
      </div>

      {/* ── Stats cards (when patient selected) ── */}
      {selectedPatient && stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Total', value: stats.total, color: 'text-[var(--color-text)]' },
            { label: 'Given', value: stats.given_count, color: 'text-emerald-600' },
            { label: 'Withheld', value: stats.withheld_count, color: 'text-amber-600' },
            { label: 'Refused', value: stats.refused_count, color: 'text-red-600' },
            { label: 'Not Given', value: stats.not_given_count, color: 'text-slate-500' },
            { label: 'Compliance', value: complianceRate != null ? `${complianceRate}%` : '—', color: complianceRate != null && complianceRate >= 80 ? 'text-emerald-600' : 'text-amber-600' },
          ].map(s => (
            <div key={s.label} className="card p-3 text-center">
              <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-[var(--color-text-muted)] mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Compliance bar (when patient selected) ── */}
      {selectedPatient && complianceRate != null && (
        <div className="card p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-[var(--color-text-secondary)] flex items-center gap-1">
              <BarChart2 className="w-3.5 h-3.5" /> Compliance Rate — {date}
            </span>
            <span className={`text-xs font-bold ${complianceRate >= 80 ? 'text-emerald-600' : 'text-amber-600'}`}>
              {complianceRate}%
            </span>
          </div>
          <div className="w-full bg-[var(--color-border-light)] rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${complianceRate >= 80 ? 'bg-emerald-500' : 'bg-amber-500'}`}
              style={{ width: `${complianceRate}%` }}
            />
          </div>
        </div>
      )}

      {/* ── MAR Table ── */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">
            Medication Administration Records
            {total > 0 && <span className="ml-2 text-[var(--color-text-muted)] font-normal">({total})</span>}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>#</th>
                <th>Medication</th>
                <th>Dose / Route</th>
                <th>Frequency</th>
                <th>Scheduled</th>
                <th>Actual</th>
                <th>Status</th>
                <th>Reason</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(9)].map((_, j) => (
                      <td key={j}><div className="skeleton h-4 w-full rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <EmptyState
                      icon={<Pill className="w-8 h-8 text-[var(--color-text-muted)]" />}
                      title="No MAR entries"
                      description="No medication administrations recorded yet."
                      action={
                        <button onClick={() => setShowNewModal(true)} className="btn-primary mt-2">
                          <Plus className="w-4 h-4" /> Add Entry
                        </button>
                      }
                    />
                  </td>
                </tr>
              ) : (
                entries.map((entry, idx) => (
                  <tr key={entry.id} className="hover:bg-[var(--color-surface-hover)]">
                    <td className="font-data text-sm text-[var(--color-text-muted)]">
                      {(page - 1) * 20 + idx + 1}
                    </td>
                    <td>
                      <div className="font-medium text-sm">{entry.medication_name}</div>
                      {entry.generic_name && (
                        <div className="text-xs text-[var(--color-text-muted)]">{entry.generic_name}</div>
                      )}
                    </td>
                    <td className="text-sm">
                      {entry.dose || '—'}
                      {entry.route && <span className="text-[var(--color-text-muted)]"> · {entry.route}</span>}
                    </td>
                    <td className="text-sm text-[var(--color-text-secondary)]">{entry.frequency || '—'}</td>
                    <td className="font-data text-xs text-[var(--color-text-secondary)]">
                      {entry.scheduled_time
                        ? new Date(entry.scheduled_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </td>
                    <td className="font-data text-xs text-[var(--color-text-secondary)]">
                      {entry.actual_time
                        ? new Date(entry.actual_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </td>
                    <td><StatusBadge status={entry.status} /></td>
                    <td className="text-xs text-[var(--color-text-muted)] max-w-32 truncate">
                      {entry.reason_not_given || entry.remarks || '—'}
                    </td>
                    <td>
                      <button
                        onClick={() => setAdminEntry(entry)}
                        className="btn-ghost p-1.5 text-teal-600 text-xs whitespace-nowrap"
                        title="Record Administration"
                      >
                        <CheckCircle className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > 20 && (
          <div className="px-4 py-3 border-t border-[var(--color-border)] flex items-center justify-between text-sm">
            <span className="text-[var(--color-text-muted)]">
              Page {page} of {Math.ceil(total / 20)}
            </span>
            <div className="flex gap-2">
              <button onClick={() => fetchEntries(page - 1)} disabled={page <= 1} className="btn-secondary text-xs">Previous</button>
              <button onClick={() => fetchEntries(page + 1)} disabled={page >= Math.ceil(total / 20)} className="btn-secondary text-xs">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {adminEntry && (
        <AdministerModal
          entry={adminEntry}
          onClose={() => setAdminEntry(null)}
          onDone={() => { fetchEntries(page); fetchStats(); }}
        />
      )}
      {showNewModal && (
        <NewMARModal
          patients={patients}
          selectedPatient={selectedPatient}
          onClose={() => setShowNewModal(false)}
          onDone={() => fetchEntries(page)}
        />
      )}
    </div>
  );
}
