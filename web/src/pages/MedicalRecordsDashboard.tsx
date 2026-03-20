import { useState, useEffect, useCallback } from 'react';
import {
  FileText, Search, Plus, Baby, Heart, X, BookOpen, Activity,
  RefreshCw, ChevronRight, ArrowUpRight,
} from 'lucide-react';
import axios, { AxiosError } from 'axios';
import toast from 'react-hot-toast';
import DashboardLayout from '../components/DashboardLayout';
import KPICard from '../components/dashboard/KPICard';
import HelpButton from '../components/HelpButton';
import HelpPanel from '../components/HelpPanel';
import { authHeader } from '../utils/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Stats {
  total_records: number;
  total_births: number;
  total_deaths: number;
  total_diagnoses: number;
  total_referrals: number;
}

interface MedicalRecord {
  id: number;
  patientId: number;
  patientName: string;
  visitId?: number;
  fileNumber?: string;
  dischargeType?: string;
  dischargeCondition?: string;
  isOperationConducted?: number;
  referredTo?: string;
  referredDate?: string;
  remarks?: string;
  createdAt: string;
}

interface BirthRecord {
  id: number;
  certificateNumber?: string;
  babyName?: string;
  sex?: string;
  weightKg?: number;
  birthDate: string;
  birthTime?: string;
  birthType?: string;
  birthCondition?: string;
  deliveryType?: string;
  fatherName?: string;
  motherName?: string;
  patientId: number;
  patientName?: string;
  printCount: number;
  createdAt: string;
}

interface DeathRecord {
  id: number;
  certificateNumber?: string;
  deathDate: string;
  deathTime?: string;
  causeOfDeath?: string;
  mannerOfDeath?: string;
  placeOfDeath?: string;
  ageAtDeath?: string;
  patientId: number;
  patientName?: string;
  printCount: number;
  createdAt: string;
}

interface Icd10Code {
  id: number;
  code: string;
  description: string;
  diseaseGroupId?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Badge({ text, color = 'gray' }: { text: string; color?: string }) {
  const map: Record<string, string> = {
    normal: 'bg-green-50 text-green-700 border-green-200',
    lama: 'bg-red-50 text-red-700 border-red-200',
    absconded: 'bg-orange-50 text-orange-700 border-orange-200',
    referred: 'bg-amber-50 text-amber-700 border-amber-200',
    expired: 'bg-slate-100 text-slate-700 border-slate-200',
    gray: 'bg-gray-100 text-gray-600 border-gray-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${map[text?.toLowerCase()] ?? map[color]}`}>
      {text ?? '—'}
    </span>
  );
}

type TabKey = 'records' | 'births' | 'deaths' | 'icd10' | 'referrals';

const TABS: { key: TabKey; label: string; icon: typeof FileText }[] = [
  { key: 'records', label: 'Medical Records', icon: FileText },
  { key: 'births', label: 'Birth Register', icon: Baby },
  { key: 'deaths', label: 'Death Register', icon: Heart },
  { key: 'icd10', label: 'ICD-10 Browser', icon: BookOpen },
  { key: 'referrals', label: 'Referrals', icon: ArrowUpRight },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function MedicalRecordsDashboard({ role = 'hospital_admin' }: { role?: string }) {
  const [activeTab, setActiveTab] = useState<TabKey>('records');
  const [stats, setStats] = useState<Stats>({ total_records: 0, total_births: 0, total_deaths: 0, total_diagnoses: 0, total_referrals: 0 });
  const [statsLoading, setStatsLoading] = useState(true);

  // ── Records state
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordSearch, setRecordSearch] = useState('');
  const [recordPage, setRecordPage] = useState(1);
  const [recordTotal, setRecordTotal] = useState(0);

  // ── Birth state
  const [births, setBirths] = useState<BirthRecord[]>([]);
  const [birthsLoading, setBirthsLoading] = useState(false);
  const [birthFromDate, setBirthFromDate] = useState('');
  const [birthToDate, setBirthToDate] = useState('');
  const [birthTotal, setBirthTotal] = useState(0);

  // ── Death state
  const [deaths, setDeaths] = useState<DeathRecord[]>([]);
  const [deathsLoading, setDeathsLoading] = useState(false);
  const [deathFromDate, setDeathFromDate] = useState('');
  const [deathToDate, setDeathToDate] = useState('');
  const [deathTotal, setDeathTotal] = useState(0);

  // ── ICD-10 state
  const [icdCodes, setIcdCodes] = useState<Icd10Code[]>([]);
  const [icdLoading, setIcdLoading] = useState(false);
  const [icdSearch, setIcdSearch] = useState('');

  // ── Referrals state
  const [referrals, setReferrals] = useState<MedicalRecord[]>([]);
  const [referralsLoading, setReferralsLoading] = useState(false);
  const [referralPage, setReferralPage] = useState(1);
  const [referralTotal, setReferralTotal] = useState(0);

  // ── New Record modal
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [recordForm, setRecordForm] = useState({
    patient_id: '', file_number: '', discharge_type: '', discharge_condition: '',
    is_operation_conducted: false, operation_date: '', operation_diagnosis: '',
    referred_to: '', referred_date: '', referred_reason: '', remarks: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // ── New Birth modal
  const [showBirthModal, setShowBirthModal] = useState(false);
  const [birthForm, setBirthForm] = useState({
    patient_id: '', baby_name: '', sex: '', birth_date: '', birth_time: '',
    birth_type: '', birth_condition: '', delivery_type: '',
    weight_kg: '', father_name: '', mother_name: '', issued_by: '', certified_by: '',
  });

  // ── New Death modal
  const [showDeathModal, setShowDeathModal] = useState(false);
  const [deathForm, setDeathForm] = useState({
    patient_id: '', death_date: '', death_time: '', cause_of_death: '',
    secondary_cause: '', manner_of_death: '', place_of_death: '',
    age_at_death: '', father_name: '', mother_name: '', spouse_name: '', certified_by: '',
  });

  const getHeaders = () => authHeader();

  // ── Fetch stats
  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const { data } = await axios.get('/api/medical-records/stats', { headers: getHeaders() });
      setStats(data);
    } catch { /* ignore */ }
    setStatsLoading(false);
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  // ── Tab-specific fetching
  useEffect(() => {
    if (activeTab === 'records') fetchRecords();
    else if (activeTab === 'births') fetchBirths();
    else if (activeTab === 'deaths') fetchDeaths();
    else if (activeTab === 'icd10') fetchIcd10();
    else if (activeTab === 'referrals') fetchReferrals();
  }, [activeTab]);

  // ── Records
  const fetchRecords = async () => {
    setRecordsLoading(true);
    try {
      const { data } = await axios.get('/api/medical-records', {
        headers: getHeaders(),
        params: { page: recordPage, limit: 20, search: recordSearch || undefined },
      });
      setRecords(data.records ?? []);
      setRecordTotal(data.meta?.total ?? 0);
    } catch { setRecords([]); }
    setRecordsLoading(false);
  };

  useEffect(() => {
    if (activeTab !== 'records') return;
    const t = setTimeout(() => fetchRecords(), 400);
    return () => clearTimeout(t);
  }, [recordSearch, recordPage]);

  const submitRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recordForm.patient_id) return toast.error('Patient ID required');
    setSubmitting(true);
    try {
      await axios.post('/api/medical-records', {
        patient_id: parseInt(recordForm.patient_id),
        file_number: recordForm.file_number || undefined,
        discharge_type: recordForm.discharge_type || undefined,
        discharge_condition: recordForm.discharge_condition || undefined,
        is_operation_conducted: recordForm.is_operation_conducted,
        operation_date: recordForm.operation_date || undefined,
        operation_diagnosis: recordForm.operation_diagnosis || undefined,
        referred_to: recordForm.referred_to || undefined,
        referred_date: recordForm.referred_date || undefined,
        referred_reason: recordForm.referred_reason || undefined,
        remarks: recordForm.remarks || undefined,
      }, { headers: getHeaders() });
      toast.success('Medical record created');
      setShowRecordModal(false);
      setRecordForm({ patient_id: '', file_number: '', discharge_type: '', discharge_condition: '', is_operation_conducted: false, operation_date: '', operation_diagnosis: '', referred_to: '', referred_date: '', referred_reason: '', remarks: '' });
      fetchRecords();
      fetchStats();
    } catch (err) {
      const msg = err instanceof AxiosError ? err.response?.data?.error : 'Failed to create record';
      toast.error(msg || 'Failed to create record');
    }
    setSubmitting(false);
  };

  // ── Births
  const fetchBirths = async () => {
    setBirthsLoading(true);
    try {
      const { data } = await axios.get('/api/medical-records/births', {
        headers: getHeaders(),
        params: { limit: 20, from_date: birthFromDate || undefined, to_date: birthToDate || undefined },
      });
      setBirths(data.births ?? []);
      setBirthTotal(data.meta?.total ?? 0);
    } catch { setBirths([]); }
    setBirthsLoading(false);
  };

  const submitBirth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!birthForm.patient_id || !birthForm.birth_date) return toast.error('Patient ID and birth date required');
    setSubmitting(true);
    try {
      await axios.post('/api/medical-records/births', {
        patient_id: parseInt(birthForm.patient_id),
        baby_name: birthForm.baby_name || undefined,
        sex: birthForm.sex || undefined,
        birth_date: birthForm.birth_date,
        birth_time: birthForm.birth_time || undefined,
        birth_type: birthForm.birth_type || undefined,
        birth_condition: birthForm.birth_condition || undefined,
        delivery_type: birthForm.delivery_type || undefined,
        weight_kg: birthForm.weight_kg ? parseFloat(birthForm.weight_kg) : undefined,
        father_name: birthForm.father_name || undefined,
        mother_name: birthForm.mother_name || undefined,
        issued_by: birthForm.issued_by || undefined,
        certified_by: birthForm.certified_by || undefined,
      }, { headers: getHeaders() });
      toast.success('Birth record created');
      setShowBirthModal(false);
      setBirthForm({ patient_id: '', baby_name: '', sex: '', birth_date: '', birth_time: '', birth_type: '', birth_condition: '', delivery_type: '', weight_kg: '', father_name: '', mother_name: '', issued_by: '', certified_by: '' });
      fetchBirths();
      fetchStats();
    } catch (err) {
      const msg = err instanceof AxiosError ? err.response?.data?.error : 'Failed to create birth record';
      toast.error(msg || 'Failed to create birth record');
    }
    setSubmitting(false);
  };

  // ── Deaths
  const fetchDeaths = async () => {
    setDeathsLoading(true);
    try {
      const { data } = await axios.get('/api/medical-records/deaths', {
        headers: getHeaders(),
        params: { limit: 20, from_date: deathFromDate || undefined, to_date: deathToDate || undefined },
      });
      setDeaths(data.deaths ?? []);
      setDeathTotal(data.meta?.total ?? 0);
    } catch { setDeaths([]); }
    setDeathsLoading(false);
  };

  const submitDeath = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deathForm.patient_id || !deathForm.death_date) return toast.error('Patient ID and death date required');
    setSubmitting(true);
    try {
      await axios.post('/api/medical-records/deaths', {
        patient_id: parseInt(deathForm.patient_id),
        death_date: deathForm.death_date,
        death_time: deathForm.death_time || undefined,
        cause_of_death: deathForm.cause_of_death || undefined,
        secondary_cause: deathForm.secondary_cause || undefined,
        manner_of_death: deathForm.manner_of_death || undefined,
        place_of_death: deathForm.place_of_death || undefined,
        age_at_death: deathForm.age_at_death || undefined,
        father_name: deathForm.father_name || undefined,
        mother_name: deathForm.mother_name || undefined,
        spouse_name: deathForm.spouse_name || undefined,
        certified_by: deathForm.certified_by || undefined,
      }, { headers: getHeaders() });
      toast.success('Death record created');
      setShowDeathModal(false);
      setDeathForm({ patient_id: '', death_date: '', death_time: '', cause_of_death: '', secondary_cause: '', manner_of_death: '', place_of_death: '', age_at_death: '', father_name: '', mother_name: '', spouse_name: '', certified_by: '' });
      fetchDeaths();
      fetchStats();
    } catch (err) {
      const msg = err instanceof AxiosError ? err.response?.data?.error : 'Failed to create death record';
      toast.error(msg || 'Failed to create death record');
    }
    setSubmitting(false);
  };

  // ── ICD-10
  const fetchIcd10 = async () => {
    setIcdLoading(true);
    try {
      const { data } = await axios.get('/api/medical-records/icd10', {
        headers: getHeaders(),
        params: { search: icdSearch || undefined, limit: 100 },
      });
      setIcdCodes(data.codes ?? []);
    } catch { setIcdCodes([]); }
    setIcdLoading(false);
  };

  useEffect(() => {
    if (activeTab !== 'icd10') return;
    const t = setTimeout(() => fetchIcd10(), 350);
    return () => clearTimeout(t);
  }, [icdSearch]);

  // ── Referrals
  const fetchReferrals = async () => {
    setReferralsLoading(true);
    try {
      const { data } = await axios.get('/api/medical-records/referrals', {
        headers: getHeaders(),
        params: { page: referralPage, limit: 20 },
      });
      setReferrals(data.referrals ?? []);
      setReferralTotal(data.meta?.total ?? 0);
    } catch { setReferrals([]); }
    setReferralsLoading(false);
  };

  useEffect(() => {
    if (activeTab !== 'referrals') return;
    fetchReferrals();
  }, [referralPage]);

  return (
    <DashboardLayout role={role}>
      <HelpPanel pageKey="medical_records" isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
      <div className="space-y-5 max-w-screen-2xl mx-auto">

        {/* ── Header ── */}
        <div className="page-header">
          <div>
            <h1 className="page-title">Medical Records</h1>
            <p className="section-subtitle mt-1">Patient records, birth/death registration, ICD-10 coding & referrals</p>
          </div>
          <div className="flex gap-2">
            <HelpButton onClick={() => setHelpOpen(true)} />
            <button onClick={fetchStats} className="btn-secondary" title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <KPICard title="Med Records" value={stats.total_records} loading={statsLoading} icon={<FileText className="w-5 h-5" />} iconBg="bg-[var(--color-primary-light)] text-[var(--color-primary)]" />
          <KPICard title="Births" value={stats.total_births} loading={statsLoading} icon={<Baby className="w-5 h-5" />} iconBg="bg-pink-50 text-pink-600" />
          <KPICard title="Deaths" value={stats.total_deaths} loading={statsLoading} icon={<Heart className="w-5 h-5" />} iconBg="bg-slate-100 text-slate-600" />
          <KPICard title="Diagnoses" value={stats.total_diagnoses} loading={statsLoading} icon={<Activity className="w-5 h-5" />} iconBg="bg-emerald-50 text-emerald-600" />
          <KPICard title="Referrals" value={stats.total_referrals} loading={statsLoading} icon={<ArrowUpRight className="w-5 h-5" />} iconBg="bg-amber-50 text-amber-600" />
        </div>

        {/* ── Tab Navigation ── */}
        <div className="flex gap-1 p-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-x-auto">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab.key
                    ? 'bg-[var(--color-primary)] text-white shadow-sm'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-border-light)]'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* MEDICAL RECORDS TAB                                               */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'records' && (
          <div className="space-y-4">
            <div className="card p-4 flex flex-wrap gap-3 items-center justify-between">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
                <input
                  type="text"
                  placeholder="Search by file number or remarks…"
                  value={recordSearch}
                  onChange={e => setRecordSearch(e.target.value)}
                  className="input pl-9"
                />
              </div>
              <button onClick={() => setShowRecordModal(true)} className="btn-primary">
                <Plus className="w-4 h-4" /> New Record
              </button>
            </div>

            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Patient</th>
                      <th>File No.</th>
                      <th>Discharge Type</th>
                      <th>Operation</th>
                      <th>Referred To</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recordsLoading ? (
                      [...Array(5)].map((_, i) => <tr key={i}>{[...Array(8)].map((_, j) => <td key={j}><div className="skeleton h-4 w-full rounded" /></td>)}</tr>)
                    ) : records.length === 0 ? (
                      <tr><td colSpan={8} className="py-16 text-center text-[var(--color-text-muted)]">No medical records found. Create the first one.</td></tr>
                    ) : (
                      records.map((r, idx) => (
                        <tr key={r.id}>
                          <td className="text-[var(--color-text-muted)]">{idx + 1}</td>
                          <td className="font-medium">{r.patientName || `Patient #${r.patientId}`}</td>
                          <td className="font-data">{r.fileNumber || '—'}</td>
                          <td><Badge text={r.dischargeType || '—'} /></td>
                          <td>{r.isOperationConducted ? <span className="badge badge-warning text-xs">Yes</span> : <span className="text-[var(--color-text-muted)]">No</span>}</td>
                          <td className="text-sm">{r.referredTo || '—'}</td>
                          <td className="text-sm text-[var(--color-text-muted)]">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'}</td>
                          <td>
                            <button className="btn-ghost p-1.5" title="View details">
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {recordTotal > 20 && (
                <div className="p-4 border-t border-[var(--color-border)] flex items-center justify-between text-sm text-[var(--color-text-muted)]">
                  <span>Total: {recordTotal} records</span>
                  <div className="flex gap-2">
                    <button onClick={() => setRecordPage(p => Math.max(1, p - 1))} disabled={recordPage === 1} className="btn-secondary px-3 py-1 text-xs">Prev</button>
                    <button onClick={() => setRecordPage(p => p + 1)} disabled={records.length < 20} className="btn-secondary px-3 py-1 text-xs">Next</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* BIRTH REGISTER TAB                                                */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'births' && (
          <div className="space-y-4">
            <div className="card p-4 flex flex-wrap gap-3 items-center justify-between">
              <div className="flex gap-2 items-center">
                <label className="label">From</label>
                <input type="date" value={birthFromDate} onChange={e => setBirthFromDate(e.target.value)} className="input w-auto" />
                <label className="label">To</label>
                <input type="date" value={birthToDate} onChange={e => setBirthToDate(e.target.value)} className="input w-auto" />
                <button onClick={fetchBirths} className="btn-secondary">Apply</button>
              </div>
              <button onClick={() => setShowBirthModal(true)} className="btn-primary">
                <Plus className="w-4 h-4" /> Register Birth
              </button>
            </div>

            <div className="card overflow-hidden">
              <div className="p-4 border-b border-[var(--color-border)] flex items-center gap-2">
                <Baby className="w-4 h-4 text-pink-500" />
                <h2 className="font-semibold text-sm">Birth Register ({birthTotal})</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Certificate No.</th>
                      <th>Baby Name</th>
                      <th>Sex</th>
                      <th>Weight (kg)</th>
                      <th>Birth Date</th>
                      <th>Delivery Type</th>
                      <th>Mother</th>
                      <th>Father</th>
                    </tr>
                  </thead>
                  <tbody>
                    {birthsLoading ? (
                      [...Array(5)].map((_, i) => <tr key={i}>{[...Array(9)].map((_, j) => <td key={j}><div className="skeleton h-4 w-full rounded" /></td>)}</tr>)
                    ) : births.length === 0 ? (
                      <tr><td colSpan={9} className="py-16 text-center text-[var(--color-text-muted)]">No birth records found.</td></tr>
                    ) : (
                      births.map((b, idx) => (
                        <tr key={b.id}>
                          <td className="text-[var(--color-text-muted)]">{idx + 1}</td>
                          <td className="font-data text-xs">{b.certificateNumber || '—'}</td>
                          <td className="font-medium">{b.babyName || '—'}</td>
                          <td>
                            {b.sex ? (
                              <span className={`badge ${b.sex === 'Male' ? 'badge-info' : 'badge-warning'}`}>{b.sex}</span>
                            ) : '—'}
                          </td>
                          <td>{b.weightKg ? `${b.weightKg} kg` : '—'}</td>
                          <td className="font-data">{b.birthDate}</td>
                          <td>{b.deliveryType || '—'}</td>
                          <td>{b.motherName || '—'}</td>
                          <td>{b.fatherName || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* DEATH REGISTER TAB                                                */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'deaths' && (
          <div className="space-y-4">
            <div className="card p-4 flex flex-wrap gap-3 items-center justify-between">
              <div className="flex gap-2 items-center">
                <label className="label">From</label>
                <input type="date" value={deathFromDate} onChange={e => setDeathFromDate(e.target.value)} className="input w-auto" />
                <label className="label">To</label>
                <input type="date" value={deathToDate} onChange={e => setDeathToDate(e.target.value)} className="input w-auto" />
                <button onClick={fetchDeaths} className="btn-secondary">Apply</button>
              </div>
              <button onClick={() => setShowDeathModal(true)} className="btn-primary">
                <Plus className="w-4 h-4" /> Register Death
              </button>
            </div>

            <div className="card overflow-hidden">
              <div className="p-4 border-b border-[var(--color-border)] flex items-center gap-2">
                <Heart className="w-4 h-4 text-slate-500" />
                <h2 className="font-semibold text-sm">Death Register ({deathTotal})</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Certificate No.</th>
                      <th>Patient</th>
                      <th>Date of Death</th>
                      <th>Time</th>
                      <th>Cause of Death</th>
                      <th>Manner</th>
                      <th>Place</th>
                      <th>Age</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deathsLoading ? (
                      [...Array(5)].map((_, i) => <tr key={i}>{[...Array(9)].map((_, j) => <td key={j}><div className="skeleton h-4 w-full rounded" /></td>)}</tr>)
                    ) : deaths.length === 0 ? (
                      <tr><td colSpan={9} className="py-16 text-center text-[var(--color-text-muted)]">No death records found.</td></tr>
                    ) : (
                      deaths.map((d, idx) => (
                        <tr key={d.id}>
                          <td className="text-[var(--color-text-muted)]">{idx + 1}</td>
                          <td className="font-data text-xs">{d.certificateNumber || '—'}</td>
                          <td className="font-medium">{d.patientName || `Patient #${d.patientId}`}</td>
                          <td className="font-data">{d.deathDate}</td>
                          <td>{d.deathTime || '—'}</td>
                          <td className="max-w-xs truncate" title={d.causeOfDeath || ''}>{d.causeOfDeath || '—'}</td>
                          <td>{d.mannerOfDeath || '—'}</td>
                          <td>{d.placeOfDeath || '—'}</td>
                          <td>{d.ageAtDeath || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* ICD-10 BROWSER TAB                                                */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'icd10' && (
          <div className="space-y-4">
            <div className="card p-4">
              <div className="flex gap-3 items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
                  <input
                    type="text"
                    placeholder="Search ICD-10 code or description (e.g. A00, Cholera)…"
                    value={icdSearch}
                    onChange={e => setIcdSearch(e.target.value)}
                    className="input pl-9"
                  />
                </div>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-2">
                Showing {icdCodes.length} code{icdCodes.length !== 1 ? 's' : ''}. Type to filter.
              </p>
            </div>

            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>ICD-10 Code</th>
                      <th>Description</th>
                      <th>Group ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {icdLoading ? (
                      [...Array(8)].map((_, i) => <tr key={i}>{[...Array(3)].map((_, j) => <td key={j}><div className="skeleton h-4 w-full rounded" /></td>)}</tr>)
                    ) : icdCodes.length === 0 ? (
                      <tr><td colSpan={3} className="py-16 text-center text-[var(--color-text-muted)]">No ICD-10 codes found. {icdSearch ? 'Try a different search term.' : 'Migration may not have been applied.'}</td></tr>
                    ) : (
                      icdCodes.map(code => (
                        <tr key={code.id}>
                          <td><span className="font-data font-semibold text-[var(--color-primary)]">{code.code}</span></td>
                          <td>{code.description}</td>
                          <td className="text-[var(--color-text-muted)] text-sm">{code.diseaseGroupId ?? '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* REFERRALS TAB                                                     */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'referrals' && (
          <div className="space-y-4">
            <div className="card overflow-hidden">
              <div className="p-4 border-b border-[var(--color-border)] flex items-center gap-2">
                <ArrowUpRight className="w-4 h-4 text-amber-500" />
                <h2 className="font-semibold text-sm">Outgoing Referrals</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Patient</th>
                      <th>Referred To</th>
                      <th>Referred Date</th>
                      <th>File No.</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {referralsLoading ? (
                      [...Array(5)].map((_, i) => <tr key={i}>{[...Array(6)].map((_, j) => <td key={j}><div className="skeleton h-4 w-full rounded" /></td>)}</tr>)
                    ) : referrals.length === 0 ? (
                      <tr><td colSpan={6} className="py-16 text-center text-[var(--color-text-muted)]">No referrals found.</td></tr>
                    ) : (
                      referrals.map((r, idx) => (
                        <tr key={r.id}>
                          <td className="text-[var(--color-text-muted)]">{idx + 1}</td>
                          <td className="font-medium">{r.patientName || `Patient #${r.patientId}`}</td>
                          <td>{r.referredTo || '—'}</td>
                          <td className="font-data">{r.referredDate || '—'}</td>
                          <td>{r.fileNumber || '—'}</td>
                          <td className="text-sm max-w-xs truncate" title={r.remarks || ''}>{r.remarks || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {referralTotal > 20 && (
                <div className="p-4 border-t border-[var(--color-border)] flex items-center justify-between text-sm text-[var(--color-text-muted)]">
                  <span>Total: {referralTotal} referrals</span>
                  <div className="flex gap-2">
                    <button onClick={() => setReferralPage(p => Math.max(1, p - 1))} disabled={referralPage === 1} className="btn-secondary px-3 py-1 text-xs">Prev</button>
                    <button onClick={() => setReferralPage(p => p + 1)} disabled={referrals.length < 20} className="btn-secondary px-3 py-1 text-xs">Next</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* MODALS                                                            */}
        {/* ═══════════════════════════════════════════════════════════════════ */}

        {/* ── New Medical Record Modal ── */}
        {showRecordModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-modal w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)]">
                <h3 className="font-semibold flex items-center gap-2"><FileText className="w-5 h-5" /> New Medical Record</h3>
                <button onClick={() => setShowRecordModal(false)} className="btn-ghost p-1.5"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={submitRecord} className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Patient ID *</label>
                    <input className="input" type="number" required value={recordForm.patient_id} onChange={e => setRecordForm({ ...recordForm, patient_id: e.target.value })} placeholder="e.g. 1" />
                  </div>
                  <div>
                    <label className="label">File Number</label>
                    <input className="input" value={recordForm.file_number} onChange={e => setRecordForm({ ...recordForm, file_number: e.target.value })} placeholder="MR-2025-001" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Discharge Type</label>
                    <select className="input" value={recordForm.discharge_type} onChange={e => setRecordForm({ ...recordForm, discharge_type: e.target.value })}>
                      <option value="">Select…</option>
                      <option value="normal">Normal</option>
                      <option value="lama">LAMA</option>
                      <option value="absconded">Absconded</option>
                      <option value="referred">Referred</option>
                      <option value="expired">Expired</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Discharge Condition</label>
                    <select className="input" value={recordForm.discharge_condition} onChange={e => setRecordForm({ ...recordForm, discharge_condition: e.target.value })}>
                      <option value="">Select…</option>
                      <option value="improved">Improved</option>
                      <option value="unchanged">Unchanged</option>
                      <option value="worsened">Worsened</option>
                      <option value="cured">Cured</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <input type="checkbox" id="op_conducted" checked={recordForm.is_operation_conducted} onChange={e => setRecordForm({ ...recordForm, is_operation_conducted: e.target.checked })} className="w-4 h-4" />
                  <label htmlFor="op_conducted" className="label cursor-pointer">Operation was conducted</label>
                </div>
                {recordForm.is_operation_conducted && (
                  <div className="grid grid-cols-2 gap-4 pl-6 border-l-2 border-[var(--color-border)]">
                    <div>
                      <label className="label">Operation Date</label>
                      <input type="date" className="input" value={recordForm.operation_date} onChange={e => setRecordForm({ ...recordForm, operation_date: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">Operation Diagnosis</label>
                      <input className="input" value={recordForm.operation_diagnosis} onChange={e => setRecordForm({ ...recordForm, operation_diagnosis: e.target.value })} placeholder="Operative finding…" />
                    </div>
                  </div>
                )}
                {recordForm.discharge_type === 'referred' && (
                  <div className="grid grid-cols-2 gap-4 pl-6 border-l-2 border-amber-200">
                    <div>
                      <label className="label">Referred To</label>
                      <input className="input" value={recordForm.referred_to} onChange={e => setRecordForm({ ...recordForm, referred_to: e.target.value })} placeholder="Hospital/clinic name" />
                    </div>
                    <div>
                      <label className="label">Referral Date</label>
                      <input type="date" className="input" value={recordForm.referred_date} onChange={e => setRecordForm({ ...recordForm, referred_date: e.target.value })} />
                    </div>
                    <div className="col-span-2">
                      <label className="label">Reason for Referral</label>
                      <textarea className="input min-h-[60px]" value={recordForm.referred_reason} onChange={e => setRecordForm({ ...recordForm, referred_reason: e.target.value })} placeholder="Clinical reason…" />
                    </div>
                  </div>
                )}
                <div>
                  <label className="label">Remarks</label>
                  <textarea className="input min-h-[60px]" value={recordForm.remarks} onChange={e => setRecordForm({ ...recordForm, remarks: e.target.value })} placeholder="Additional notes…" />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setShowRecordModal(false)} className="btn-secondary">Cancel</button>
                  <button type="submit" disabled={submitting} className="btn-primary">{submitting ? 'Creating…' : 'Create Record'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Register Birth Modal ── */}
        {showBirthModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-modal w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)]">
                <h3 className="font-semibold flex items-center gap-2"><Baby className="w-5 h-5 text-pink-500" /> Register Birth</h3>
                <button onClick={() => setShowBirthModal(false)} className="btn-ghost p-1.5"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={submitBirth} className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Mother Patient ID *</label>
                    <input className="input" type="number" required value={birthForm.patient_id} onChange={e => setBirthForm({ ...birthForm, patient_id: e.target.value })} placeholder="e.g. 5" />
                  </div>
                  <div>
                    <label className="label">Baby Name</label>
                    <input className="input" value={birthForm.baby_name} onChange={e => setBirthForm({ ...birthForm, baby_name: e.target.value })} placeholder="Optional" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="label">Sex</label>
                    <select className="input" value={birthForm.sex} onChange={e => setBirthForm({ ...birthForm, sex: e.target.value })}>
                      <option value="">—</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Weight (kg)</label>
                    <input className="input" type="number" step="0.01" min="0" value={birthForm.weight_kg} onChange={e => setBirthForm({ ...birthForm, weight_kg: e.target.value })} placeholder="e.g. 3.2" />
                  </div>
                  <div>
                    <label className="label">Birth Type</label>
                    <select className="input" value={birthForm.birth_type} onChange={e => setBirthForm({ ...birthForm, birth_type: e.target.value })}>
                      <option value="">—</option>
                      <option value="Single">Single</option>
                      <option value="Twin">Twin</option>
                      <option value="Triplet">Triplet</option>
                      <option value="Quadruplet">Quadruplet</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Birth Date *</label>
                    <input type="date" className="input" required value={birthForm.birth_date} onChange={e => setBirthForm({ ...birthForm, birth_date: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Birth Time</label>
                    <input type="time" className="input" value={birthForm.birth_time} onChange={e => setBirthForm({ ...birthForm, birth_time: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Delivery Type</label>
                    <select className="input" value={birthForm.delivery_type} onChange={e => setBirthForm({ ...birthForm, delivery_type: e.target.value })}>
                      <option value="">—</option>
                      <option value="Normal">Normal</option>
                      <option value="Cesarean">Cesarean</option>
                      <option value="Forceps">Forceps</option>
                      <option value="Vacuum">Vacuum</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Birth Condition</label>
                    <select className="input" value={birthForm.birth_condition} onChange={e => setBirthForm({ ...birthForm, birth_condition: e.target.value })}>
                      <option value="">—</option>
                      <option value="Alive">Alive</option>
                      <option value="Stillborn">Stillborn</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Father Name</label>
                    <input className="input" value={birthForm.father_name} onChange={e => setBirthForm({ ...birthForm, father_name: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Mother Name</label>
                    <input className="input" value={birthForm.mother_name} onChange={e => setBirthForm({ ...birthForm, mother_name: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Issued By</label>
                    <input className="input" value={birthForm.issued_by} onChange={e => setBirthForm({ ...birthForm, issued_by: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Certified By</label>
                    <input className="input" value={birthForm.certified_by} onChange={e => setBirthForm({ ...birthForm, certified_by: e.target.value })} />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setShowBirthModal(false)} className="btn-secondary">Cancel</button>
                  <button type="submit" disabled={submitting} className="btn-primary">{submitting ? 'Registering…' : 'Register Birth'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Register Death Modal ── */}
        {showDeathModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-modal w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)]">
                <h3 className="font-semibold flex items-center gap-2"><Heart className="w-5 h-5 text-slate-500" /> Register Death</h3>
                <button onClick={() => setShowDeathModal(false)} className="btn-ghost p-1.5"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={submitDeath} className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Patient ID *</label>
                    <input className="input" type="number" required value={deathForm.patient_id} onChange={e => setDeathForm({ ...deathForm, patient_id: e.target.value })} placeholder="e.g. 3" />
                  </div>
                  <div>
                    <label className="label">Age at Death</label>
                    <input className="input" value={deathForm.age_at_death} onChange={e => setDeathForm({ ...deathForm, age_at_death: e.target.value })} placeholder="e.g. 65 years" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Date of Death *</label>
                    <input type="date" className="input" required value={deathForm.death_date} onChange={e => setDeathForm({ ...deathForm, death_date: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Time of Death</label>
                    <input type="time" className="input" value={deathForm.death_time} onChange={e => setDeathForm({ ...deathForm, death_time: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="label">Cause of Death</label>
                  <textarea className="input min-h-[60px]" value={deathForm.cause_of_death} onChange={e => setDeathForm({ ...deathForm, cause_of_death: e.target.value })} placeholder="Primary cause…" />
                </div>
                <div>
                  <label className="label">Secondary Cause</label>
                  <textarea className="input min-h-[60px]" value={deathForm.secondary_cause} onChange={e => setDeathForm({ ...deathForm, secondary_cause: e.target.value })} placeholder="Contributing cause…" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Manner of Death</label>
                    <select className="input" value={deathForm.manner_of_death} onChange={e => setDeathForm({ ...deathForm, manner_of_death: e.target.value })}>
                      <option value="">—</option>
                      <option value="Natural">Natural</option>
                      <option value="Accident">Accident</option>
                      <option value="Suicide">Suicide</option>
                      <option value="Homicide">Homicide</option>
                      <option value="Undetermined">Undetermined</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Place of Death</label>
                    <select className="input" value={deathForm.place_of_death} onChange={e => setDeathForm({ ...deathForm, place_of_death: e.target.value })}>
                      <option value="">—</option>
                      <option value="Ward">Ward</option>
                      <option value="ICU">ICU</option>
                      <option value="Emergency">Emergency</option>
                      <option value="OT">OT</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="label">Father Name</label>
                    <input className="input" value={deathForm.father_name} onChange={e => setDeathForm({ ...deathForm, father_name: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Mother Name</label>
                    <input className="input" value={deathForm.mother_name} onChange={e => setDeathForm({ ...deathForm, mother_name: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Spouse Name</label>
                    <input className="input" value={deathForm.spouse_name} onChange={e => setDeathForm({ ...deathForm, spouse_name: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="label">Certified By</label>
                  <input className="input" value={deathForm.certified_by} onChange={e => setDeathForm({ ...deathForm, certified_by: e.target.value })} placeholder="Doctor name…" />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setShowDeathModal(false)} className="btn-secondary">Cancel</button>
                  <button type="submit" disabled={submitting} className="btn-primary">{submitting ? 'Registering…' : 'Register Death'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}
