import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, X, Phone } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import DashboardLayout from '../../components/DashboardLayout';
import { useTranslation } from 'react-i18next';

interface Supplier { id: number; name: string; contact_person?: string; phone?: string; email?: string; address?: string; is_active: number; }
const EMPTY = { name: '', contactPerson: '', phone: '', email: '', address: '' };

export default function SupplierList({ role = 'hospital_admin' }: { role?: string }) {
  const { t } = useTranslation(['pharmacy', 'common']);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('hms_token');
      const { data } = await axios.get('/api/pharmacy/pharmacy-suppliers', { headers: { Authorization: `Bearer ${token}` } });
      setSuppliers(data.suppliers ?? []);
    } catch { setSuppliers([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      const token = localStorage.getItem('hms_token');
      const headers = { Authorization: `Bearer ${token}` };
      if (editing) {
        await axios.put(`/api/pharmacy/pharmacy-suppliers/${editing.id}`, form, { headers });
        toast.success('Supplier updated');
      } else {
        await axios.post('/api/pharmacy/pharmacy-suppliers', form, { headers });
        toast.success('Supplier created');
      }
      setShowModal(false); fetch();
    } catch { toast.error('Failed to save supplier'); } finally { setSaving(false); }
  };

  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({ name: s.name, contactPerson: s.contact_person ?? '', phone: s.phone ?? '', email: s.email ?? '', address: s.address ?? '' });
    setShowModal(true);
  };

  const handleToggle = async (s: Supplier) => {
    try {
      const token = localStorage.getItem('hms_token');
      const action = s.is_active ? 'deactivate' : 'activate';
      await axios.put(`/api/pharmacy/pharmacy-suppliers/${s.id}/${action}`, {}, { headers: { Authorization: `Bearer ${token}` } });
      toast.success(`Supplier ${action}d`); fetch();
    } catch { toast.error('Failed'); }
  };

  return (
    <DashboardLayout role={role}>
      <div className="space-y-5 max-w-screen-2xl mx-auto">
        <div className="page-header">
          <div><h1 className="page-title">{t('suppliers', { defaultValue: 'Pharmacy Suppliers' })}</h1><p className="section-subtitle mt-1">{t('suppliersSubtitle', { defaultValue: 'Manage medicine suppliers and vendors' })}</p></div>
          <button onClick={() => { setEditing(null); setForm({...EMPTY}); setShowModal(true); }} className="btn-primary"><Plus className="w-4 h-4" /> Add Supplier</button>
        </div>
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>#</th><th>Name</th><th>Contact Person</th><th>Phone</th><th>Email</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {loading ? ([...Array(4)].map((_, i) => <tr key={i}>{[...Array(7)].map((_, j) => <td key={j}><div className="skeleton h-4 w-full rounded" /></td>)}</tr>))
                : suppliers.length === 0 ? (<tr><td colSpan={7} className="py-16 text-center text-[var(--color-text-muted)]">No suppliers yet</td></tr>)
                : suppliers.map((s, idx) => (
                  <tr key={s.id}>
                    <td className="text-[var(--color-text-muted)] text-sm">{idx + 1}</td>
                    <td className="font-medium">{s.name}</td>
                    <td className="text-[var(--color-text-secondary)]">{s.contact_person || '—'}</td>
                    <td>{s.phone ? <a href={`tel:${s.phone}`} className="flex items-center gap-1 text-[var(--color-primary)] hover:underline"><Phone className="w-3 h-3" />{s.phone}</a> : '—'}</td>
                    <td className="text-[var(--color-text-secondary)]">{s.email || '—'}</td>
                    <td><span className={`badge ${s.is_active ? 'badge-success' : 'badge-secondary'}`}>{s.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td><div className="flex gap-1.5">
                      <button onClick={() => openEdit(s)} className="btn-ghost p-1.5"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => handleToggle(s)} className="btn-ghost p-1.5 text-xs">{s.is_active ? 'Deactivate' : 'Activate'}</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-modal w-full max-w-md">
              <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)]">
                <h3 className="font-semibold">{editing ? 'Edit Supplier' : 'Add Supplier'}</h3>
                <button onClick={() => setShowModal(false)} className="btn-ghost p-1.5"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleSubmit} className="p-5 space-y-4">
                <div><label className="label">Supplier Name *</label><input className="input" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="label">Contact Person</label><input className="input" value={form.contactPerson} onChange={e => setForm({...form, contactPerson: e.target.value})} /></div>
                  <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} /></div>
                </div>
                <div><label className="label">Email</label><input className="input" type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></div>
                <div><label className="label">Address</label><textarea className="input" rows={2} value={form.address} onChange={e => setForm({...form, address: e.target.value})} /></div>
                <div className="flex justify-end gap-3"><button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button><button type="submit" disabled={saving} className="btn-primary">{saving ? '…' : 'Save'}</button></div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
