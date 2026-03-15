import { useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import DashboardLayout from '../../components/DashboardLayout';
import StatusBadge from '../../components/billing/StatusBadge';

const api = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

interface Bill { id: number; invoice_no: string; total_amount: number; paid_amount: number; status: string; created_at: string; }
interface InvoiceItem { id: number; item_name: string; unit_price: number; quantity: number; total_amount: number; status: string; }

export default function BillCancellationPage({ role = 'hospital_admin' }: { role?: string }) {
  const [search, setSearch] = useState('');
  const [bills, setBills] = useState<Bill[]>([]);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [mode, setMode] = useState<'bill' | 'items'>('bill');
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [confirmWhole, setConfirmWhole] = useState(false);

  const searchBills = async () => {
    if (!search.trim()) { toast.error('Enter patient name or invoice number'); return; }
    setLoading(true);
    try {
      const { data } = await axios.get(`/api/billing?search=${search}`, api());
      setBills(data.bills || []);
      if ((data.bills || []).length === 0) toast.error('No bills found');
    } catch { toast.error('Search failed'); }
    finally { setLoading(false); }
  };

  const selectBill = async (bill: Bill) => {
    setSelectedBill(bill);
    setSelectedItems([]);
    setConfirmWhole(false);
    setLoadingItems(true);
    try {
      const { data } = await axios.get(`/api/billing/${bill.id}`, api());
      setItems(data.bill?.items?.filter((i: InvoiceItem) => i.status !== 'cancelled') || []);
    } catch { toast.error('Failed to load items'); }
    finally { setLoadingItems(false); }
  };

  const handleCancelBill = async () => {
    if (!reason.trim()) { toast.error('Cancellation reason required'); return; }
    if (!selectedBill) return;
    try {
      await axios.put('/api/billing/cancellation/bill/' + selectedBill.id, { reason }, api());
      toast.success('Bill cancelled');
      setSelectedBill(null);
      setBills([]);
      setSearch('');
      setReason('');
      setConfirmWhole(false);
    } catch (err: any) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const handleCancelItems = async () => {
    if (!reason.trim()) { toast.error('Cancellation reason required'); return; }
    if (selectedItems.length === 0) { toast.error('Select items to cancel'); return; }
    try {
      await axios.put('/api/billing/cancellation/items/batch', { item_ids: selectedItems, reason, bill_id: selectedBill?.id }, api());
      toast.success(`${selectedItems.length} item(s) cancelled`);
      setSelectedItems([]);
      setReason('');
      if (selectedBill) selectBill(selectedBill);
    } catch (err: any) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const activeItems = items.filter(i => i.status !== 'cancelled');
  const cancelledTotal = mode === 'items' ? activeItems.filter(i => selectedItems.includes(i.id)).reduce((s, i) => s + i.total_amount, 0) : selectedBill?.total_amount || 0;

  return (
    <DashboardLayout role={role}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Bill Cancellation</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Cancel bills or individual line items</p>
        </div>

        {/* Warning banner */}
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex gap-3">
          <span className="text-red-500 text-lg">⚠️</span>
          <div>
            <div className="font-semibold text-red-700 dark:text-red-400 text-sm">Danger Zone — Cancellations are irreversible</div>
            <div className="text-xs text-red-600 dark:text-red-400 mt-0.5">Cancelled bills and items cannot be restored. Always provide a reason.</div>
          </div>
        </div>

        {/* Search */}
        <div className="card p-4">
          <div className="flex gap-2">
            <input className="input flex-1" placeholder="Search by patient name or invoice number…" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchBills()} />
            <button onClick={searchBills} disabled={loading} className="btn-primary px-5">{loading ? '…' : 'Search'}</button>
          </div>
          {bills.length > 0 && (
            <div className="mt-3 space-y-2">
              {bills.map(b => (
                <button key={b.id} onClick={() => selectBill(b)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedBill?.id === b.id ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]' : 'border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)]'}`}>
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="font-semibold text-sm">{b.invoice_no}</span>
                      <span className="ml-2 text-xs text-[var(--color-text-muted)]">{new Date(b.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-sm">৳{b.total_amount.toLocaleString()}</span>
                      <StatusBadge status={b.status} />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedBill && (
          <div className="space-y-4">
            {/* Mode selector */}
            <div className="flex gap-2">
              <button onClick={() => setMode('bill')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'bill' ? 'bg-red-600 text-white' : 'btn-secondary'}`}>Cancel Entire Bill</button>
              <button onClick={() => setMode('items')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'items' ? 'bg-[var(--color-primary)] text-white' : 'btn-secondary'}`}>Cancel Selected Items</button>
            </div>

            {/* Items table */}
            <div className="card overflow-hidden border-2 border-red-200 dark:border-red-800">
              <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 flex items-center justify-between">
                <span className="font-semibold text-sm text-red-700 dark:text-red-400">Invoice {selectedBill.invoice_no}</span>
                <StatusBadge status={selectedBill.status} />
              </div>
              {loadingItems ? (
                <div className="p-6 text-center text-[var(--color-text-muted)]">Loading items…</div>
              ) : (
                <table className="table">
                  <thead><tr>{mode === 'items' && <th className="w-10"></th>}<th>Item</th><th>Unit Price</th><th>Qty</th><th>Total</th><th>Status</th></tr></thead>
                  <tbody>
                    {items.map(item => (
                      <tr key={item.id} className={item.status === 'cancelled' ? 'opacity-40 line-through' : ''}>
                        {mode === 'items' && (
                          <td><input type="checkbox" disabled={item.status === 'cancelled'} checked={selectedItems.includes(item.id)} onChange={e => setSelectedItems(e.target.checked ? [...selectedItems, item.id] : selectedItems.filter(i => i !== item.id))} className="rounded" /></td>
                        )}
                        <td className="font-medium text-sm">{item.item_name}</td>
                        <td>৳{item.unit_price.toLocaleString()}</td>
                        <td>{item.quantity}</td>
                        <td>৳{item.total_amount.toLocaleString()}</td>
                        <td><StatusBadge status={item.status || 'active'} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Cancel form */}
            <div className="card p-4 border-2 border-red-200 dark:border-red-800 space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Cancellation Reason <span className="text-red-500">*</span></label>
                <input className="input border-red-300 focus:ring-red-500" placeholder="Reason for cancellation…" value={reason} onChange={e => setReason(e.target.value)} />
              </div>

              {cancelledTotal > 0 && (
                <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg text-sm flex justify-between">
                  <span className="text-red-700 dark:text-red-400">Amount to be cancelled:</span>
                  <span className="font-bold text-red-700 dark:text-red-400">৳{cancelledTotal.toLocaleString()}</span>
                </div>
              )}

              {mode === 'bill' && !confirmWhole && (
                <button onClick={() => setConfirmWhole(true)} disabled={!reason.trim()} className="w-full bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 font-medium">
                  Cancel Entire Bill
                </button>
              )}
              {mode === 'bill' && confirmWhole && (
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-red-600 text-center">Are you sure? This cannot be undone.</div>
                  <div className="flex gap-2">
                    <button onClick={handleCancelBill} className="flex-1 bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 font-medium">Yes, Cancel Bill</button>
                    <button onClick={() => setConfirmWhole(false)} className="btn-secondary px-4">No, Go Back</button>
                  </div>
                </div>
              )}
              {mode === 'items' && (
                <button onClick={handleCancelItems} disabled={selectedItems.length === 0 || !reason.trim()} className="w-full bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 font-medium">
                  Cancel {selectedItems.length} Item{selectedItems.length !== 1 ? 's' : ''}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
