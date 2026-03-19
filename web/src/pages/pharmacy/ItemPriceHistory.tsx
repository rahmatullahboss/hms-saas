import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import {
  ChevronLeft, Plus, Loader2, TrendingDown, TrendingUp, History
} from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import DashboardLayout from '../../components/DashboardLayout';

interface PriceEntry {
  id: number;
  batch_no: string | null;
  old_mrp: number | null;
  new_mrp: number;
  old_cost_price: number | null;
  new_cost_price: number;
  change_reason: string | null;
  effective_date: string;
  created_at: string;
  created_by_name: string | null;
}

const fmt = (paisa: number | null) =>
  paisa != null ? `৳${(paisa / 100).toFixed(2)}` : '—';

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-BD', { day: '2-digit', month: 'short', year: 'numeric' });

function DiffBadge({ oldVal, newVal }: { oldVal: number | null; newVal: number }) {
  if (oldVal == null) return <span className="text-xs text-gray-400">First entry</span>;
  const diff = newVal - oldVal;
  if (diff === 0) return <span className="text-xs text-gray-400">No change</span>;
  return (
    <span className={`flex items-center gap-0.5 text-xs font-semibold ${diff > 0 ? 'text-red-500' : 'text-green-600'}`}>
      {diff > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {diff > 0 ? '+' : ''}{fmt(diff)}
    </span>
  );
}

export default function ItemPriceHistory({ role = 'hospital_admin' }: { role?: string }) {
  const navigate = useNavigate();
  const [itemId, setItemId] = useState('');
  const [itemName, setItemName] = useState('');
  const [entries, setEntries] = useState<PriceEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [newPriceForm, setNewPriceForm] = useState({
    new_mrp: '', new_cost_price: '', batch_no: '', change_reason: '',
  });

  const token = () => localStorage.getItem('hms_token');

  const load = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await axios.get(`/api/pharmacy/items/${id}/price-history`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      setEntries(data.data ?? []);
      if (data.data?.length > 0) {
        setItemName(`Item #${id}`);
      }
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 404) toast.error('Item not found');
      else toast.error('Failed to load price history');
    } finally { setLoading(false); }
  }, []);

  const handleSearch = () => {
    if (!itemId) { toast.error('Enter an Item ID'); return; }
    load(itemId);
  };

  const handleRecordPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPriceForm.new_mrp || !newPriceForm.new_cost_price) {
      toast.error('New MRP and Cost Price are required');
      return;
    }
    // F7: Validate decimal precision (max 2 places)
    const mrpVal = parseFloat(newPriceForm.new_mrp);
    const costVal = parseFloat(newPriceForm.new_cost_price);
    if (isNaN(mrpVal) || isNaN(costVal) || mrpVal < 0 || costVal < 0) {
      toast.error('Prices must be valid positive numbers'); return;
    }
    if (String(mrpVal).includes('.') && String(mrpVal).split('.')[1].length > 2) {
      toast.error('MRP can have at most 2 decimal places'); return;
    }
    if (String(costVal).includes('.') && String(costVal).split('.')[1].length > 2) {
      toast.error('Cost Price can have at most 2 decimal places'); return;
    }
    setSaving(true);
    try {
      // Convert BDT to paisa for storage
      const latest = entries[0];
      await axios.post(`/api/pharmacy/items/${itemId}/price-history`, {
        new_mrp: Math.round(mrpVal * 100),
        new_cost_price: Math.round(costVal * 100),
        old_mrp: latest?.new_mrp ?? undefined,
        old_cost_price: latest?.new_cost_price ?? undefined,
        batch_no: newPriceForm.batch_no || undefined,
        change_reason: newPriceForm.change_reason || undefined,
      }, { headers: { Authorization: `Bearer ${token()}` } });
      toast.success('Price recorded and item updated');
      setShowAddForm(false);
      setNewPriceForm({ new_mrp: '', new_cost_price: '', batch_no: '', change_reason: '' });
      load(itemId);
    } catch { toast.error('Failed to record price change'); }
    finally { setSaving(false); }
  };

  return (
    <DashboardLayout role={role}>
      <div className="space-y-5 max-w-screen-lg mx-auto">

        <div className="page-header">
          <div>
            <h1 className="page-title">MRP / Price History</h1>
            <p className="page-subtitle">Track price changes for pharmacy items and update stock</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </button>
        </div>

        {/* Item Lookup */}
        <div className="card p-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="form-label">Item ID</label>
              <input type="number" className="form-control" placeholder="Enter pharmacy item ID"
                value={itemId}
                onChange={e => setItemId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()} />
            </div>
            <button className="btn btn-primary" onClick={handleSearch} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
              <span className="ml-1">Load History</span>
            </button>
            {entries.length > 0 && (
              <button className="btn btn-outline btn-sm" onClick={() => setShowAddForm(!showAddForm)}>
                <Plus className="h-4 w-4 mr-1" /> Record New Price
              </button>
            )}
          </div>
        </div>

        {/* New Price Form */}
        {showAddForm && (
          <div className="card p-4">
            <h3 className="font-semibold mb-3">Record Price Change for {itemName || `Item #${itemId}`}</h3>
            <form onSubmit={handleRecordPrice} className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="form-label">New MRP (৳) <span className="text-red-500">*</span></label>
                <input type="number" step="0.01" min="0" className="form-control"
                  value={newPriceForm.new_mrp}
                  onChange={e => setNewPriceForm(f => ({ ...f, new_mrp: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">New Cost Price (৳) <span className="text-red-500">*</span></label>
                <input type="number" step="0.01" min="0" className="form-control"
                  value={newPriceForm.new_cost_price}
                  onChange={e => setNewPriceForm(f => ({ ...f, new_cost_price: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Batch No. <span className="text-gray-400 text-xs">(optional)</span></label>
                <input type="text" className="form-control"
                  value={newPriceForm.batch_no}
                  onChange={e => setNewPriceForm(f => ({ ...f, batch_no: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Change Reason</label>
                <input type="text" className="form-control" placeholder="e.g. Supplier increase"
                  value={newPriceForm.change_reason}
                  onChange={e => setNewPriceForm(f => ({ ...f, change_reason: e.target.value }))} />
              </div>
              <div className="col-span-2 md:col-span-4 flex gap-2">
                <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  Save Price Change
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAddForm(false)}>Cancel</button>
              </div>
            </form>
          </div>
        )}

        {/* Price History Table */}
        {entries.length > 0 && (
          <div className="card">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="font-semibold">Price History — {itemName || `Item #${itemId}`}</p>
              <p className="text-sm text-gray-500">{entries.length} entries</p>
            </div>
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Batch</th>
                    <th className="text-right">Old MRP</th>
                    <th className="text-right">New MRP</th>
                    <th className="text-right">MRP Δ</th>
                    <th className="text-right">Old Cost</th>
                    <th className="text-right">New Cost</th>
                    <th className="text-right">Cost Δ</th>
                    <th>Reason</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(e => (
                    <tr key={e.id}>
                      <td className="text-sm">{fmtDate(e.effective_date)}</td>
                      <td className="font-mono text-xs text-gray-500">{e.batch_no || '—'}</td>
                      <td className="text-right text-sm text-gray-500">{fmt(e.old_mrp)}</td>
                      <td className="text-right text-sm font-medium">{fmt(e.new_mrp)}</td>
                      <td className="text-right"><DiffBadge oldVal={e.old_mrp} newVal={e.new_mrp} /></td>
                      <td className="text-right text-sm text-gray-500">{fmt(e.old_cost_price)}</td>
                      <td className="text-right text-sm font-medium">{fmt(e.new_cost_price)}</td>
                      <td className="text-right"><DiffBadge oldVal={e.old_cost_price} newVal={e.new_cost_price} /></td>
                      <td className="text-sm text-gray-500 max-w-xs truncate">{e.change_reason || '—'}</td>
                      <td className="text-sm text-gray-500">{e.created_by_name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && entries.length === 0 && itemId && (
          <div className="card p-12 text-center text-gray-400">
            <History className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No price history found for item ID {itemId}</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
