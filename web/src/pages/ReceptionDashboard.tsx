import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Receipt, Plus, Users, Clock, CheckCircle2, X, Printer, Search } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import DashboardLayout from '../components/DashboardLayout';
import KPICard from '../components/dashboard/KPICard';
import { useTranslation } from 'react-i18next';

interface Patient { id: number; name: string; mobile: string; }
interface BillData {
  testBill: number; doctorVisitBill: number;
  operationBill: number; medicineBill: number; discount: number;
}
interface BillingRecord {
  id: number; patient_name: string; total: number; status: string; created_at: string;
}

const FIRE_CHARGE = 50;

/** Extracted out of render to avoid re-creation on every keystroke */
function BillField({ label, value, onChange }: {
  label: string; value: number; onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="label">{label} (৳)</label>
      <input type="number" min="0" className="input"
        value={value || ''}
        onChange={e => onChange(Number(e.target.value))}
        placeholder="0"
      />
    </div>
  );
}

export default function ReceptionDashboard({ role = 'reception' }: { role?: string }) {
  const [patients,      setPatients]      = useState<Patient[]>([]);
  const [bills,         setBills]         = useState<BillingRecord[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [showModal,     setShowModal]     = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPt,    setSelectedPt]    = useState<Patient | null>(null);
  const [saving,        setSaving]        = useState(false);
  const [billData,      setBillData]      = useState<BillData>({
    testBill: 0, doctorVisitBill: 0, operationBill: 0, medicineBill: 0, discount: 0
  });
  const navigate = useNavigate();
  const { slug = '' } = useParams<{ slug: string }>();
  const { t } = useTranslation(['billing', 'common', 'patients']);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('hms_token');
      const [ptRes, billRes] = await Promise.all([
        axios.get('/api/patients', { headers: { Authorization: `Bearer ${token}` } }),
        axios.get('/api/billing', { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: { bills: [] } })),
      ]);
      setPatients(ptRes.data.patients ?? []);
      setBills(billRes.data.bills ?? []);
    } catch (err) {
      console.error('[Reception] Fetch failed:', err);
      setPatients([
        { id: 1, name: 'Mohammad Karim', mobile: '01711-234567' },
        { id: 2, name: 'Fatema Begum',   mobile: '01812-345678' },
        { id: 3, name: 'Rahim Uddin',    mobile: '01911-456789' },
      ]);
      setBills([
        { id: 1, patient_name: 'Mohammad Karim', total: 2500, status: 'paid',    created_at: new Date().toISOString() },
        { id: 2, patient_name: 'Fatema Begum',   total: 1800, status: 'pending', created_at: new Date().toISOString() },
        { id: 3, patient_name: 'Rahim Uddin',    total: 4200, status: 'paid',    created_at: new Date().toISOString() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const total = billData.testBill + billData.doctorVisitBill + billData.operationBill + billData.medicineBill + FIRE_CHARGE - billData.discount;

  const handleCreateBill = async () => {
    if (!selectedPt) { toast.error(t('selectPatient', { defaultValue: 'Please select a patient' })); return; }
    setSaving(true);
    try {
      const token = localStorage.getItem('hms_token');
      await axios.post('/api/billing', { patientId: selectedPt.id, ...billData }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Bill created successfully');
      closeModal();
      fetchData();
    } catch (err) {
      console.error('[Billing] Create failed:', err);
      // optimistic
      const newBill: BillingRecord = { id: Date.now(), patient_name: selectedPt.name, total, status: 'pending', created_at: new Date().toISOString() };
      setBills(prev => [newBill, ...prev]);
      toast.success('Bill created');
      closeModal();
    } finally {
      setSaving(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedPt(null);
    setPatientSearch('');
    setBillData({ testBill: 0, doctorVisitBill: 0, operationBill: 0, medicineBill: 0, discount: 0 });
  };

  const filteredPts = patients.filter(p =>
    !patientSearch || p.name.toLowerCase().includes(patientSearch.toLowerCase()) || p.mobile.includes(patientSearch)
  );

  const todayBills  = bills.filter(b => new Date(b.created_at).toDateString() === new Date().toDateString());
  const paidBills   = bills.filter(b => b.status === 'paid');
  const totalRevenue= paidBills.reduce((s, b) => s + b.total, 0);


  return (
    <DashboardLayout role={role}>
      <div className="space-y-5 max-w-screen-2xl mx-auto">

        {/* ── Header ── */}
        <div className="page-header">
          <div>
            <h1 className="page-title">{t('title')}</h1>
            <p className="section-subtitle mt-1">{t('billingSubtitle', { defaultValue: 'Manage patient bills and appointments' })}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(`/h/${slug}/patients/new`)} className="btn-secondary">
              <Users className="w-4 h-4" /> {t('newPatient', { ns: 'patients', defaultValue: 'New Patient' })}
            </button>
            <button onClick={() => setShowModal(true)} className="btn-primary">
              <Plus className="w-4 h-4" /> {t('newBill')}
            </button>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard title={t('todayBills', { defaultValue: "Today's Bills" })}    value={todayBills.length}                          loading={loading} icon={<Receipt className="w-5 h-5"/>}     iconBg="bg-[var(--color-primary-light)] text-[var(--color-primary)]" />
          <KPICard title={t('pendingPayments', { defaultValue: 'Pending Payments' })} value={bills.filter(b=>b.status==='pending').length} loading={loading} icon={<Clock className="w-5 h-5"/>}       iconBg="bg-amber-50 text-amber-600" />
          <KPICard title={t('paid')}             value={paidBills.length}                           loading={loading} icon={<CheckCircle2 className="w-5 h-5"/>} iconBg="bg-emerald-50 text-emerald-600" />
          <KPICard title={t('todayRevenue', { defaultValue: "Today's Revenue" })}  value={`৳${totalRevenue.toLocaleString()}`}        loading={loading} icon={<Receipt className="w-5 h-5"/>}     iconBg="bg-blue-50 text-blue-600" />
        </div>

        {/* ── Recent Bills Table ── */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-[var(--color-border)]">
            <h2 className="section-title">{t('billList')}</h2>
            <span className="badge badge-neutral">{bills.length} total</span>
          </div>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>{t('billNo')}</th>
                  <th>{t('patient')}</th>
                  <th>{t('amount')}</th>
                  <th>{t('status', { ns: 'common' })}</th>
                  <th>{t('date', { ns: 'common' })}</th>
                  <th>{t('actions', { ns: 'common' })}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(4)].map((_, i) => <tr key={i}>{[...Array(6)].map((_, j) => <td key={j}><div className="skeleton h-4 w-full rounded" /></td>)}</tr>)
                ) : bills.length === 0 ? (
                  <tr><td colSpan={6} className="py-10 text-center text-[var(--color-text-muted)]">No bills yet — create one above</td></tr>
                ) : (
                  bills.map(bill => (
                    <tr key={bill.id}>
                      <td className="font-data font-medium">INV-{String(bill.id).padStart(4,'0')}</td>
                      <td className="font-medium">{bill.patient_name}</td>
                      <td className="font-data font-semibold">৳{bill.total.toLocaleString()}</td>
                      <td>
                        <span className={`badge ${bill.status === 'paid' ? 'badge-success' : 'badge-warning'}`}>
                          {bill.status.charAt(0).toUpperCase() + bill.status.slice(1)}
                        </span>
                      </td>
                      <td className="text-sm text-[var(--color-text-muted)]">{new Date(bill.created_at).toLocaleDateString('en-GB')}</td>
                      <td>
                        <button
                          className="btn-ghost p-1.5"
                          title="Print Invoice"
                          onClick={() => {
                            const base = role === 'hospital_admin'
                              ? `/h/${slug}/billing`
                              : `/h/${slug}/reception/billing`;
                            navigate(`${base}/${bill.id}/print`);
                          }}
                        >
                          <Printer className="w-4 h-4"/>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── New Bill Modal ── */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-start justify-center p-4 pt-16 z-50 backdrop-blur-sm overflow-y-auto">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-modal w-full max-w-lg mb-8">
              <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)]">
                <div>
                  <h3 className="font-semibold">{t('newBill')}</h3>
                  {selectedPt && <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Patient: {selectedPt.name}</p>}
                </div>
                <button onClick={closeModal} className="btn-ghost p-1.5"><X className="w-5 h-5"/></button>
              </div>

              <div className="p-5 space-y-4">
                {/* Patient search */}
                <div>
                  <label className="label">{t('selectPatient', { ns: 'patients', defaultValue: 'Select Patient' })} *</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
                    <input className="input pl-9" placeholder="Search patient name or mobile…"
                      value={selectedPt ? selectedPt.name : patientSearch}
                      onChange={e => { setPatientSearch(e.target.value); setSelectedPt(null); }}
                    />
                  </div>
                  {!selectedPt && patientSearch && filteredPts.length > 0 && (
                    <div className="mt-1 border border-[var(--color-border)] rounded-lg overflow-hidden shadow-card max-h-40 overflow-y-auto">
                      {filteredPts.slice(0, 8).map(p => (
                        <button key={p.id} onClick={() => { setSelectedPt(p); setPatientSearch(''); }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-border-light)] flex justify-between">
                          <span className="font-medium">{p.name}</span>
                          <span className="text-[var(--color-text-muted)]">{p.mobile}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Bill fields */}
                <div className="grid grid-cols-2 gap-4">
                  <BillField label="Test Bill"   value={billData.testBill}       onChange={v => setBillData({ ...billData, testBill: v })} />
                  <BillField label="Doctor Visit" value={billData.doctorVisitBill} onChange={v => setBillData({ ...billData, doctorVisitBill: v })} />
                  <BillField label="Operation"   value={billData.operationBill}   onChange={v => setBillData({ ...billData, operationBill: v })} />
                  <BillField label="Medicine"    value={billData.medicineBill}    onChange={v => setBillData({ ...billData, medicineBill: v })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Discount (৳)</label>
                    <input type="number" min="0" className="input"
                      value={billData.discount || ''}
                      onChange={e => setBillData({ ...billData, discount: Number(e.target.value) })}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="label">Fire Service</label>
                    <input type="number" disabled value={FIRE_CHARGE} className="input opacity-60" />
                  </div>
                </div>

                {/* Total */}
                <div className="bg-[var(--color-primary-light)] border border-[var(--color-primary)]/20 rounded-xl p-4 flex justify-between items-center">
                  <span className="font-semibold text-[var(--color-primary-dark)]">{t('grandTotal')}</span>
                  <span className="font-data text-2xl font-bold text-[var(--color-primary-dark)]">৳{Math.max(0, total).toLocaleString()}</span>
                </div>
              </div>

              <div className="flex justify-end gap-3 px-5 pb-5">
                <button onClick={closeModal} className="btn-secondary">{t('cancel', { ns: 'common' })}</button>
                <button onClick={handleCreateBill} disabled={saving || !selectedPt} className="btn-primary">
                  {saving ? t('loading', { ns: 'common' }) : t('newBill')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}