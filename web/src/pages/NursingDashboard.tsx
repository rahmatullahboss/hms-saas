import { useState, useEffect, useCallback } from 'react';
import {
  Stethoscope, Plus, X, Search, RefreshCw, Trash2, Edit3,
  ClipboardList, FileText, Pill, Droplets, Activity, Syringe, Heart,
  ArrowRightLeft, Users, ChevronRight, CheckCircle, Clock, AlertCircle,
} from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import DashboardLayout from '../components/DashboardLayout';
import KPICard from '../components/dashboard/KPICard';
import EmptyState from '../components/dashboard/EmptyState';
import { authHeader } from '../utils/auth';
import MARTab from '../components/nursing/MARTab';
import MedicationOrdersTab from '../components/nursing/MedicationOrdersTab';
import ReconciliationTab from '../components/nursing/ReconciliationTab';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Patient {
  patient_id: number;
  patient_code: string;
  name: string;
  gender?: string;
  mobile?: string;
  admission_id: number;
  admission_date: string;
  admission_status: string;
  visit_id?: number;
  doctor_name?: string;
}

interface NursingRecord {
  id: number;
  patient_id: number;
  visit_id?: number;
  created_at: string;
  created_by?: number;
  [key: string]: unknown;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
}

interface OPDVisit {
  id: number;
  patient_id: number;
  patient_name: string;
  patient_code: string;
  doctor_name?: string;
  visit_date: string;
  status: string;
}

// ─── Tab config ───────────────────────────────────────────────────────────────

const TABS = [
  { key: 'overview',           label: 'Overview',       icon: <Users className="w-4 h-4" /> },
  { key: 'care-plan',          label: 'Care Plans',     icon: <ClipboardList className="w-4 h-4" /> },
  { key: 'notes',              label: 'Notes',          icon: <FileText className="w-4 h-4" /> },
  { key: 'mar',                label: 'MAR',            icon: <Pill className="w-4 h-4" /> },
  { key: 'medication-orders',  label: 'Med Orders',     icon: <ClipboardList className="w-4 h-4" /> },
  { key: 'reconciliation',     label: 'Reconciliation', icon: <ArrowRightLeft className="w-4 h-4" /> },
  { key: 'io',                 label: 'I/O Charts',     icon: <Droplets className="w-4 h-4" /> },
  { key: 'monitoring',         label: 'Monitoring',     icon: <Activity className="w-4 h-4" /> },
  { key: 'iv-drugs',           label: 'IV Drugs',       icon: <Syringe className="w-4 h-4" /> },
  { key: 'wound-care',         label: 'Wound Care',     icon: <Heart className="w-4 h-4" /> },
  { key: 'handover',           label: 'Handover',       icon: <ArrowRightLeft className="w-4 h-4" /> },
  { key: 'opd',                label: 'OPD',            icon: <Stethoscope className="w-4 h-4" /> },
] as const;

type TabKey = typeof TABS[number]['key'];

// ─── Field config for CRUD tabs ───────────────────────────────────────────────

interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'textarea' | 'select';
  required?: boolean;
  options?: string[];
  placeholder?: string;
}

const TAB_FIELDS: Record<string, { createFields: FieldDef[]; displayCols: string[] }> = {
  'care-plan': {
    createFields: [
      { key: 'problem', label: 'Problem', type: 'textarea', required: true, placeholder: 'Describe the problem...' },
      { key: 'goal', label: 'Goal', type: 'textarea', placeholder: 'Target outcome...' },
      { key: 'intervention', label: 'Intervention', type: 'textarea', placeholder: 'Planned actions...' },
      { key: 'evaluation', label: 'Evaluation', type: 'textarea', placeholder: 'Assessment...' },
    ],
    displayCols: ['problem', 'goal', 'intervention', 'evaluation'],
  },
  'notes': {
    createFields: [
      { key: 'note_type', label: 'Type', type: 'select', options: ['general', 'assessment', 'progress', 'procedure'], required: true },
      { key: 'content', label: 'Content', type: 'textarea', required: true, placeholder: 'Nursing note...' },
    ],
    displayCols: ['note_type', 'content'],
  },
  'mar': {
    createFields: [
      { key: 'drug_name', label: 'Drug Name', type: 'text', required: true, placeholder: 'e.g. Amoxicillin 500mg' },
      { key: 'dose', label: 'Dose', type: 'text', required: true, placeholder: 'e.g. 500mg' },
      { key: 'route', label: 'Route', type: 'select', options: ['oral', 'iv', 'im', 'sc', 'topical', 'inhalation'], required: true },
      { key: 'frequency', label: 'Frequency', type: 'text', placeholder: 'e.g. TDS, BD' },
      { key: 'administered_at', label: 'Administered At', type: 'text', placeholder: 'Time given' },
      { key: 'status', label: 'Status', type: 'select', options: ['given', 'withheld', 'refused', 'pending'] },
    ],
    displayCols: ['drug_name', 'dose', 'route', 'status'],
  },
  'io': {
    createFields: [
      { key: 'io_type', label: 'Type', type: 'select', options: ['intake', 'output'], required: true },
      { key: 'item_name', label: 'Item', type: 'text', required: true, placeholder: 'e.g. Water, IV Fluid, Urine' },
      { key: 'quantity_ml', label: 'Quantity (ml)', type: 'number', required: true, placeholder: '250' },
      { key: 'remarks', label: 'Remarks', type: 'text', placeholder: 'Notes...' },
    ],
    displayCols: ['io_type', 'item_name', 'quantity_ml', 'remarks'],
  },
  'monitoring': {
    createFields: [
      { key: 'parameter_name', label: 'Parameter', type: 'text', required: true, placeholder: 'e.g. BP, SpO2, GCS' },
      { key: 'value', label: 'Value', type: 'text', required: true, placeholder: 'e.g. 120/80' },
      { key: 'unit', label: 'Unit', type: 'text', placeholder: 'e.g. mmHg, %, bpm' },
      { key: 'remarks', label: 'Remarks', type: 'text', placeholder: 'Any observations...' },
    ],
    displayCols: ['parameter_name', 'value', 'unit', 'remarks'],
  },
  'iv-drugs': {
    createFields: [
      { key: 'drug_name', label: 'Drug Name', type: 'text', required: true, placeholder: 'e.g. Normal Saline' },
      { key: 'dose', label: 'Dose', type: 'text', required: true, placeholder: 'e.g. 1000ml' },
      { key: 'rate', label: 'Rate', type: 'text', placeholder: 'e.g. 100ml/hr' },
      { key: 'started_at', label: 'Started At', type: 'text', placeholder: 'Time started' },
      { key: 'status', label: 'Status', type: 'select', options: ['running', 'completed', 'stopped'] },
    ],
    displayCols: ['drug_name', 'dose', 'rate', 'status'],
  },
  'wound-care': {
    createFields: [
      { key: 'wound_location', label: 'Location', type: 'text', required: true, placeholder: 'e.g. Right leg, abdomen' },
      { key: 'wound_type', label: 'Wound Type', type: 'select', options: ['surgical', 'pressure', 'traumatic', 'burn', 'diabetic', 'other'], required: true },
      { key: 'wound_size', label: 'Size', type: 'text', placeholder: 'e.g. 3x2 cm' },
      { key: 'dressing_type', label: 'Dressing', type: 'text', placeholder: 'e.g. Gauze, hydrocolloid' },
      { key: 'remarks', label: 'Remarks', type: 'textarea', placeholder: 'Condition notes...' },
    ],
    displayCols: ['wound_location', 'wound_type', 'wound_size', 'dressing_type'],
  },
  'handover': {
    createFields: [
      { key: 'shift', label: 'Shift', type: 'select', options: ['morning', 'evening', 'night'], required: true },
      { key: 'given_by', label: 'Given By', type: 'text', placeholder: 'Nurse name' },
      { key: 'taken_by', label: 'Taken By', type: 'text', placeholder: 'Nurse name' },
      { key: 'content', label: 'Handover Notes', type: 'textarea', required: true, placeholder: 'Patient status, pending tasks, concerns...' },
    ],
    displayCols: ['shift', 'given_by', 'taken_by', 'content'],
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function truncate(s: unknown, n = 50): string {
  const str = String(s ?? '');
  return str.length > n ? str.slice(0, n) + '…' : str;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function NursingDashboard({ role = 'hospital_admin' }: { role?: string }) {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [records, setRecords] = useState<NursingRecord[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedPatient, setSelectedPatient] = useState<number | null>(null);

  // OPD state
  const [opdVisits, setOpdVisits] = useState<OPDVisit[]>([]);
  const [opdDates, setOpdDates] = useState({
    from_date: new Date().toISOString().split('T')[0],
    to_date: new Date().toISOString().split('T')[0],
  });

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // ── Fetch patients (overview) ──
  const fetchPatients = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get('/api/nursing/patients', { headers: authHeader() });
      setPatients(data.Results ?? []);
    } catch {
      toast.error('Failed to load patients');
      setPatients([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Fetch CRUD records for a tab ──
  const fetchRecords = useCallback(async (tab: string, page = 1) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: 20 };
      if (selectedPatient) params.patient_id = selectedPatient;
      const { data } = await axios.get(`/api/nursing/${tab}`, { params, headers: authHeader() });
      setRecords(data.Results ?? []);
      setPagination(data.pagination ?? { page, limit: 20, total: data.Results?.length ?? 0 });
    } catch {
      toast.error(`Failed to load ${tab}`);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [selectedPatient]);

  // ── Fetch OPD visits ──
  const fetchOpdVisits = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get('/api/nursing/opd/visits', {
        params: { ...opdDates, limit: 50 },
        headers: authHeader(),
      });
      setOpdVisits(data.Results ?? []);
    } catch {
      toast.error('Failed to load OPD visits');
      setOpdVisits([]);
    } finally {
      setLoading(false);
    }
  }, [opdDates]);

  // ── Tab change handler ──
  // Clinical MAR tabs have their own internal fetching; just ensure patients loaded
  const CLINICAL_TABS = ['mar', 'medication-orders', 'reconciliation'];

  useEffect(() => {
    if (activeTab === 'overview') {
      fetchPatients();
    } else if (activeTab === 'opd') {
      fetchOpdVisits();
    } else if (CLINICAL_TABS.includes(activeTab)) {
      if (patients.length === 0) fetchPatients();
    } else if (TAB_FIELDS[activeTab]) {
      if (patients.length === 0) fetchPatients();
      fetchRecords(activeTab);
    }
  }, [activeTab, fetchPatients, fetchRecords, fetchOpdVisits]);

  // ── CRUD handlers ──
  const handleCreate = () => {
    setEditingId(null);
    setFormData({});
    setShowModal(true);
  };

  const handleEdit = (record: NursingRecord) => {
    setEditingId(record.id);
    const fields = TAB_FIELDS[activeTab]?.createFields ?? [];
    const data: Record<string, string> = {};
    fields.forEach(f => { data[f.key] = String(record[f.key] ?? ''); });
    setFormData(data);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!selectedPatient && activeTab !== 'handover') {
      toast.error('Select a patient first');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      // M4 fix: coerce numeric fields to numbers, keep others as strings
      const fields = TAB_FIELDS[activeTab]?.createFields ?? [];
      for (const [key, val] of Object.entries(formData)) {
        const fieldDef = fields.find(f => f.key === key);
        payload[key] = fieldDef?.type === 'number' && val !== '' ? Number(val) : val;
      }
      if (selectedPatient) payload.patient_id = selectedPatient;
      // Find visit_id from selected patient
      const pt = patients.find(p => p.patient_id === selectedPatient);
      if (pt?.visit_id) payload.visit_id = pt.visit_id;

      if (editingId) {
        await axios.put(`/api/nursing/${activeTab}/${editingId}`, payload, { headers: authHeader() });
        toast.success('Updated successfully');
      } else {
        await axios.post(`/api/nursing/${activeTab}`, payload, { headers: authHeader() });
        toast.success('Created successfully');
      }
      setShowModal(false);
      fetchRecords(activeTab, pagination.page);
    } catch (err) {
      toast.error(axios.isAxiosError(err) ? err.response?.data?.message ?? 'Failed' : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this record?')) return;
    try {
      await axios.delete(`/api/nursing/${activeTab}/${id}`, { headers: authHeader() });
      toast.success('Deleted');
      fetchRecords(activeTab, pagination.page);
    } catch {
      toast.error('Delete failed');
    }
  };

  // ── OPD actions ──
  const handleCheckIn = async (visitId: number) => {
    try {
      await axios.put('/api/nursing/opd/check-in', { visit_id: visitId }, { headers: authHeader() });
      toast.success('Checked in');
      fetchOpdVisits();
    } catch (err) {
      toast.error(axios.isAxiosError(err) ? err.response?.data?.message ?? 'Check-in failed' : 'Check-in failed');
    }
  };

  const handleCheckOut = async (visitId: number) => {
    try {
      await axios.put('/api/nursing/opd/check-out', { visit_id: visitId }, { headers: authHeader() });
      toast.success('Checked out');
      fetchOpdVisits();
    } catch (err) {
      toast.error(axios.isAxiosError(err) ? err.response?.data?.message ?? 'Check-out failed' : 'Check-out failed');
    }
  };

  // ── KPIs ──
  const kpis = [
    { title: 'Admitted Patients', value: patients.length, icon: <Users className="w-5 h-5" />, iconBg: 'bg-blue-50 text-blue-600' },
    { title: 'Critical', value: patients.filter(p => p.admission_status === 'critical').length, icon: <AlertCircle className="w-5 h-5" />, iconBg: 'bg-red-50 text-red-600' },
    { title: 'Active Records', value: records.length > 0 ? pagination.total : '—', icon: <ClipboardList className="w-5 h-5" />, iconBg: 'bg-purple-50 text-purple-600' },
    { title: 'Today\'s OPD', value: opdVisits.length || '—', icon: <Stethoscope className="w-5 h-5" />, iconBg: 'bg-emerald-50 text-emerald-600' },
  ];

  const tabConfig = TAB_FIELDS[activeTab];

  return (
    <DashboardLayout role={role}>
      <div className="space-y-5 max-w-screen-2xl mx-auto">

        {/* ── Header ── */}
        <div className="page-header">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-teal-500/20">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="page-title">Enhanced Nursing</h1>
              <p className="section-subtitle">Care plans, medication, monitoring & more</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeTab !== 'overview' && activeTab !== 'opd' && (
              <button onClick={handleCreate} className="btn-primary">
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New Record</span>
              </button>
            )}
            <button
              onClick={() => {
                if (activeTab === 'overview') fetchPatients();
                else if (activeTab === 'opd') fetchOpdVisits();
                else fetchRecords(activeTab);
              }}
              className="btn-ghost p-2"
              aria-label="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((k, i) => (
            <KPICard key={k.title} title={k.title} value={k.value} icon={k.icon} iconBg={k.iconBg} loading={loading && activeTab === 'overview'} index={i} />
          ))}
        </div>

        {/* ── Tab Bar ── */}
        <div className="card p-1.5 overflow-x-auto">
          <div className="flex gap-1 min-w-max">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'bg-[var(--color-primary)] text-white shadow-sm'
                    : 'hover:bg-[var(--color-border-light)] text-[var(--color-text-secondary)]'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Patient Selector (for CRUD tabs) ── */}
        {activeTab !== 'overview' && activeTab !== 'opd' && (
          <div className="card p-3 flex flex-wrap items-center gap-3">
            <label className="text-sm font-medium text-[var(--color-text-secondary)]">Patient:</label>
            <select
              value={selectedPatient ?? ''}
              onChange={e => {
                const val = e.target.value ? parseInt(e.target.value) : null;
                setSelectedPatient(val);
              }}
              className="input max-w-xs"
            >
              <option value="">All Patients</option>
              {patients.map(p => (
                <option key={p.patient_id} value={p.patient_id}>
                  {p.name} ({p.patient_code})
                </option>
              ))}
            </select>
            {selectedPatient && (
              <button onClick={() => setSelectedPatient(null)} className="btn-ghost text-xs">Clear</button>
            )}
          </div>
        )}

        {/* ────────────── OVERVIEW TAB ────────────── */}
        {activeTab === 'overview' && (
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--color-border)]">
              <h2 className="text-sm font-semibold text-[var(--color-text)]">Admitted Patients</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Code</th>
                    <th>Gender</th>
                    <th>Doctor</th>
                    <th>Admitted</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    [...Array(5)].map((_, i) => (
                      <tr key={i}>
                        {[...Array(6)].map((_, j) => (
                          <td key={j}><div className="skeleton h-4 w-full rounded" /></td>
                        ))}
                      </tr>
                    ))
                  ) : patients.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <EmptyState
                          icon={<Users className="w-8 h-8 text-[var(--color-text-muted)]" />}
                          title="No admitted patients"
                          description="No patients currently admitted."
                        />
                      </td>
                    </tr>
                  ) : (
                    patients.map(p => (
                      <tr key={p.admission_id}>
                        <td className="font-medium">{p.name}</td>
                        <td className="font-data text-sm">{p.patient_code}</td>
                        <td className="text-[var(--color-text-secondary)]">{p.gender || '—'}</td>
                        <td className="text-[var(--color-text-secondary)]">{p.doctor_name || '—'}</td>
                        <td className="font-data text-sm text-[var(--color-text-secondary)]">
                          {p.admission_date ? new Date(p.admission_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                        </td>
                        <td>
                          <span className={`badge ${p.admission_status === 'critical' ? 'badge-error' : 'badge-success'}`}>
                            {p.admission_status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Clinical MAR Tab ── */}
        {activeTab === 'mar' && (
          <MARTab
            patients={patients}
            selectedPatient={selectedPatient}
            onSelectPatient={setSelectedPatient}
          />
        )}

        {/* ── Medication Orders Tab ── */}
        {activeTab === 'medication-orders' && (
          <MedicationOrdersTab
            patients={patients}
            selectedPatient={selectedPatient}
            onSelectPatient={setSelectedPatient}
          />
        )}

        {/* ── Reconciliation Tab ── */}
        {activeTab === 'reconciliation' && (
          <ReconciliationTab
            patients={patients}
            selectedPatient={selectedPatient}
            onSelectPatient={setSelectedPatient}
          />
        )}

        {/* ────────────── CRUD TABS (care-plan, notes, io, monitoring, iv-drugs, wound-care, handover) ────────────── */}
        {tabConfig && activeTab !== 'mar' && (
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--color-text)]">
                {TABS.find(t => t.key === activeTab)?.label} Records
                {pagination.total > 0 && <span className="ml-2 text-[var(--color-text-muted)] font-normal">({pagination.total})</span>}
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>#</th>
                    {tabConfig.displayCols.map(col => (
                      <th key={col} className="capitalize">{col.replace(/_/g, ' ')}</th>
                    ))}
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    [...Array(5)].map((_, i) => (
                      <tr key={i}>
                        {[...Array(tabConfig.displayCols.length + 3)].map((_, j) => (
                          <td key={j}><div className="skeleton h-4 w-full rounded" /></td>
                        ))}
                      </tr>
                    ))
                  ) : records.length === 0 ? (
                    <tr>
                      <td colSpan={tabConfig.displayCols.length + 3}>
                        <EmptyState
                          icon={<ClipboardList className="w-8 h-8 text-[var(--color-text-muted)]" />}
                          title="No records found"
                          description="Create your first record using the button above."
                          action={
                            <button onClick={handleCreate} className="btn-primary mt-2">
                              <Plus className="w-4 h-4" /> Add Record
                            </button>
                          }
                        />
                      </td>
                    </tr>
                  ) : (
                    records.map((r, idx) => (
                      <tr key={r.id}>
                        <td className="font-data text-sm text-[var(--color-text-muted)]">{(pagination.page - 1) * pagination.limit + idx + 1}</td>
                        {tabConfig.displayCols.map(col => (
                          <td key={col} className="text-sm max-w-48 truncate">{truncate(r[col])}</td>
                        ))}
                        <td className="font-data text-xs text-[var(--color-text-muted)]">
                          {r.created_at ? timeAgo(r.created_at) : '—'}
                        </td>
                        <td>
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleEdit(r)} className="btn-ghost p-1.5 text-blue-600" title="Edit">
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDelete(r.id)} className="btn-ghost p-1.5 text-red-600" title="Delete">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.total > pagination.limit && (
              <div className="px-4 py-3 border-t border-[var(--color-border)] flex items-center justify-between text-sm">
                <span className="text-[var(--color-text-muted)]">
                  Page {pagination.page} of {Math.ceil(pagination.total / pagination.limit)}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => fetchRecords(activeTab, pagination.page - 1)}
                    disabled={pagination.page <= 1}
                    className="btn-secondary text-xs"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => fetchRecords(activeTab, pagination.page + 1)}
                    disabled={pagination.page >= Math.ceil(pagination.total / pagination.limit)}
                    className="btn-secondary text-xs"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ────────────── OPD TAB ────────────── */}
        {activeTab === 'opd' && (
          <div className="space-y-4">
            {/* Date filter */}
            <div className="card p-3 flex flex-wrap items-center gap-3">
              <label className="text-sm font-medium text-[var(--color-text-secondary)]">From:</label>
              <input
                type="date"
                value={opdDates.from_date}
                onChange={e => setOpdDates(d => ({ ...d, from_date: e.target.value }))}
                className="input max-w-40"
              />
              <label className="text-sm font-medium text-[var(--color-text-secondary)]">To:</label>
              <input
                type="date"
                value={opdDates.to_date}
                onChange={e => setOpdDates(d => ({ ...d, to_date: e.target.value }))}
                className="input max-w-40"
              />
              <button onClick={fetchOpdVisits} className="btn-secondary">
                <Search className="w-4 h-4" /> Search
              </button>
            </div>

            {/* OPD Table */}
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--color-border)]">
                <h2 className="text-sm font-semibold text-[var(--color-text)]">OPD Visits</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Patient</th>
                      <th>Code</th>
                      <th>Doctor</th>
                      <th>Visit Date</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      [...Array(5)].map((_, i) => (
                        <tr key={i}>
                          {[...Array(6)].map((_, j) => (
                            <td key={j}><div className="skeleton h-4 w-full rounded" /></td>
                          ))}
                        </tr>
                      ))
                    ) : opdVisits.length === 0 ? (
                      <tr>
                        <td colSpan={6}>
                          <EmptyState
                            icon={<Stethoscope className="w-8 h-8 text-[var(--color-text-muted)]" />}
                            title="No OPD visits"
                            description="No visits found for the selected date range."
                          />
                        </td>
                      </tr>
                    ) : (
                      opdVisits.map(v => (
                        <tr key={v.id}>
                          <td className="font-medium">{v.patient_name}</td>
                          <td className="font-data text-sm">{v.patient_code}</td>
                          <td className="text-[var(--color-text-secondary)]">{v.doctor_name || '—'}</td>
                          <td className="font-data text-sm text-[var(--color-text-secondary)]">
                            {v.visit_date ? new Date(v.visit_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}
                          </td>
                          <td>
                            <span className={`badge ${
                              v.status === 'checked-in' ? 'badge-success' :
                              v.status === 'concluded' ? 'badge-info' :
                              v.status === 'initiated' ? 'badge-warning' :
                              'badge-primary'
                            }`}>
                              {v.status}
                            </span>
                          </td>
                          <td>
                            <div className="flex items-center gap-1">
                              {v.status === 'initiated' && (
                                <button
                                  onClick={() => handleCheckIn(v.id)}
                                  className="btn-ghost p-1.5 text-emerald-600 text-xs"
                                  title="Check In"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </button>
                              )}
                              {v.status === 'checked-in' && (
                                <button
                                  onClick={() => handleCheckOut(v.id)}
                                  className="btn-ghost p-1.5 text-blue-600 text-xs"
                                  title="Check Out"
                                >
                                  <Clock className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ────────────── CREATE/EDIT MODAL ────────────── */}
      {showModal && tabConfig && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-modal w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)] sticky top-0 bg-white dark:bg-slate-800">
              <h3 className="font-semibold">
                {editingId ? 'Edit' : 'New'} {TABS.find(t => t.key === activeTab)?.label} Record
              </h3>
              <button onClick={() => setShowModal(false)} className="btn-ghost p-1.5">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Patient selector in modal */}
              <div>
                <label className="label">Patient *</label>
                <select
                  value={selectedPatient ?? ''}
                  onChange={e => setSelectedPatient(parseInt(e.target.value) || null)}
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

              {/* Dynamic fields */}
              {tabConfig.createFields.map(field => (
                <div key={field.key}>
                  <label className="label">{field.label} {field.required && '*'}</label>
                  {field.type === 'textarea' ? (
                    <textarea
                      value={formData[field.key] ?? ''}
                      onChange={e => setFormData(f => ({ ...f, [field.key]: e.target.value }))}
                      rows={3}
                      placeholder={field.placeholder}
                      className="input resize-none"
                      required={field.required}
                    />
                  ) : field.type === 'select' ? (
                    <select
                      value={formData[field.key] ?? ''}
                      onChange={e => setFormData(f => ({ ...f, [field.key]: e.target.value }))}
                      className="input"
                      required={field.required}
                    >
                      <option value="">Select…</option>
                      {field.options?.map(o => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.type}
                      value={formData[field.key] ?? ''}
                      onChange={e => setFormData(f => ({ ...f, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      className="input"
                      required={field.required}
                    />
                  )}
                </div>
              ))}

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !selectedPatient}
                  className="btn-primary"
                >
                  {saving ? 'Saving…' : editingId ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
