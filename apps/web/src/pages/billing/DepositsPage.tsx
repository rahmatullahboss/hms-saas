import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import DashboardLayout from '../../components/DashboardLayout';
import BillingSummaryCard from '../../components/billing/BillingSummaryCard';

const api = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
const MODES = ['cash', 'card', 'bkash', 'nagad', 'bank_transfer', 'cheque'];

interface Deposit { id: number; deposit_receipt_no: string; patient_name: string; patient_code: string; amount: number; transaction_type: string; created_at: string; }

export default function DepositsPage({ role = 'hospital_admin' }: { role?: string }) {
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCollect, setShowCollect] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [balance, setBalance] = useState(0);
  const [form, setForm] = useState({ amount: 0, payment_mode: 'cash', remarks: '' });

  useEffect(() => { fetchDeposits(); }, []);

  const fetchDeposits = async () => {
    setLoading(true);
    try { const { data } = await axios.get('/api/deposits', api()); setDeposits(data.deposits || []); }
    catch { toast.error('Failed to load deposits'); }
    finally { setLoading(false); }
  };

  const searchPatients = async (q: string) => { setPatientSearch(q); if (q.length < 2) { setPatients([]); return; } try { const { data } = await axios.get(`/api/patients?search=${q}`, api()); setPatients(data.patients?.slice(0, 6) || []); } catch { } };

  const selectPatient = async (p: any) => {
    setPatients([]); setPatientSearch(p.name); setSelectedPatient(p);
    try { const { data } = await axios.get(`/api/deposits/balance/${p.id}`, api()); setBalance(data.balance || 0); } catch { setBalance(0); }
  };

  const handleCollect = async () => {
    if (!selectedPatient || !form.amount) { toast.error('Patient and amount required'); return; }
    try {
      await axios.post('/api/deposits', { patient_id: selectedPatient.id, amount: form.amount, payment_mode: form.payment_mode, remarks: form.remarks }, api());
      toast.success('Deposit collected!'); setShowCollect(false); setSelectedPatient(null); setPatientSearch(''); setForm({ amount: 0, payment_mode: 'cash', remarks: '' }); fetchDeposits();
    } catch (err: any) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const totalDeposited = deposits.filter(d => d.transaction_type === 'deposit').reduce((s, d) => s + d.amount, 0);
  const totalRefunded = deposits.filter(d => d.transaction_type !== 'deposit').reduce((s, d) => s + d.amount, 0);

  return (
    <DashboardLayout role={role}>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div><h1 className="text-2xl font-bold">Patient Deposits</h1><p className="text-sm text-[var(--color-text-muted)] mt-0.5">Advance payments & deposit management</p></div>
          <button onClick={() => setShowCollect(true)} className="btn-primary">+ Collect Deposit</button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <BillingSummaryCard label="Total Collected" value={totalDeposited} color="green" icon="💰" />
          <BillingSummaryCard label="Total Refunded" value={totalRefunded} color="red" icon="↩️" />
          <BillingSummaryCard label="Net Held" value={totalDeposited - totalRefunded} color="teal" icon="🏦" />
        </div>

        <div className="card overflow-hidden">
          <table className="table">
            <thead><tr><th>Receipt No</th><th>Patient</th><th>Amount</th><th>Type</th><th>Date</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={5} className="py-8 text-center text-[var(--color-text-muted)]">Loading…</td></tr>
                : deposits.length === 0 ? <tr><td colSpan={5} className="py-8 text-center text-[var(--color-text-muted)]">No deposits yet</td></tr>
                : deposits.map(d => (
                  <tr key={d.id}>
                    <td className="font-mono text-xs font-semibold">{d.deposit_receipt_no}</td>
                    <td><div className="text-sm font-medium">{d.patient_name}</div><div className="text-xs text-[var(--color-text-muted)]">{d.patient_code}</div></td>
                    <td className={`font-semibold ${d.transaction_type === 'deposit' ? 'text-green-600' : 'text-red-500'}`}>{d.transaction_type === 'deposit' ? '+' : '-'}৳{d.amount.toLocaleString()}</td>
                    <td className="capitalize text-xs"><span className={`px-2 py-0.5 rounded-full ${d.transaction_type === 'deposit' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{d.transaction_type}</span></td>
                    <td className="text-xs text-[var(--color-text-muted)]">{new Date(d.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {showCollect && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-md">
            <h3 className="font-bold text-lg mb-4">Collect Deposit</h3>
            <div className="space-y-3">
              <div className="relative">
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Patient *</label>
                <input className="input" placeholder="Search patient…" value={patientSearch} onChange={e => searchPatients(e.target.value)} />
                {patients.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-10 card shadow-lg mt-1 overflow-hidden">
                    {patients.map(p => <button key={p.id} onClick={() => selectPatient(p)} className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--color-bg-secondary)] border-b border-[var(--color-border-light)]">{p.name} <span className="text-xs text-[var(--color-text-muted)]">{p.patient_code}</span></button>)}
                  </div>
                )}
              </div>
              {selectedPatient && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 rounded-lg p-3 text-sm flex justify-between">
                  <span className="text-green-700">Current Deposit Balance</span>
                  <span className="font-bold text-green-700">৳{balance.toLocaleString()}</span>
                </div>
              )}
              <div><label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Amount ৳ *</label><input type="number" min={1} className="input" value={form.amount} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} /></div>
              <div><label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Payment Mode</label>
                <select className="input" value={form.payment_mode} onChange={e => setForm({ ...form, payment_mode: e.target.value })}>
                  {MODES.map(m => <option key={m} value={m} className="capitalize">{m.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div><label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Remarks</label><input className="input" value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} /></div>
            </div>
            <div className="flex gap-3 mt-5"><button onClick={handleCollect} className="btn-primary flex-1">Collect</button><button onClick={() => { setShowCollect(false); setSelectedPatient(null); setPatientSearch(''); }} className="btn-secondary px-5">Cancel</button></div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
