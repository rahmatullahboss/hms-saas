import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import DashboardLayout from '../../components/DashboardLayout';
import BillingSummaryCard from '../../components/billing/BillingSummaryCard';
import StatusBadge from '../../components/billing/StatusBadge';

const api = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

interface Settlement { id: number; patient_name: string; patient_code: string; settlement_receipt_no: string; payable_amount: number; paid_amount: number; deposit_deducted: number; discount_amount: number; payment_mode: string; created_at: string; }
interface PendingBill { id: number; invoice_no: string; total_amount: number; paid_amount: number; due_amount: number; created_at: string; }
interface PatientInfo { patient: { id: number; name: string; patient_code: string; mobile: string }; pending_bills: PendingBill[]; deposit_balance: number; total_due: number; net_payable: number; }

const MODES = ['cash', 'card', 'bkash', 'nagad', 'bank_transfer', 'cheque'];

export default function SettlementsPage({ role = 'hospital_admin' }: { role?: string }) {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [patients, setPatients] = useState<any[]>([]);
  const [patientInfo, setPatientInfo] = useState<PatientInfo | null>(null);
  const [selectedBills, setSelectedBills] = useState<number[]>([]);
  const [form, setForm] = useState({ paid_amount: 0, deposit_deducted: 0, discount_amount: 0, payment_mode: 'cash', remarks: '' });
  const [searching, setSearching] = useState(false);

  useEffect(() => { fetchSettlements(); }, []);

  const fetchSettlements = async () => {
    try {
      const { data } = await axios.get('/api/settlements', api());
      setSettlements(data.settlements || []);
    } catch { toast.error('Failed to load settlements'); }
    finally { setLoading(false); }
  };

  const searchPatients = async (q: string) => {
    setPatientSearch(q);
    if (q.length < 2) { setPatients([]); return; }
    setSearching(true);
    try {
      const { data } = await axios.get(`/api/patients?search=${q}`, api());
      setPatients(data.patients?.slice(0, 8) || []);
    } catch { } finally { setSearching(false); }
  };

  const selectPatient = async (p: any) => {
    setPatients([]);
    setPatientSearch(p.name);
    try {
      const { data } = await axios.get(`/api/settlements/patient/${p.id}/info`, api());
      setPatientInfo(data);
      setSelectedBills([]);
      setForm({ paid_amount: 0, deposit_deducted: 0, discount_amount: 0, payment_mode: 'cash', remarks: '' });
    } catch { toast.error('Failed to load patient info'); }
  };

  const toggleBill = (id: number, due: number) => {
    if (selectedBills.includes(id)) {
      setSelectedBills(prev => prev.filter(b => b !== id));
    } else {
      setSelectedBills(prev => [...prev, id]);
    }
  };

  const selectedDue = patientInfo?.pending_bills.filter(b => selectedBills.includes(b.id)).reduce((s, b) => s + b.due_amount, 0) || 0;
  const totalPayment = form.paid_amount + form.deposit_deducted + form.discount_amount;
  const overpay = totalPayment > selectedDue + 0.01;

  const handleSettle = async () => {
    if (!patientInfo || selectedBills.length === 0) { toast.error('Select at least one bill'); return; }
    if (overpay) { toast.error('Total payment exceeds due amount'); return; }
    try {
      await axios.post('/api/settlements', { patient_id: patientInfo.patient.id, bill_ids: selectedBills, ...form }, api());
      toast.success('Settlement created!');
      setShowCreate(false);
      setPatientInfo(null);
      setPatientSearch('');
      setSelectedBills([]);
      fetchSettlements();
    } catch (err: any) { toast.error(err.response?.data?.error || 'Settlement failed'); }
  };

  return (
    <DashboardLayout role={role}>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Settlements</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Collect payment for credit bills</p>
          </div>
          <button onClick={() => setShowCreate(true)} className="btn-primary">+ New Settlement</button>
        </div>

        {/* Settlement history */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--color-border)] font-semibold text-sm">Settlement History</div>
          <div className="overflow-auto">
            <table className="table">
              <thead>
                <tr><th>Receipt No</th><th>Patient</th><th>Payable</th><th>Paid</th><th>Deposit</th><th>Discount</th><th>Mode</th><th>Date</th></tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="text-center py-8 text-[var(--color-text-muted)]">Loading…</td></tr>
                ) : settlements.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-8 text-[var(--color-text-muted)]">No settlements yet</td></tr>
                ) : settlements.map(s => (
                  <tr key={s.id}>
                    <td className="font-mono text-xs font-semibold">{s.settlement_receipt_no}</td>
                    <td>
                      <div className="font-medium text-sm">{s.patient_name}</div>
                      <div className="text-xs text-[var(--color-text-muted)]">{s.patient_code}</div>
                    </td>
                    <td className="font-semibold">৳{s.payable_amount.toLocaleString()}</td>
                    <td className="text-green-600 font-semibold">৳{s.paid_amount.toLocaleString()}</td>
                    <td className="text-blue-600">৳{(s.deposit_deducted || 0).toLocaleString()}</td>
                    <td className="text-red-500">৳{(s.discount_amount || 0).toLocaleString()}</td>
                    <td className="capitalize text-xs">{s.payment_mode}</td>
                    <td className="text-xs text-[var(--color-text-muted)]">{new Date(s.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Create Settlement Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="card p-6 w-full max-w-2xl my-8">
            <h3 className="font-bold text-lg mb-4">New Settlement</h3>

            {/* Patient search */}
            <div className="relative mb-4">
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Search Patient</label>
              <input className="input" placeholder="Type name or code…" value={patientSearch} onChange={e => searchPatients(e.target.value)} />
              {searching && <div className="absolute right-3 top-8 text-xs text-[var(--color-text-muted)]">…</div>}
              {patients.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-10 card shadow-lg mt-1 overflow-hidden max-h-48 overflow-y-auto">
                  {patients.map(p => (
                    <button key={p.id} onClick={() => selectPatient(p)}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--color-bg-secondary)] border-b border-[var(--color-border-light)]">
                      <span className="font-medium">{p.name}</span>
                      <span className="text-[var(--color-text-muted)] ml-2 text-xs">{p.patient_code} • {p.mobile}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {patientInfo && (
              <>
                {/* Summary */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <BillingSummaryCard label="Total Due" value={patientInfo.total_due} color="red" icon="📋" />
                  <BillingSummaryCard label="Deposit Balance" value={patientInfo.deposit_balance} color="green" icon="💳" />
                  <BillingSummaryCard label="Net Payable" value={patientInfo.net_payable} color="teal" icon="⚡" />
                </div>

                {/* Bill selection */}
                <div className="mb-4">
                  <div className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">Select Bills to Settle</div>
                  <div className="card overflow-hidden">
                    {patientInfo.pending_bills.map(bill => (
                      <label key={bill.id} className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border-light)] hover:bg-[var(--color-bg-secondary)] cursor-pointer">
                        <input type="checkbox" checked={selectedBills.includes(bill.id)} onChange={() => toggleBill(bill.id, bill.due_amount)} className="rounded" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{bill.invoice_no}</div>
                          <div className="text-xs text-[var(--color-text-muted)]">{new Date(bill.created_at).toLocaleDateString()}</div>
                        </div>
                        <div className="text-right text-sm">
                          <div className="font-semibold text-red-500">৳{bill.due_amount.toLocaleString()} due</div>
                          <div className="text-xs text-[var(--color-text-muted)]">of ৳{bill.total_amount.toLocaleString()}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                  {selectedBills.length > 0 && <div className="text-sm font-semibold text-right mt-2 text-[var(--color-primary)]">Selected Due: ৳{selectedDue.toLocaleString()}</div>}
                </div>

                {/* Payment form */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Cash Payment ৳</label>
                    <input type="number" min={0} className="input" value={form.paid_amount} onChange={e => setForm({ ...form, paid_amount: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Deposit Deduction ৳ (max {patientInfo.deposit_balance})</label>
                    <input type="number" min={0} max={patientInfo.deposit_balance} className="input" value={form.deposit_deducted} onChange={e => setForm({ ...form, deposit_deducted: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Discount ৳</label>
                    <input type="number" min={0} className="input" value={form.discount_amount} onChange={e => setForm({ ...form, discount_amount: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Payment Mode</label>
                    <select className="input capitalize" value={form.payment_mode} onChange={e => setForm({ ...form, payment_mode: e.target.value })}>
                      {MODES.map(m => <option key={m} value={m} className="capitalize">{m.replace('_', ' ')}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Remarks</label>
                    <input className="input" placeholder="Optional" value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} />
                  </div>
                </div>

                {/* Total summary */}
                <div className={`p-4 rounded-lg text-sm mb-4 ${overpay ? 'bg-red-50 dark:bg-red-900/20 border border-red-200' : 'bg-[var(--color-bg-secondary)]'}`}>
                  <div className="flex justify-between"><span className="text-[var(--color-text-muted)]">Cash</span><span>৳{form.paid_amount.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--color-text-muted)]">Deposit</span><span>৳{form.deposit_deducted.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--color-text-muted)]">Discount</span><span>৳{form.discount_amount.toLocaleString()}</span></div>
                  <div className="border-t border-[var(--color-border)] mt-2 pt-2 flex justify-between font-bold">
                    <span>Total Payment</span>
                    <span className={overpay ? 'text-red-600' : 'text-[var(--color-primary)]'}>৳{totalPayment.toLocaleString()}</span>
                  </div>
                  {overpay && <div className="text-red-600 text-xs mt-1">⚠ Exceeds selected due of ৳{selectedDue.toLocaleString()}</div>}
                </div>
              </>
            )}

            <div className="flex gap-3">
              <button onClick={handleSettle} disabled={!patientInfo || selectedBills.length === 0 || overpay} className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed">Confirm Settlement</button>
              <button onClick={() => { setShowCreate(false); setPatientInfo(null); setPatientSearch(''); }} className="btn-secondary px-5">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
