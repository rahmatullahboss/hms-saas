import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ChevronRight, Search, FileText, AlertTriangle, CheckCircle, Clock, Plus, Filter, DollarSign } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';

// ─── Types ───────────────────────────────────────────────────────────────────

type ClaimStatus = 'submitted' | 'under_review' | 'approved' | 'rejected' | 'settled';

interface Claim {
  id: number;
  claim_no: string;
  patient_name: string;
  patient_code: string;
  provider: string;
  policy_no: string;
  bill_amount: number;
  claimed_amount: number;
  approved_amount: number | null;
  status: ClaimStatus;
  submitted_at: string;
  settled_at?: string;
  diagnosis: string;
}

const STATUS_CONFIG: Record<ClaimStatus, { label: string; color: string; icon: React.ReactNode }> = {
  submitted:    { label: 'Submitted',    color: 'bg-blue-100 text-blue-700',   icon: <FileText className="w-3.5 h-3.5" /> },
  under_review: { label: 'Under Review', color: 'bg-amber-100 text-amber-700', icon: <Clock className="w-3.5 h-3.5" /> },
  approved:     { label: 'Approved',     color: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle className="w-3.5 h-3.5" /> },
  rejected:     { label: 'Rejected',     color: 'bg-red-100 text-red-700',     icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  settled:      { label: 'Settled',      color: 'bg-gray-100 text-gray-700',   icon: <DollarSign className="w-3.5 h-3.5" /> },
};

const DEMO_CLAIMS: Claim[] = [
  { id: 1, claim_no: 'CLM-0001', patient_name: 'Mohammad Karim', patient_code: 'P-00001', provider: 'MetLife Insurance BD', policy_no: 'ML-29384', bill_amount: 25000, claimed_amount: 22000, approved_amount: 20000, status: 'settled', submitted_at: new Date(Date.now() - 15*86400000).toISOString(), settled_at: new Date(Date.now() - 5*86400000).toISOString(), diagnosis: 'Dengue Fever (IPD)' },
  { id: 2, claim_no: 'CLM-0002', patient_name: 'Fatima Begum', patient_code: 'P-00012', provider: 'Green Delta Insurance', policy_no: 'GD-10239', bill_amount: 8500, claimed_amount: 8000, approved_amount: 7500, status: 'approved', submitted_at: new Date(Date.now() - 7*86400000).toISOString(), diagnosis: 'Appendectomy' },
  { id: 3, claim_no: 'CLM-0003', patient_name: 'Rafiqul Islam', patient_code: 'P-00045', provider: 'Pragati Life Insurance', policy_no: 'PL-55678', bill_amount: 12000, claimed_amount: 10000, approved_amount: null, status: 'under_review', submitted_at: new Date(Date.now() - 3*86400000).toISOString(), diagnosis: 'Pneumonia Treatment' },
  { id: 4, claim_no: 'CLM-0004', patient_name: 'Ayesha Khatun', patient_code: 'P-00023', provider: 'MetLife Insurance BD', policy_no: 'ML-44521', bill_amount: 3500, claimed_amount: 3500, approved_amount: null, status: 'submitted', submitted_at: new Date(Date.now() - 1*86400000).toISOString(), diagnosis: 'OPD Consultation + Lab' },
  { id: 5, claim_no: 'CLM-0005', patient_name: 'Kamal Hossain', patient_code: 'P-00034', provider: 'BRAC Saajan', policy_no: 'BS-78901', bill_amount: 45000, claimed_amount: 40000, approved_amount: 0, status: 'rejected', submitted_at: new Date(Date.now() - 20*86400000).toISOString(), diagnosis: 'Elective Surgery — not covered' },
];

function fmtTaka(n: number): string {
  return `৳${n.toLocaleString('en-BD')}`;
}
function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function InsuranceClaims({ role = 'hospital_admin' }: { role?: string }) {
  const { slug = '' } = useParams<{ slug: string }>();
  const basePath = `/h/${slug}`;

  const [claims] = useState<Claim[]>(DEMO_CLAIMS);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);

  const filtered = claims.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return c.claim_no.toLowerCase().includes(q) ||
             c.patient_name.toLowerCase().includes(q) ||
             c.provider.toLowerCase().includes(q);
    }
    return true;
  });

  // Stats
  const totalClaimed = claims.reduce((s, c) => s + c.claimed_amount, 0);
  const totalApproved = claims.reduce((s, c) => s + (c.approved_amount ?? 0), 0);
  const pendingCount = claims.filter(c => ['submitted', 'under_review'].includes(c.status)).length;
  const settledCount = claims.filter(c => c.status === 'settled').length;

  return (
    <DashboardLayout role={role}>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs text-[var(--color-text-muted)] flex items-center gap-1 mb-1">
              <Link to={`${basePath}/dashboard`} className="hover:underline">Dashboard</Link>
              <ChevronRight className="w-3 h-3" />
              <span className="text-[var(--color-text)] font-medium">Insurance Claims</span>
            </div>
            <h1 className="text-2xl font-bold text-[var(--color-text)]">Insurance Claims Management</h1>
            <p className="text-sm text-[var(--color-text-muted)]">Submit and track insurance claims</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="btn btn-primary text-sm flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Claim
          </button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Claimed', value: fmtTaka(totalClaimed), color: 'text-blue-600' },
            { label: 'Total Approved', value: fmtTaka(totalApproved), color: 'text-emerald-600' },
            { label: 'Pending', value: pendingCount, color: 'text-amber-600' },
            { label: 'Settled', value: settledCount, color: 'text-gray-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="card p-4 text-center">
              <p className={`text-xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-[var(--color-text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by claim, patient, or provider..."
              className="w-full pl-9 pr-3 py-2 border border-[var(--color-border)] rounded-lg text-sm" />
          </div>
          <div className="flex items-center gap-1">
            <Filter className="w-4 h-4 text-[var(--color-text-muted)]" />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm">
              <option value="all">All Status</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Claims Table */}
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">
                  <th className="text-left px-4 py-3">Claim No</th>
                  <th className="text-left px-4 py-3">Patient</th>
                  <th className="text-left px-4 py-3">Provider</th>
                  <th className="text-left px-4 py-3">Diagnosis</th>
                  <th className="text-right px-4 py-3">Claimed</th>
                  <th className="text-right px-4 py-3">Approved</th>
                  <th className="text-center px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => {
                  const sc = STATUS_CONFIG[c.status];
                  return (
                    <tr key={c.id} className={`border-b border-[var(--color-border)] hover:bg-[var(--color-bg)] transition ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                      <td className="px-4 py-3 font-mono text-xs font-medium">{c.claim_no}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{c.patient_name}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">{c.patient_code}</p>
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text-muted)]">{c.provider}</td>
                      <td className="px-4 py-3 text-[var(--color-text-muted)] text-xs max-w-[200px] truncate">{c.diagnosis}</td>
                      <td className="px-4 py-3 text-right font-medium">{fmtTaka(c.claimed_amount)}</td>
                      <td className="px-4 py-3 text-right">{c.approved_amount !== null ? fmtTaka(c.approved_amount) : '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${sc.color}`}>
                          {sc.icon} {sc.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">{fmtDate(c.submitted_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 bg-[var(--color-bg)] border-t border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">
            Showing {filtered.length} of {claims.length} claims
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
