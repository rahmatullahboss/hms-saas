import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import DashboardLayout from '../../components/DashboardLayout';
import StatusBadge from '../../components/billing/StatusBadge';

const api = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

type Tab = 'schemes' | 'patients' | 'claims' | 'reports';

interface Scheme { id: number; scheme_name: string; scheme_code: string; scheme_type: string; contact: string; is_active: number; }
interface Claim { id: number; claim_no: string; patient_name: string; patient_code: string; status: string; claimed_amount: number; approved_amount: number; submitted_at: string; }
interface Report { status: string; claim_count: number; total_claimed: number; total_approved: number; }

export default function InsurancePage({ role = 'hospital_admin' }: { role?: string }) {
  const [tab, setTab] = useState<Tab>('claims');
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showSchemeForm, setShowSchemeForm] = useState(false);
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState<Claim | null>(null);
  const [schemeForm, setSchemeForm] = useState({ scheme_name: '', scheme_code: '', scheme_type: 'insurance', contact: '' });
  const [claimForm, setClaimForm] = useState({ patient_id: '', bill_amount: 0, claimed_amount: 0, diagnosis: '', icd10_code: '' });
  const [statusForm, setStatusForm] = useState({ status: 'under_review', approved_amount: 0, rejection_reason: '', reviewer_notes: '' });
  const [patientSearch, setPatientSearch] = useState('');
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<any>(null);

  useEffect(() => {
    if (tab === 'schemes') fetchSchemes();
    else if (tab === 'claims') fetchClaims();
    else if (tab === 'reports') fetchReports();
  }, [tab, statusFilter]);

  const fetchSchemes = async () => { setLoading(true); try { const { data } = await axios.get('/api/insurance/schemes', api()); setSchemes(data.schemes || []); } catch { toast.error('Failed to load schemes'); } finally { setLoading(false); } };
  const fetchClaims = async () => { setLoading(true); try { const { data } = await axios.get(`/api/insurance/claims${statusFilter ? `?status=${statusFilter}` : ''}`, api()); setClaims(data.claims || []); } catch { toast.error('Failed to load claims'); } finally { setLoading(false); } };
  const fetchReports = async () => { setLoading(true); try { const { data } = await axios.get('/api/insurance/reports/summary', api()); setReports(data.report || []); } catch { toast.error('Failed to load report'); } finally { setLoading(false); } };

  const searchPatients = async (q: string) => { setPatientSearch(q); if (q.length < 2) { setPatients([]); return; } try { const { data } = await axios.get(`/api/patients?search=${q}`, api()); setPatients(data.patients?.slice(0, 6) || []); } catch { } };

  const handleCreateScheme = async () => {
    if (!schemeForm.scheme_name) { toast.error('Scheme name required'); return; }
    try { await axios.post('/api/insurance/schemes', schemeForm, api()); toast.success('Scheme created'); setShowSchemeForm(false); fetchSchemes(); } catch { toast.error('Failed'); }
  };

  const handleSubmitClaim = async () => {
    if (!selectedPatient || !claimForm.bill_amount) { toast.error('Patient and bill amount required'); return; }
    try {
      await axios.post('/api/insurance/claims', { patient_id: selectedPatient.id, bill_amount: claimForm.bill_amount, claimed_amount: claimForm.claimed_amount || claimForm.bill_amount, diagnosis: claimForm.diagnosis, icd10_code: claimForm.icd10_code }, api());
      toast.success('Claim submitted'); setShowClaimForm(false); setSelectedPatient(null); setPatientSearch(''); fetchClaims();
    } catch { toast.error('Failed'); }
  };

  const handleUpdateStatus = async () => {
    if (!showStatusModal) return;
    try { await axios.put(`/api/insurance/claims/${showStatusModal.id}/status`, statusForm, api()); toast.success(`Status → ${statusForm.status}`); setShowStatusModal(null); fetchClaims(); } catch { toast.error('Failed'); }
  };

  const TABS: { key: Tab; label: string }[] = [{ key: 'claims', label: 'Claims' }, { key: 'schemes', label: 'Schemes' }, { key: 'patients', label: 'Patient Insurance' }, { key: 'reports', label: 'Reports' }];
  const STATUS_OPTIONS = ['submitted', 'under_review', 'approved', 'rejected', 'settled'];

  return (
    <DashboardLayout role={role}>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div><h1 className="text-2xl font-bold">Insurance</h1><p className="text-sm text-[var(--color-text-muted)] mt-0.5">Claims, schemes & patient enrollment</p></div>
          <div className="flex gap-2">
            {tab === 'schemes' && <button onClick={() => setShowSchemeForm(true)} className="btn-primary">+ Add Scheme</button>}
            {tab === 'claims' && <button onClick={() => setShowClaimForm(true)} className="btn-primary">+ Submit Claim</button>}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-[var(--color-border)]">
          {TABS.map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); setLoading(true); }}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === t.key ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Claims tab */}
        {tab === 'claims' && (
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--color-border)] flex gap-3 items-center">
              <span className="text-sm font-medium">Filter:</span>
              {['', ...STATUS_OPTIONS].map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`text-xs px-3 py-1 rounded-full transition-colors ${statusFilter === s ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]'}`}>
                  {s || 'All'}
                </button>
              ))}
            </div>
            <table className="table">
              <thead><tr><th>Claim #</th><th>Patient</th><th>Claimed</th><th>Approved</th><th>Status</th><th>Date</th><th></th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={7} className="text-center py-8 text-[var(--color-text-muted)]">Loading…</td></tr>
                  : claims.length === 0 ? <tr><td colSpan={7} className="text-center py-8 text-[var(--color-text-muted)]">No claims</td></tr>
                  : claims.map(c => (
                    <tr key={c.id}>
                      <td className="font-mono text-xs font-semibold">{c.claim_no}</td>
                      <td><div className="text-sm font-medium">{c.patient_name}</div><div className="text-xs text-[var(--color-text-muted)]">{c.patient_code}</div></td>
                      <td className="font-semibold">৳{(c.claimed_amount || 0).toLocaleString()}</td>
                      <td className="text-green-600">{c.approved_amount ? `৳${c.approved_amount.toLocaleString()}` : '—'}</td>
                      <td><StatusBadge status={c.status} /></td>
                      <td className="text-xs text-[var(--color-text-muted)]">{new Date(c.submitted_at).toLocaleDateString()}</td>
                      <td><button onClick={() => { setShowStatusModal(c); setStatusForm({ status: 'under_review', approved_amount: c.approved_amount || 0, rejection_reason: '', reviewer_notes: '' }); }} className="text-xs btn-secondary px-2 py-1">Update</button></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Schemes tab */}
        {tab === 'schemes' && (
          <div className="card overflow-hidden">
            <table className="table">
              <thead><tr><th>Scheme Name</th><th>Code</th><th>Type</th><th>Contact</th><th>Status</th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={5} className="py-8 text-center text-[var(--color-text-muted)]">Loading…</td></tr>
                  : schemes.map(s => (
                    <tr key={s.id}>
                      <td className="font-medium">{s.scheme_name}</td>
                      <td className="font-mono text-xs">{s.scheme_code || '—'}</td>
                      <td className="capitalize text-sm">{s.scheme_type}</td>
                      <td className="text-sm">{s.contact || '—'}</td>
                      <td><StatusBadge status={s.is_active ? 'active' : 'inactive'} /></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Reports tab */}
        {tab === 'reports' && (
          <div className="card overflow-hidden">
            <table className="table">
              <thead><tr><th>Status</th><th>Claims</th><th>Total Claimed</th><th>Total Approved</th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={4} className="py-8 text-center text-[var(--color-text-muted)]">Loading…</td></tr>
                  : reports.map(r => (
                    <tr key={r.status}>
                      <td><StatusBadge status={r.status} /></td>
                      <td className="font-semibold">{r.claim_count}</td>
                      <td>৳{(r.total_claimed || 0).toLocaleString()}</td>
                      <td className="text-green-600">৳{(r.total_approved || 0).toLocaleString()}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'patients' && (
          <div className="card p-6 text-center text-[var(--color-text-muted)]">
            <div className="text-3xl mb-2">🛡️</div>
            <p>Patient insurance enrollment coming soon</p>
          </div>
        )}
      </div>

      {/* Scheme Form Modal */}
      {showSchemeForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-md">
            <h3 className="font-bold text-lg mb-4">Add Insurance Scheme</h3>
            <div className="space-y-3">
              <div><label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Scheme Name *</label><input className="input" value={schemeForm.scheme_name} onChange={e => setSchemeForm({ ...schemeForm, scheme_name: e.target.value })} /></div>
              <div><label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Code</label><input className="input" value={schemeForm.scheme_code} onChange={e => setSchemeForm({ ...schemeForm, scheme_code: e.target.value })} /></div>
              <div><label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Type</label>
                <select className="input" value={schemeForm.scheme_type} onChange={e => setSchemeForm({ ...schemeForm, scheme_type: e.target.value })}>
                  {['insurance', 'government', 'corporate', 'ngo'].map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
                </select>
              </div>
              <div><label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Contact</label><input className="input" value={schemeForm.contact} onChange={e => setSchemeForm({ ...schemeForm, contact: e.target.value })} /></div>
            </div>
            <div className="flex gap-3 mt-5"><button onClick={handleCreateScheme} className="btn-primary flex-1">Create Scheme</button><button onClick={() => setShowSchemeForm(false)} className="btn-secondary px-5">Cancel</button></div>
          </div>
        </div>
      )}

      {/* Claim Form Modal */}
      {showClaimForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-md">
            <h3 className="font-bold text-lg mb-4">Submit Insurance Claim</h3>
            <div className="space-y-3">
              <div className="relative">
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Patient *</label>
                <input className="input" placeholder="Search patient…" value={patientSearch} onChange={e => searchPatients(e.target.value)} />
                {patients.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-10 card shadow-lg mt-1 overflow-hidden">
                    {patients.map(p => (
                      <button key={p.id} onClick={() => { setSelectedPatient(p); setPatientSearch(p.name); setPatients([]); }}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--color-bg-secondary)] border-b border-[var(--color-border-light)]">
                        {p.name} <span className="text-xs text-[var(--color-text-muted)]">{p.patient_code}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Bill Amount ৳ *</label><input type="number" className="input" value={claimForm.bill_amount} onChange={e => setClaimForm({ ...claimForm, bill_amount: Number(e.target.value) })} /></div>
                <div><label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Claimed Amount ৳</label><input type="number" className="input" value={claimForm.claimed_amount} onChange={e => setClaimForm({ ...claimForm, claimed_amount: Number(e.target.value) })} /></div>
              </div>
              <div><label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Diagnosis</label><input className="input" value={claimForm.diagnosis} onChange={e => setClaimForm({ ...claimForm, diagnosis: e.target.value })} /></div>
              <div><label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">ICD-10 Code</label><input className="input" placeholder="e.g. J18.9" value={claimForm.icd10_code} onChange={e => setClaimForm({ ...claimForm, icd10_code: e.target.value })} /></div>
            </div>
            <div className="flex gap-3 mt-5"><button onClick={handleSubmitClaim} className="btn-primary flex-1">Submit Claim</button><button onClick={() => { setShowClaimForm(false); setPatients([]); setSelectedPatient(null); setPatientSearch(''); }} className="btn-secondary px-5">Cancel</button></div>
          </div>
        </div>
      )}

      {/* Status update modal */}
      {showStatusModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-md">
            <h3 className="font-bold text-lg mb-1">Update Claim Status</h3>
            <p className="text-sm text-[var(--color-text-muted)] mb-4">{showStatusModal.claim_no} — {showStatusModal.patient_name}</p>
            <div className="space-y-3">
              <div><label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">New Status</label>
                <select className="input" value={statusForm.status} onChange={e => setStatusForm({ ...statusForm, status: e.target.value })}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s} className="capitalize">{s.replace('_', ' ')}</option>)}
                </select>
              </div>
              {(statusForm.status === 'approved' || statusForm.status === 'settled') && (
                <div><label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Approved Amount ৳</label><input type="number" className="input" value={statusForm.approved_amount} onChange={e => setStatusForm({ ...statusForm, approved_amount: Number(e.target.value) })} /></div>
              )}
              {statusForm.status === 'rejected' && (
                <div><label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Rejection Reason</label><input className="input" value={statusForm.rejection_reason} onChange={e => setStatusForm({ ...statusForm, rejection_reason: e.target.value })} /></div>
              )}
              <div><label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Reviewer Notes</label><input className="input" value={statusForm.reviewer_notes} onChange={e => setStatusForm({ ...statusForm, reviewer_notes: e.target.value })} /></div>
            </div>
            <div className="flex gap-3 mt-5"><button onClick={handleUpdateStatus} className="btn-primary flex-1">Update</button><button onClick={() => setShowStatusModal(null)} className="btn-secondary px-5">Cancel</button></div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
