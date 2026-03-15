import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import DashboardLayout from '../../components/DashboardLayout';
import StatusBadge from '../../components/billing/StatusBadge';

const api = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

interface CreditNote { id: number; credit_note_no: string; patient_name: string; patient_code: string; reason: string; total_amount: number; refund_amount: number; payment_mode: string; created_at: string; }
interface InvoiceItem { id: number; item_name: string; unit_price: number; quantity: number; total_amount: number; returned_qty?: number; remaining_qty?: number; }

export default function CreditNotesPage({ role = 'hospital_admin' }: { role?: string }) {
  const [notes, setNotes] = useState<CreditNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [returnQtys, setReturnQtys] = useState<Record<number, number>>({});
  const [form, setForm] = useState({ reason: '', payment_mode: 'cash', bill_id: 0, patient_id: 0 });
  const [loadingInvoice, setLoadingInvoice] = useState(false);

  useEffect(() => { fetchNotes(); }, []);

  const fetchNotes = async () => {
    try {
      const { data } = await axios.get('/api/credit-notes', api());
      setNotes(data.credit_notes || []);
    } catch { toast.error('Failed to load credit notes'); }
    finally { setLoading(false); }
  };

  const loadInvoice = async () => {
    if (!invoiceNo.trim()) { toast.error('Enter invoice number'); return; }
    setLoadingInvoice(true);
    try {
      // Search bill by invoice no first
      const { data: bills } = await axios.get(`/api/billing?search=${invoiceNo}`, api());
      const bill = bills.bills?.[0];
      if (!bill) { toast.error('Invoice not found'); return; }
      const { data } = await axios.get(`/api/credit-notes/invoice/${bill.id}`, api());
      setInvoiceItems(data.invoice_items || []);
      const initQtys: Record<number, number> = {};
      (data.invoice_items || []).forEach((item: InvoiceItem) => { initQtys[item.id] = 0; });
      setReturnQtys(initQtys);
      setForm({ ...form, bill_id: bill.id, patient_id: bill.patient_id });
    } catch { toast.error('Failed to load invoice'); }
    finally { setLoadingInvoice(false); }
  };

  const totalRefund = invoiceItems.reduce((sum, item) => sum + (item.unit_price * (returnQtys[item.id] || 0)), 0);

  const handleCreate = async () => {
    if (!form.reason) { toast.error('Reason is required'); return; }
    const return_items = invoiceItems
      .filter(item => (returnQtys[item.id] || 0) > 0)
      .map(item => ({ invoice_item_id: item.id, return_quantity: returnQtys[item.id] }));
    if (return_items.length === 0) { toast.error('Select at least one item to return'); return; }
    try {
      await axios.post('/api/credit-notes', { ...form, return_items, refund_payment_mode: form.payment_mode }, api());
      toast.success('Credit note created');
      setShowCreate(false);
      setInvoiceItems([]);
      setReturnQtys({});
      setInvoiceNo('');
      setForm({ reason: '', payment_mode: 'cash', bill_id: 0, patient_id: 0 });
      fetchNotes();
    } catch (err: any) { toast.error(err.response?.data?.error || 'Failed to create credit note'); }
  };

  return (
    <DashboardLayout role={role}>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Credit Notes</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Item returns & refunds</p>
          </div>
          <button onClick={() => setShowCreate(true)} className="btn-primary">+ New Credit Note</button>
        </div>

        <div className="card overflow-hidden">
          <table className="table">
            <thead>
              <tr><th>Credit Note #</th><th>Patient</th><th>Reason</th><th>Total</th><th>Refund</th><th>Mode</th><th>Date</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-8 text-[var(--color-text-muted)]">Loading…</td></tr>
              ) : notes.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-[var(--color-text-muted)]">No credit notes yet</td></tr>
              ) : notes.map(n => (
                <tr key={n.id}>
                  <td className="font-mono text-xs font-semibold text-[var(--color-primary)]">{n.credit_note_no}</td>
                  <td><div className="text-sm font-medium">{n.patient_name}</div><div className="text-xs text-[var(--color-text-muted)]">{n.patient_code}</div></td>
                  <td className="text-sm max-w-xs truncate">{n.reason}</td>
                  <td>৳{n.total_amount.toLocaleString()}</td>
                  <td className="font-semibold text-red-500">৳{n.refund_amount.toLocaleString()}</td>
                  <td className="capitalize text-xs">{n.payment_mode}</td>
                  <td className="text-xs text-[var(--color-text-muted)]">{new Date(n.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="card p-6 w-full max-w-2xl my-8">
            <h3 className="font-bold text-lg mb-4">New Credit Note</h3>

            {/* Invoice lookup */}
            <div className="flex gap-2 mb-4">
              <input className="input flex-1" placeholder="Enter invoice number…" value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && loadInvoice()} />
              <button onClick={loadInvoice} disabled={loadingInvoice} className="btn-primary px-4">{loadingInvoice ? '…' : 'Load'}</button>
            </div>

            {invoiceItems.length > 0 && (
              <>
                <div className="card overflow-hidden mb-4">
                  <div className="px-4 py-2 border-b border-[var(--color-border)] text-xs font-medium text-[var(--color-text-secondary)]">Select items to return</div>
                  <table className="table text-sm">
                    <thead>
                      <tr><th>Item</th><th>Unit Price</th><th>Qty Billed</th><th>Available</th><th>Return Qty</th><th>Refund</th></tr>
                    </thead>
                    <tbody>
                      {invoiceItems.map(item => (
                        <tr key={item.id}>
                          <td className="font-medium">{item.item_name}</td>
                          <td>৳{item.unit_price.toLocaleString()}</td>
                          <td>{item.quantity}</td>
                          <td className="text-green-600">{item.remaining_qty ?? item.quantity}</td>
                          <td>
                            <input type="number" min={0} max={item.remaining_qty ?? item.quantity} value={returnQtys[item.id] || 0}
                              onChange={e => setReturnQtys({ ...returnQtys, [item.id]: Math.min(Number(e.target.value), item.remaining_qty ?? item.quantity) })}
                              className="w-20 input text-sm py-1" />
                          </td>
                          <td className="font-semibold text-red-500">৳{(item.unit_price * (returnQtys[item.id] || 0)).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 rounded-lg text-sm mb-4 flex justify-between font-bold">
                  <span>Total Refund Amount:</span>
                  <span className="text-red-600 text-lg">৳{totalRefund.toLocaleString()}</span>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Reason <span className="text-red-500">*</span></label>
                    <input className="input" placeholder="Reason for return/refund…" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Refund Mode</label>
                    <select className="input" value={form.payment_mode} onChange={e => setForm({ ...form, payment_mode: e.target.value })}>
                      {['cash', 'card', 'bkash', 'nagad', 'bank_transfer'].map(m => <option key={m} value={m} className="capitalize">{m.replace('_', ' ')}</option>)}
                    </select>
                  </div>
                </div>
              </>
            )}

            <div className="flex gap-3">
              <button onClick={handleCreate} disabled={invoiceItems.length === 0} className="btn-primary flex-1 disabled:opacity-50">Create Credit Note</button>
              <button onClick={() => { setShowCreate(false); setInvoiceItems([]); setInvoiceNo(''); }} className="btn-secondary px-5">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
