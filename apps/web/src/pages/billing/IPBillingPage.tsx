import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import DashboardLayout from '../../components/DashboardLayout';
import BillingSummaryCard from '../../components/billing/BillingSummaryCard';
import StatusBadge from '../../components/billing/StatusBadge';

const api = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

interface Patient { id: number; name: string; patient_code: string; bed_name: string; ward_name: string; admission_id: number; days_admitted: number; }
interface ProvisionalItem { id: number; item_name: string; item_category: string; unit_price: number; quantity: number; total_amount: number; discount_amount: number; bill_status: string; }
interface Summary { total: number; deposit: number; days: number; bed_charges: number; }

const CATEGORIES = ['consultation', 'lab', 'pharmacy', 'procedure', 'bed', 'nursing', 'other'];

export default function IPBillingPage({ role = 'hospital_admin' }: { role?: string }) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selected, setSelected] = useState<Patient | null>(null);
  const [items, setItems] = useState<ProvisionalItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showDischarge, setShowDischarge] = useState(false);
  const [newItem, setNewItem] = useState({ item_name: '', item_category: 'consultation', unit_price: 0, quantity: 1, discount_percent: 0 });
  const [dischargeForm, setDischargeForm] = useState({ discount_amount: 0, remarks: '' });

  useEffect(() => { fetchPatients(); }, []);

  const fetchPatients = async () => {
    try {
      const { data } = await axios.get('/api/ip-billing/admitted', api());
      setPatients(data.patients || []);
    } catch { toast.error('Failed to load admitted patients'); }
    finally { setLoading(false); }
  };

  const fetchCharges = useCallback(async (admissionId: number) => {
    try {
      const { data } = await axios.get(`/api/ip-billing/pending/${admissionId}`, api());
      setItems(data.provisional_items || []);
      setSummary({ total: data.total_charges, deposit: data.deposit_balance, days: data.days_admitted, bed_charges: data.bed_charges });
    } catch { toast.error('Failed to load charges'); }
  }, []);

  const selectPatient = (p: Patient) => { setSelected(p); fetchCharges(p.admission_id); };

  const handleAddItem = async () => {
    if (!selected || !newItem.item_name) { toast.error('Fill in item details'); return; }
    try {
      await axios.post('/api/ip-billing/provisional', { ...newItem, patient_id: selected.id, admission_id: selected.admission_id }, api());
      toast.success('Charge added');
      setShowAdd(false);
      setNewItem({ item_name: '', item_category: 'consultation', unit_price: 0, quantity: 1, discount_percent: 0 });
      fetchCharges(selected.admission_id);
    } catch { toast.error('Failed to add charge'); }
  };

  const handleDischarge = async () => {
    if (!selected) return;
    try {
      await axios.post('/api/ip-billing/discharge-bill', { admission_id: selected.admission_id, patient_id: selected.id, ...dischargeForm }, api());
      toast.success('Discharge bill created!');
      setShowDischarge(false);
      setSelected(null);
      setItems([]);
      setSummary(null);
      fetchPatients();
    } catch (err: any) { toast.error(err.response?.data?.error || 'Failed to create discharge bill'); }
  };

  const filtered = patients.filter(p => p.name?.toLowerCase().includes(search.toLowerCase()) || p.patient_code?.toLowerCase().includes(search.toLowerCase()));

  return (
    <DashboardLayout role={role}>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">IP Billing</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Inpatient charges & discharge billing</p>
          </div>
        </div>

        <div className="flex gap-6 min-h-[600px]">
          {/* Left panel — admitted patients */}
          <div className="w-80 flex-shrink-0 flex flex-col gap-3">
            <input className="input text-sm" placeholder="Search patient…" value={search} onChange={e => setSearch(e.target.value)} />
            <div className="card flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-4 text-center text-[var(--color-text-muted)]">Loading…</div>
              ) : filtered.length === 0 ? (
                <div className="p-6 text-center text-[var(--color-text-muted)]">
                  <div className="text-3xl mb-2">🏥</div>
                  <p className="text-sm">No admitted patients</p>
                </div>
              ) : filtered.map(p => (
                <button key={p.id} onClick={() => selectPatient(p)}
                  className={`w-full text-left px-4 py-3 border-b border-[var(--color-border-light)] hover:bg-[var(--color-bg-secondary)] transition-colors ${selected?.id === p.id ? 'bg-[var(--color-primary-light)] border-l-4 border-l-[var(--color-primary)]' : ''}`}>
                  <div className="font-medium text-sm">{p.name}</div>
                  <div className="text-xs text-[var(--color-text-muted)] mt-0.5">{p.patient_code} • {p.bed_name || 'No bed'}</div>
                  <div className="text-xs text-[var(--color-text-muted)]">{p.ward_name} • Day {p.days_admitted}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Right panel — charges */}
          <div className="flex-1 flex flex-col gap-4">
            {!selected ? (
              <div className="card flex-1 flex items-center justify-center text-[var(--color-text-muted)]">
                <div className="text-center">
                  <div className="text-5xl mb-3">👈</div>
                  <p>Select a patient to view charges</p>
                </div>
              </div>
            ) : (
              <>
                {/* Summary cards */}
                {summary && (
                  <div className="grid grid-cols-4 gap-3">
                    <BillingSummaryCard label="Total Charges" value={summary.total} color="teal" icon="💰" />
                    <BillingSummaryCard label="Bed Charges" value={summary.bed_charges} sub={`${summary.days} days`} color="blue" icon="🛏" />
                    <BillingSummaryCard label="Deposit Balance" value={summary.deposit} color="green" icon="💳" />
                    <BillingSummaryCard label="Net Payable" value={Math.max(0, summary.total - summary.deposit)} color="red" icon="⚡" />
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                  <button onClick={() => setShowAdd(true)} className="btn-primary text-sm px-4 py-2">+ Add Charge</button>
                  <button onClick={() => setShowDischarge(true)} className="bg-red-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-red-700 transition-colors">🏁 Finalize Discharge Bill</button>
                </div>

                {/* Items table */}
                <div className="card overflow-hidden flex-1">
                  <div className="px-4 py-3 border-b border-[var(--color-border)]">
                    <h2 className="font-semibold text-sm">Provisional Charges — {selected.name}</h2>
                  </div>
                  <div className="overflow-auto">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Item</th><th>Category</th><th>Unit Price</th><th>Qty</th><th>Discount</th><th>Total</th><th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.length === 0 ? (
                          <tr><td colSpan={7} className="text-center py-8 text-[var(--color-text-muted)]">No charges yet</td></tr>
                        ) : items.map(item => (
                          <tr key={item.id}>
                            <td className="font-medium">{item.item_name}</td>
                            <td><span className="capitalize text-xs">{item.item_category}</span></td>
                            <td>৳{item.unit_price.toLocaleString()}</td>
                            <td>{item.quantity}</td>
                            <td className="text-red-500">৳{(item.discount_amount || 0).toLocaleString()}</td>
                            <td className="font-semibold">৳{item.total_amount.toLocaleString()}</td>
                            <td><StatusBadge status={item.bill_status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Add Charge Modal */}
        {showAdd && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="card p-6 w-full max-w-md">
              <h3 className="font-bold text-lg mb-4">Add Provisional Charge</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Category</label>
                  <select className="input capitalize" value={newItem.item_category} onChange={e => setNewItem({ ...newItem, item_category: e.target.value })}>
                    {CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Item Name</label>
                  <input className="input" placeholder="e.g. Chest X-Ray" value={newItem.item_name} onChange={e => setNewItem({ ...newItem, item_name: e.target.value })} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Unit Price ৳</label>
                    <input type="number" className="input" value={newItem.unit_price} onChange={e => setNewItem({ ...newItem, unit_price: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Qty</label>
                    <input type="number" min={1} className="input" value={newItem.quantity} onChange={e => setNewItem({ ...newItem, quantity: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Discount %</label>
                    <input type="number" min={0} max={100} className="input" value={newItem.discount_percent} onChange={e => setNewItem({ ...newItem, discount_percent: Number(e.target.value) })} />
                  </div>
                </div>
                <div className="bg-[var(--color-bg-secondary)] p-3 rounded-lg text-sm">
                  <div className="flex justify-between font-semibold">
                    <span>Total Amount:</span>
                    <span className="text-[var(--color-primary)]">৳{(newItem.unit_price * newItem.quantity * (1 - newItem.discount_percent / 100)).toLocaleString()}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={handleAddItem} className="btn-primary flex-1">Add Charge</button>
                <button onClick={() => setShowAdd(false)} className="btn-secondary px-5">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Discharge Confirmation Modal */}
        {showDischarge && selected && summary && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="card p-6 w-full max-w-md">
              <h3 className="font-bold text-lg mb-1">Finalize Discharge Bill</h3>
              <p className="text-sm text-[var(--color-text-muted)] mb-4">Patient: <strong>{selected.name}</strong></p>
              <div className="bg-[var(--color-bg-secondary)] p-4 rounded-lg space-y-2 text-sm mb-4">
                <div className="flex justify-between"><span className="text-[var(--color-text-muted)]">Total Charges:</span><span className="font-semibold">৳{summary.total.toLocaleString()}</span></div>
                <div className="flex justify-between text-green-600"><span>Deposit Balance:</span><span>- ৳{summary.deposit.toLocaleString()}</span></div>
                <div className="flex justify-between text-red-500"><span>Extra Discount:</span><span>- ৳{dischargeForm.discount_amount}</span></div>
                <div className="border-t border-[var(--color-border)] pt-2 flex justify-between font-bold text-base">
                  <span>Net Payable:</span>
                  <span className="text-[var(--color-primary)]">৳{Math.max(0, summary.total - summary.deposit - (dischargeForm.discount_amount || 0)).toLocaleString()}</span>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Extra Discount ৳</label>
                  <input type="number" min={0} className="input" value={dischargeForm.discount_amount} onChange={e => setDischargeForm({ ...dischargeForm, discount_amount: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Remarks</label>
                  <input className="input" placeholder="Optional" value={dischargeForm.remarks} onChange={e => setDischargeForm({ ...dischargeForm, remarks: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={handleDischarge} className="bg-red-600 text-white rounded-lg px-4 py-2 hover:bg-red-700 transition-colors flex-1">Confirm Discharge</button>
                <button onClick={() => setShowDischarge(false)} className="btn-secondary px-5">Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
