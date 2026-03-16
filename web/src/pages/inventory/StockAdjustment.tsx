import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Wrench, Plus, Trash2, Save } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import DashboardLayout from '../../components/DashboardLayout';

interface Item { ItemId: number; ItemName: string; }
interface Store { StoreId: number; StoreName: string; }
interface AdjItem { ItemId: number; AdjustmentType: string; Quantity: number; Remarks: string; }

export default function StockAdjustment({ role = 'hospital_admin' }: { role?: string }) {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [form, setForm] = useState({ StoreId: '', Remarks: '' });
  const [adjItems, setAdjItems] = useState<AdjItem[]>([{ ItemId: 0, AdjustmentType: 'add', Quantity: 1, Remarks: '' }]);

  useEffect(() => {
    const token = localStorage.getItem('hms_token');
    const h = { Authorization: `Bearer ${token}` };
    axios.get('/api/inventory/items', { params: { page: 1, limit: 200 }, headers: h }).then(r => setItems(r.data.data ?? [])).catch(() => { toast.error('Failed to load items'); });
    axios.get('/api/inventory/stores', { params: { page: 1, limit: 50 }, headers: h }).then(r => setStores(r.data.data ?? [])).catch(() => { toast.error('Failed to load stores'); });
  }, []);

  const addRow = () => setAdjItems(prev => [...prev, { ItemId: 0, AdjustmentType: 'add', Quantity: 1, Remarks: '' }]);
  const removeRow = (idx: number) => setAdjItems(prev => prev.filter((_, i) => i !== idx));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      const token = localStorage.getItem('hms_token');
      await axios.post('/api/inventory/stock/adjustments', { StoreId: Number(form.StoreId), Remarks: form.Remarks, Items: adjItems }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('Stock adjusted'); navigate('/inventory/stock');
    } catch (err: any) { toast.error(err?.response?.data?.error || 'Failed to adjust stock'); }
    finally { setSaving(false); }
  };

  return (
    <DashboardLayout role={role}>
      <div className="space-y-5 max-w-screen-xl mx-auto">
        <div className="page-header"><h1 className="page-title"><Wrench className="w-6 h-6 inline mr-2" />Stock Adjustment</h1></div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="card p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="label">Store *</label><select className="input" required value={form.StoreId} onChange={e => setForm({...form, StoreId: e.target.value})}><option value="">Select…</option>{stores.map(s => <option key={s.StoreId} value={s.StoreId}>{s.StoreName}</option>)}</select></div>
            <div><label className="label">Remarks</label><input className="input" value={form.Remarks} onChange={e => setForm({...form, Remarks: e.target.value})} /></div>
          </div>
          <div className="card overflow-hidden">
            <div className="p-4 border-b border-[var(--color-border)] flex justify-between"><h3 className="font-semibold">Adjustment Items</h3><button type="button" onClick={addRow} className="btn-secondary text-sm"><Plus className="w-4 h-4 mr-1 inline" /> Add</button></div>
            <div className="overflow-x-auto"><table className="table-base"><thead><tr><th>Item *</th><th>Type *</th><th>Qty *</th><th>Reason</th><th></th></tr></thead><tbody>{adjItems.map((item, idx) => (
              <tr key={idx}><td><select className="input" value={item.ItemId} onChange={e => setAdjItems(prev => prev.map((a,i) => i===idx ? {...a, ItemId: Number(e.target.value)} : a))} required><option value="">Select…</option>{items.map(it => <option key={it.ItemId} value={it.ItemId}>{it.ItemName}</option>)}</select></td>
              <td><select className="input w-28" value={item.AdjustmentType} onChange={e => setAdjItems(prev => prev.map((a,i) => i===idx ? {...a, AdjustmentType: e.target.value} : a))}><option value="add">Add (+)</option><option value="subtract">Subtract (−)</option></select></td>
              <td><input className="input w-24" type="number" min="1" value={item.Quantity} onChange={e => setAdjItems(prev => prev.map((a,i) => i===idx ? {...a, Quantity: parseInt(e.target.value)||0} : a))} /></td>
              <td><input className="input" value={item.Remarks} onChange={e => setAdjItems(prev => prev.map((a,i) => i===idx ? {...a, Remarks: e.target.value} : a))} /></td>
              <td>{adjItems.length > 1 && <button type="button" onClick={() => removeRow(idx)} className="btn-ghost p-1 text-red-500"><Trash2 className="w-4 h-4" /></button>}</td></tr>))}</tbody></table></div>
          </div>
          <div className="flex justify-end gap-3"><button type="button" onClick={() => navigate('/inventory/stock')} className="btn-secondary">Cancel</button><button type="submit" disabled={saving} className="btn-primary"><Save className="w-4 h-4 mr-1 inline" /> {saving ? 'Saving…' : 'Apply Adjustment'}</button></div>
        </form>
      </div>
    </DashboardLayout>
  );
}
