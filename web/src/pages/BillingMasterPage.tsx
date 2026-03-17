import { useState, useEffect, useCallback } from 'react';
import { Settings, Plus, X, Trash2, Edit2, Tag, Layers, Package, Calendar, Building2, CreditCard, ChevronLeft, ChevronRight, Award } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import DashboardLayout from '../components/DashboardLayout';
import EmptyState from '../components/dashboard/EmptyState';
import { authHeader } from '../utils/auth';
import { useTranslation } from 'react-i18next';

/* ───── Shared types ────────────────────────────────────── */
interface Scheme { id: number; scheme_name: string; scheme_code?: string; scheme_type: string; default_discount_percent: number; is_active: boolean; }
interface PriceCategory { id: number; category_name: string; category_code?: string; is_default: boolean; is_active: boolean; }
interface ServiceDept { id: number; department_name: string; department_code?: string; is_active: boolean; }
interface ServiceItem { id: number; item_name: string; item_code?: string; price: number; allow_discount: boolean; tax_applicable: boolean; tax_percent: number; is_active: boolean; }
interface FiscalYear { id: number; fiscal_year_name: string; start_date: string; end_date: string; is_current: boolean; is_active: boolean; }
interface CreditOrg { id: number; organization_name: string; organization_code?: string; contact_person?: string; contact_no?: string; email?: string; credit_limit: number; is_active: boolean; }
interface BillingPackage { id: number; package_name: string; package_code?: string; description?: string; total_price: number; discount_percent: number; is_active: boolean; }
interface MembershipType { id: number; membership_name: string; membership_code?: string; discount_percent: number; description?: string; is_active: boolean; }

const PAGE_SIZE = 25;

const TABS = [
  { key: 'schemes',      label: 'Schemes',        icon: Tag       },
  { key: 'categories',   label: 'Price Categories',icon: Layers    },
  { key: 'departments',  label: 'Service Depts',   icon: Building2 },
  { key: 'items',        label: 'Service Items',   icon: CreditCard},
  { key: 'fiscal',       label: 'Fiscal Years',    icon: Calendar  },
  { key: 'credit',       label: 'Credit Orgs',     icon: Building2 },
  { key: 'packages',     label: 'Packages',        icon: Package   },
  { key: 'memberships',  label: 'Memberships',     icon: Award     },
];

/* ───── Shared components ────────────────────────────────── */
function SkeletonRows({ cols }: { cols: number }) {
  return <>{[...Array(4)].map((_, i) => <tr key={i}>{[...Array(cols)].map((_, j) => <td key={j}><div className="skeleton h-4 w-full rounded" /></td>)}</tr>)}</>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-modal w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)] sticky top-0 bg-white dark:bg-slate-800">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="btn-ghost p-1.5"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Pagination({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between p-3 border-t border-[var(--color-border)]">
      <span className="text-sm text-[var(--color-text-muted)]">{total} records · Page {page} of {totalPages}</span>
      <div className="flex gap-1">
        <button onClick={() => onPage(page - 1)} disabled={page <= 1} className="btn-ghost p-1.5 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
        <button onClick={() => onPage(page + 1)} disabled={page >= totalPages} className="btn-ghost p-1.5 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
      </div>
    </div>
  );
}

/* ───── Schemes ─────────────────────────────────────────── */
const SCHEME_INIT = { scheme_name: '', scheme_code: '', scheme_type: 'general', default_discount_percent: '0' };

function SchemesTab() {
  const [items, setItems] = useState<Scheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [editId, setEditId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(SCHEME_INIT);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get('/api/billing-master/schemes', { params: { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }, headers: authHeader() });
      setItems(data.data ?? []);
      setTotal(data.total ?? data.data?.length ?? 0);
    } catch { setItems([]); } finally { setLoading(false); }
  }, [page]);

  useEffect(() => { loadData(); }, [loadData]);

  const openEdit = (s: Scheme) => {
    setEditId(s.id);
    setForm({ scheme_name: s.scheme_name, scheme_code: s.scheme_code ?? '', scheme_type: s.scheme_type, default_discount_percent: String(s.default_discount_percent) });
    setShowForm(true);
  };

  const openCreate = () => { setEditId(null); setForm(SCHEME_INIT); setShowForm(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const payload = { ...form, default_discount_percent: parseFloat(form.default_discount_percent) };
    try {
      if (editId) await axios.put(`/api/billing-master/schemes/${editId}`, payload, { headers: authHeader() });
      else await axios.post('/api/billing-master/schemes', payload, { headers: authHeader() });
      toast.success(editId ? 'Scheme updated' : 'Scheme created');
      setShowForm(false); setForm(SCHEME_INIT); setEditId(null); loadData();
    } catch (err) { toast.error(axios.isAxiosError(err) ? err.response?.data?.message ?? 'Failed' : 'Failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Deactivate this scheme?')) return;
    try { await axios.delete(`/api/billing-master/schemes/${id}`, { headers: authHeader() }); toast.success('Deactivated'); loadData(); }
    catch (err) { toast.error(axios.isAxiosError(err) ? err.response?.data?.message ?? 'Failed' : 'Failed'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><button onClick={openCreate} className="btn-primary"><Plus className="w-4 h-4" />New Scheme</button></div>
      <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="table-base">
        <thead><tr><th>Scheme Name</th><th>Code</th><th>Type</th><th>Discount %</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {loading ? <SkeletonRows cols={6} />
            : items.length === 0 ? <tr><td colSpan={6}><EmptyState icon={<Tag className="w-8 h-8 text-[var(--color-text-muted)]" />} title="No schemes" description="Create your first billing scheme." action={<button onClick={openCreate} className="btn-primary mt-2"><Plus className="w-4 h-4" />New Scheme</button>} /></td></tr>
            : items.map(s => <tr key={s.id}><td className="font-medium">{s.scheme_name}</td><td className="font-data text-sm">{s.scheme_code ?? '—'}</td><td><span className="badge badge-info capitalize">{s.scheme_type}</span></td><td className="font-data">{s.default_discount_percent}%</td><td><span className={`badge ${s.is_active ? 'badge-success' : 'badge-warning'}`}>{s.is_active ? 'Active' : 'Inactive'}</span></td><td><div className="flex gap-1"><button onClick={() => openEdit(s)} className="btn-ghost p-1.5 text-[var(--color-primary)]"><Edit2 className="w-4 h-4" /></button><button onClick={() => handleDelete(s.id)} className="btn-ghost p-1.5 text-red-500"><Trash2 className="w-4 h-4" /></button></div></td></tr>)}
        </tbody>
      </table></div>
      <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
      </div>
      {showForm && <Modal title={editId ? 'Edit Billing Scheme' : 'New Billing Scheme'} onClose={() => { setShowForm(false); setEditId(null); setForm(SCHEME_INIT); }}>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div><label className="label">Scheme Name *</label><input className="input" required value={form.scheme_name} onChange={e => setForm(f => ({ ...f, scheme_name: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Code</label><input className="input" value={form.scheme_code} onChange={e => setForm(f => ({ ...f, scheme_code: e.target.value }))} /></div>
            <div><label className="label">Discount %</label><input className="input" type="number" min="0" max="100" step="0.1" value={form.default_discount_percent} onChange={e => setForm(f => ({ ...f, default_discount_percent: e.target.value }))} /></div>
          </div>
          <div><label className="label">Type</label><select className="input" value={form.scheme_type} onChange={e => setForm(f => ({ ...f, scheme_type: e.target.value }))}><option value="general">General</option><option value="insurance">Insurance</option><option value="government">Government</option><option value="corporate">Corporate</option></select></div>
          <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={() => { setShowForm(false); setEditId(null); setForm(SCHEME_INIT); }} className="btn-secondary">Cancel</button><button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : editId ? 'Update' : 'Create'}</button></div>
        </form>
      </Modal>}
    </div>
  );
}

/* ───── Price Categories ────────────────────────────────── */
const PCAT_INIT = { category_name: '', category_code: '', is_default: false };

function PriceCategoriesTab() {
  const [items, setItems] = useState<PriceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [editId, setEditId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(PCAT_INIT);

  const loadData = useCallback(async () => {
    setLoading(true);
    try { const { data } = await axios.get('/api/billing-master/price-categories', { params: { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }, headers: authHeader() }); setItems(data.data ?? []); setTotal(data.total ?? data.data?.length ?? 0); }
    catch { setItems([]); } finally { setLoading(false); }
  }, [page]);

  useEffect(() => { loadData(); }, [loadData]);
  const openEdit = (c: PriceCategory) => { setEditId(c.id); setForm({ category_name: c.category_name, category_code: c.category_code ?? '', is_default: c.is_default }); setShowForm(true); };
  const openCreate = () => { setEditId(null); setForm(PCAT_INIT); setShowForm(true); };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      if (editId) await axios.put(`/api/billing-master/price-categories/${editId}`, form, { headers: authHeader() });
      else await axios.post('/api/billing-master/price-categories', form, { headers: authHeader() });
      toast.success(editId ? 'Updated' : 'Created'); setShowForm(false); setForm(PCAT_INIT); setEditId(null); loadData();
    } catch (err) { toast.error(axios.isAxiosError(err) ? err.response?.data?.message ?? 'Failed' : 'Failed'); }
    finally { setSaving(false); }
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><button onClick={openCreate} className="btn-primary"><Plus className="w-4 h-4" />New Category</button></div>
      <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="table-base">
        <thead><tr><th>Category Name</th><th>Code</th><th>Default</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {loading ? <SkeletonRows cols={5} />
            : items.length === 0 ? <tr><td colSpan={5}><EmptyState icon={<Layers className="w-8 h-8 text-[var(--color-text-muted)]" />} title="No price categories" description="Define price tiers." action={<button onClick={openCreate} className="btn-primary mt-2"><Plus className="w-4 h-4" />New</button>} /></td></tr>
            : items.map(c => <tr key={c.id}><td className="font-medium">{c.category_name}</td><td className="font-data text-sm">{c.category_code ?? '—'}</td><td>{c.is_default ? <span className="badge badge-success">Default</span> : '—'}</td><td><span className={`badge ${c.is_active ? 'badge-success' : 'badge-warning'}`}>{c.is_active ? 'Active' : 'Inactive'}</span></td><td><button onClick={() => openEdit(c)} className="btn-ghost p-1.5 text-[var(--color-primary)]"><Edit2 className="w-4 h-4" /></button></td></tr>)}
        </tbody>
      </table></div>
      <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
      </div>
      {showForm && <Modal title={editId ? 'Edit Price Category' : 'New Price Category'} onClose={() => { setShowForm(false); setEditId(null); setForm(PCAT_INIT); }}>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div><label className="label">Category Name *</label><input className="input" required value={form.category_name} onChange={e => setForm(f => ({ ...f, category_name: e.target.value }))} /></div>
          <div><label className="label">Code</label><input className="input" value={form.category_code} onChange={e => setForm(f => ({ ...f, category_code: e.target.value }))} /></div>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.is_default} onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))} className="rounded" /><span className="text-sm">Set as default</span></label>
          <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={() => { setShowForm(false); setEditId(null); setForm(PCAT_INIT); }} className="btn-secondary">Cancel</button><button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : editId ? 'Update' : 'Create'}</button></div>
        </form>
      </Modal>}
    </div>
  );
}

/* ───── Service Items ────────────────────────────────────── */
const SI_INIT = { item_name: '', item_code: '', price: '', allow_discount: true, tax_applicable: false, tax_percent: '0' };

function ServiceItemsTab() {
  const [items, setItems] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [editId, setEditId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(SI_INIT);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE };
      if (search) params.search = search;
      const { data } = await axios.get('/api/billing-master/service-items', { params, headers: authHeader() });
      setItems(data.data ?? []);
      setTotal(data.total ?? data.data?.length ?? 0);
    } catch { setItems([]); } finally { setLoading(false); }
  }, [search, page]);

  useEffect(() => { const t = setTimeout(loadData, 300); return () => clearTimeout(t); }, [loadData]);

  const openEdit = (item: ServiceItem) => {
    setEditId(item.id);
    setForm({ item_name: item.item_name, item_code: item.item_code ?? '', price: String(item.price), allow_discount: item.allow_discount, tax_applicable: item.tax_applicable, tax_percent: String(item.tax_percent ?? 0) });
    setShowForm(true);
  };
  const openCreate = () => { setEditId(null); setForm(SI_INIT); setShowForm(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const payload = { ...form, price: parseFloat(form.price), tax_percent: parseFloat(form.tax_percent) || 0 };
    try {
      if (editId) await axios.put(`/api/billing-master/service-items/${editId}`, payload, { headers: authHeader() });
      else await axios.post('/api/billing-master/service-items', payload, { headers: authHeader() });
      toast.success(editId ? 'Item updated' : 'Item created'); setShowForm(false); setForm(SI_INIT); setEditId(null); loadData();
    } catch (err) { toast.error(axios.isAxiosError(err) ? err.response?.data?.message ?? 'Failed' : 'Failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Deactivate this item?')) return;
    try { await axios.delete(`/api/billing-master/service-items/${id}`, { headers: authHeader() }); toast.success('Deactivated'); loadData(); }
    catch (err) { toast.error(axios.isAxiosError(err) ? err.response?.data?.message ?? 'Failed' : 'Failed'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3 justify-between flex-wrap">
        <input className="input w-64" placeholder="Search items…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        <button onClick={openCreate} className="btn-primary"><Plus className="w-4 h-4" />New Item</button>
      </div>
      <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="table-base">
        <thead><tr><th>Item Name</th><th>Code</th><th>Price (৳)</th><th>Discount</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {loading ? <SkeletonRows cols={6} />
            : items.length === 0 ? <tr><td colSpan={6}><EmptyState icon={<CreditCard className="w-8 h-8 text-[var(--color-text-muted)]" />} title="No service items" description="Add billable service items." action={<button onClick={openCreate} className="btn-primary mt-2"><Plus className="w-4 h-4" />New Item</button>} /></td></tr>
            : items.map(item => <tr key={item.id}><td className="font-medium">{item.item_name}</td><td className="font-data text-sm">{item.item_code ?? '—'}</td><td className="font-data font-medium text-right">৳{(item.price ?? 0).toLocaleString()}</td><td>{item.allow_discount ? <span className="badge badge-success">Yes</span> : <span className="badge badge-warning">No</span>}</td><td><span className={`badge ${item.is_active ? 'badge-success' : 'badge-warning'}`}>{item.is_active ? 'Active' : 'Inactive'}</span></td><td><div className="flex gap-1"><button onClick={() => openEdit(item)} className="btn-ghost p-1.5 text-[var(--color-primary)]"><Edit2 className="w-4 h-4" /></button><button onClick={() => handleDelete(item.id)} className="btn-ghost p-1.5 text-red-500"><Trash2 className="w-4 h-4" /></button></div></td></tr>)}
        </tbody>
      </table></div>
      <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
      </div>
      {showForm && <Modal title={editId ? 'Edit Service Item' : 'New Service Item'} onClose={() => { setShowForm(false); setEditId(null); setForm(SI_INIT); }}>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div><label className="label">Item Name *</label><input className="input" required value={form.item_name} onChange={e => setForm(f => ({ ...f, item_name: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Code</label><input className="input" value={form.item_code} onChange={e => setForm(f => ({ ...f, item_code: e.target.value }))} /></div>
            <div><label className="label">Price (৳) *</label><input className="input" type="number" required min="0" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} /></div>
          </div>
          <div className="flex gap-6 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.allow_discount} onChange={e => setForm(f => ({ ...f, allow_discount: e.target.checked }))} className="rounded" /><span className="text-sm">Allow Discount</span></label>
            <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.tax_applicable} onChange={e => setForm(f => ({ ...f, tax_applicable: e.target.checked }))} className="rounded" /><span className="text-sm">Tax Applicable</span></label>
          </div>
          {form.tax_applicable && <div><label className="label">Tax %</label><input className="input" type="number" min="0" max="100" step="0.1" value={form.tax_percent} onChange={e => setForm(f => ({ ...f, tax_percent: e.target.value }))} /></div>}
          <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={() => { setShowForm(false); setEditId(null); setForm(SI_INIT); }} className="btn-secondary">Cancel</button><button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : editId ? 'Update Item' : 'Create Item'}</button></div>
        </form>
      </Modal>}
    </div>
  );
}

/* ───── Fiscal Years ─────────────────────────────────────── */
const FY_INIT = { fiscal_year_name: '', start_date: '', end_date: '', is_current: false };

function FiscalYearsTab() {
  const [items, setItems] = useState<FiscalYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(FY_INIT);

  const loadData = useCallback(async () => {
    setLoading(true);
    try { const { data } = await axios.get('/api/billing-master/fiscal-years', { headers: authHeader() }); setItems(data.data ?? []); }
    catch { setItems([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  const openEdit = (fy: FiscalYear) => { setEditId(fy.id); setForm({ fiscal_year_name: fy.fiscal_year_name, start_date: fy.start_date, end_date: fy.end_date, is_current: fy.is_current }); setShowForm(true); };
  const openCreate = () => { setEditId(null); setForm(FY_INIT); setShowForm(true); };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      if (editId) await axios.put(`/api/billing-master/fiscal-years/${editId}`, form, { headers: authHeader() });
      else await axios.post('/api/billing-master/fiscal-years', form, { headers: authHeader() });
      toast.success(editId ? 'Updated' : 'Created'); setShowForm(false); setForm(FY_INIT); setEditId(null); loadData();
    } catch (err) { toast.error(axios.isAxiosError(err) ? err.response?.data?.message ?? 'Failed' : 'Failed'); }
    finally { setSaving(false); }
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><button onClick={openCreate} className="btn-primary"><Plus className="w-4 h-4" />New Fiscal Year</button></div>
      <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="table-base">
        <thead><tr><th>Name</th><th>Start Date</th><th>End Date</th><th>Current</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {loading ? <SkeletonRows cols={6} />
            : items.length === 0 ? <tr><td colSpan={6}><EmptyState icon={<Calendar className="w-8 h-8 text-[var(--color-text-muted)]" />} title="No fiscal years" description="Define your accounting periods." action={<button onClick={openCreate} className="btn-primary mt-2"><Plus className="w-4 h-4" />Add</button>} /></td></tr>
            : items.map(fy => <tr key={fy.id}><td className="font-medium">{fy.fiscal_year_name}</td><td className="font-data text-sm">{fy.start_date}</td><td className="font-data text-sm">{fy.end_date}</td><td>{fy.is_current ? <span className="badge badge-success">Current</span> : '—'}</td><td><span className={`badge ${fy.is_active ? 'badge-success' : 'badge-warning'}`}>{fy.is_active ? 'Active' : 'Inactive'}</span></td><td><button onClick={() => openEdit(fy)} className="btn-ghost p-1.5 text-[var(--color-primary)]"><Edit2 className="w-4 h-4" /></button></td></tr>)}
        </tbody>
      </table></div></div>
      {showForm && <Modal title={editId ? 'Edit Fiscal Year' : 'New Fiscal Year'} onClose={() => { setShowForm(false); setEditId(null); setForm(FY_INIT); }}>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div><label className="label">Fiscal Year Name *</label><input className="input" required placeholder="e.g. FY 2025-26" value={form.fiscal_year_name} onChange={e => setForm(f => ({ ...f, fiscal_year_name: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Start Date *</label><input className="input" type="date" required value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} /></div>
            <div><label className="label">End Date *</label><input className="input" type="date" required value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} /></div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.is_current} onChange={e => setForm(f => ({ ...f, is_current: e.target.checked }))} className="rounded" /><span className="text-sm">Set as current fiscal year</span></label>
          <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={() => { setShowForm(false); setEditId(null); setForm(FY_INIT); }} className="btn-secondary">Cancel</button><button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : editId ? 'Update' : 'Create'}</button></div>
        </form>
      </Modal>}
    </div>
  );
}

/* ───── Credit Orgs ──────────────────────────────────────── */
const CO_INIT = { organization_name: '', organization_code: '', contact_person: '', contact_no: '', email: '', credit_limit: '0' };

function CreditOrgsTab() {
  const [items, setItems] = useState<CreditOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(CO_INIT);

  const loadData = useCallback(async () => {
    setLoading(true);
    try { const { data } = await axios.get('/api/billing-master/credit-organizations', { headers: authHeader() }); setItems(data.data ?? []); }
    catch { setItems([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  const openEdit = (org: CreditOrg) => { setEditId(org.id); setForm({ organization_name: org.organization_name, organization_code: org.organization_code ?? '', contact_person: org.contact_person ?? '', contact_no: org.contact_no ?? '', email: org.email ?? '', credit_limit: String(org.credit_limit) }); setShowForm(true); };
  const openCreate = () => { setEditId(null); setForm(CO_INIT); setShowForm(true); };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const payload = { ...form, credit_limit: parseFloat(form.credit_limit) || 0 };
    try {
      if (editId) await axios.put(`/api/billing-master/credit-organizations/${editId}`, payload, { headers: authHeader() });
      else await axios.post('/api/billing-master/credit-organizations', payload, { headers: authHeader() });
      toast.success(editId ? 'Updated' : 'Created'); setShowForm(false); setForm(CO_INIT); setEditId(null); loadData();
    } catch (err) { toast.error(axios.isAxiosError(err) ? err.response?.data?.message ?? 'Failed' : 'Failed'); }
    finally { setSaving(false); }
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><button onClick={openCreate} className="btn-primary"><Plus className="w-4 h-4" />New Org</button></div>
      <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="table-base">
        <thead><tr><th>Organization</th><th>Code</th><th>Contact Person</th><th>Credit Limit (৳)</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {loading ? <SkeletonRows cols={6} />
            : items.length === 0 ? <tr><td colSpan={6}><EmptyState icon={<Building2 className="w-8 h-8 text-[var(--color-text-muted)]" />} title="No credit organizations" description="Add corporate or insurance organizations." action={<button onClick={openCreate} className="btn-primary mt-2"><Plus className="w-4 h-4" />New Org</button>} /></td></tr>
            : items.map(org => <tr key={org.id}><td className="font-medium">{org.organization_name}</td><td className="font-data text-sm">{org.organization_code ?? '—'}</td><td>{org.contact_person ?? '—'}</td><td className="font-data font-medium text-right">৳{(org.credit_limit ?? 0).toLocaleString()}</td><td><span className={`badge ${org.is_active ? 'badge-success' : 'badge-warning'}`}>{org.is_active ? 'Active' : 'Inactive'}</span></td><td><button onClick={() => openEdit(org)} className="btn-ghost p-1.5 text-[var(--color-primary)]"><Edit2 className="w-4 h-4" /></button></td></tr>)}
        </tbody>
      </table></div></div>
      {showForm && <Modal title={editId ? 'Edit Credit Organization' : 'New Credit Organization'} onClose={() => { setShowForm(false); setEditId(null); setForm(CO_INIT); }}>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div><label className="label">Organization Name *</label><input className="input" required value={form.organization_name} onChange={e => setForm(f => ({ ...f, organization_name: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Code</label><input className="input" value={form.organization_code} onChange={e => setForm(f => ({ ...f, organization_code: e.target.value }))} /></div>
            <div><label className="label">Credit Limit (৳)</label><input className="input" type="number" min="0" step="0.01" value={form.credit_limit} onChange={e => setForm(f => ({ ...f, credit_limit: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Contact Person</label><input className="input" value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} /></div>
            <div><label className="label">Phone</label><input className="input" value={form.contact_no} onChange={e => setForm(f => ({ ...f, contact_no: e.target.value }))} /></div>
          </div>
          <div><label className="label">Email</label><input className="input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
          <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={() => { setShowForm(false); setEditId(null); setForm(CO_INIT); }} className="btn-secondary">Cancel</button><button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : editId ? 'Update' : 'Create'}</button></div>
        </form>
      </Modal>}
    </div>
  );
}

/* ───── Packages ─────────────────────────────────────────── */
const PKG_INIT = { package_name: '', package_code: '', description: '', total_price: '', discount_percent: '0' };

function PackagesTab() {
  const [items, setItems] = useState<BillingPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(PKG_INIT);

  const loadData = useCallback(async () => {
    setLoading(true);
    try { const { data } = await axios.get('/api/billing-master/packages', { headers: authHeader() }); setItems(data.data ?? []); }
    catch { setItems([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  const openEdit = (pkg: BillingPackage) => { setEditId(pkg.id); setForm({ package_name: pkg.package_name, package_code: pkg.package_code ?? '', description: pkg.description ?? '', total_price: String(pkg.total_price), discount_percent: String(pkg.discount_percent) }); setShowForm(true); };
  const openCreate = () => { setEditId(null); setForm(PKG_INIT); setShowForm(true); };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const payload = { ...form, total_price: parseFloat(form.total_price), discount_percent: parseFloat(form.discount_percent) || 0 };
    try {
      if (editId) await axios.put(`/api/billing-master/packages/${editId}`, payload, { headers: authHeader() });
      else await axios.post('/api/billing-master/packages', payload, { headers: authHeader() });
      toast.success(editId ? 'Updated' : 'Created'); setShowForm(false); setForm(PKG_INIT); setEditId(null); loadData();
    } catch (err) { toast.error(axios.isAxiosError(err) ? err.response?.data?.message ?? 'Failed' : 'Failed'); }
    finally { setSaving(false); }
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><button onClick={openCreate} className="btn-primary"><Plus className="w-4 h-4" />New Package</button></div>
      <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="table-base">
        <thead><tr><th>Package Name</th><th>Total Price (৳)</th><th>Discount %</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {loading ? <SkeletonRows cols={5} />
            : items.length === 0 ? <tr><td colSpan={5}><EmptyState icon={<Package className="w-8 h-8 text-[var(--color-text-muted)]" />} title="No packages" description="Bundle services into packages." action={<button onClick={openCreate} className="btn-primary mt-2"><Plus className="w-4 h-4" />New</button>} /></td></tr>
            : items.map(pkg => <tr key={pkg.id}><td className="font-medium">{pkg.package_name}</td><td className="font-data font-medium text-right">৳{(pkg.total_price ?? 0).toLocaleString()}</td><td className="font-data">{pkg.discount_percent}%</td><td><span className={`badge ${pkg.is_active ? 'badge-success' : 'badge-warning'}`}>{pkg.is_active ? 'Active' : 'Inactive'}</span></td><td><button onClick={() => openEdit(pkg)} className="btn-ghost p-1.5 text-[var(--color-primary)]"><Edit2 className="w-4 h-4" /></button></td></tr>)}
        </tbody>
      </table></div></div>
      {showForm && <Modal title={editId ? 'Edit Billing Package' : 'New Billing Package'} onClose={() => { setShowForm(false); setEditId(null); setForm(PKG_INIT); }}>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div><label className="label">Package Name *</label><input className="input" required value={form.package_name} onChange={e => setForm(f => ({ ...f, package_name: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Code</label><input className="input" value={form.package_code} onChange={e => setForm(f => ({ ...f, package_code: e.target.value }))} /></div>
            <div><label className="label">Total Price (৳) *</label><input className="input" type="number" required min="0" step="0.01" value={form.total_price} onChange={e => setForm(f => ({ ...f, total_price: e.target.value }))} /></div>
          </div>
          <div><label className="label">Discount %</label><input className="input" type="number" min="0" max="100" step="0.1" value={form.discount_percent} onChange={e => setForm(f => ({ ...f, discount_percent: e.target.value }))} /></div>
          <div><label className="label">Description</label><textarea className="input" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={() => { setShowForm(false); setEditId(null); setForm(PKG_INIT); }} className="btn-secondary">Cancel</button><button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : editId ? 'Update Package' : 'Create Package'}</button></div>
        </form>
      </Modal>}
    </div>
  );
}

/* ───── Service Departments ──────────────────────────────── */
const SD_INIT = { department_name: '', department_code: '' };

function ServiceDeptsTab() {
  const [items, setItems] = useState<ServiceDept[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(SD_INIT);

  const loadData = useCallback(async () => {
    setLoading(true);
    try { const { data } = await axios.get('/api/billing-master/service-departments', { headers: authHeader() }); setItems(data.data ?? []); }
    catch { setItems([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  const openEdit = (d: ServiceDept) => { setEditId(d.id); setForm({ department_name: d.department_name, department_code: d.department_code ?? '' }); setShowForm(true); };
  const openCreate = () => { setEditId(null); setForm(SD_INIT); setShowForm(true); };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      if (editId) await axios.put(`/api/billing-master/service-departments/${editId}`, form, { headers: authHeader() });
      else await axios.post('/api/billing-master/service-departments', form, { headers: authHeader() });
      toast.success(editId ? 'Updated' : 'Created'); setShowForm(false); setForm(SD_INIT); setEditId(null); loadData();
    } catch (err) { toast.error(axios.isAxiosError(err) ? err.response?.data?.message ?? 'Failed' : 'Failed'); }
    finally { setSaving(false); }
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><button onClick={openCreate} className="btn-primary"><Plus className="w-4 h-4" />New Department</button></div>
      <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="table-base">
        <thead><tr><th>Department Name</th><th>Code</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {loading ? <SkeletonRows cols={4} />
            : items.length === 0 ? <tr><td colSpan={4}><EmptyState icon={<Building2 className="w-8 h-8 text-[var(--color-text-muted)]" />} title="No departments" description="Create service departments." action={<button onClick={openCreate} className="btn-primary mt-2"><Plus className="w-4 h-4" />New</button>} /></td></tr>
            : items.map(d => <tr key={d.id}><td className="font-medium">{d.department_name}</td><td className="font-data text-sm">{d.department_code ?? '—'}</td><td><span className={`badge ${d.is_active ? 'badge-success' : 'badge-warning'}`}>{d.is_active ? 'Active' : 'Inactive'}</span></td><td><button onClick={() => openEdit(d)} className="btn-ghost p-1.5 text-[var(--color-primary)]"><Edit2 className="w-4 h-4" /></button></td></tr>)}
        </tbody>
      </table></div></div>
      {showForm && <Modal title={editId ? 'Edit Service Department' : 'New Service Department'} onClose={() => { setShowForm(false); setEditId(null); setForm(SD_INIT); }}>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div><label className="label">Department Name *</label><input className="input" required value={form.department_name} onChange={e => setForm(f => ({ ...f, department_name: e.target.value }))} /></div>
          <div><label className="label">Code</label><input className="input" value={form.department_code} onChange={e => setForm(f => ({ ...f, department_code: e.target.value }))} /></div>
          <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={() => { setShowForm(false); setEditId(null); setForm(SD_INIT); }} className="btn-secondary">Cancel</button><button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : editId ? 'Update' : 'Create'}</button></div>
        </form>
      </Modal>}
    </div>
  );
}

/* ───── Memberships ────────────────────────────────────── */
const MEM_INIT = { membership_name: '', membership_code: '', discount_percent: '0', description: '' };

function MembershipsTab() {
  const [items, setItems] = useState<MembershipType[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [editId, setEditId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(MEM_INIT);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get('/api/billing-master/membership-types', { params: { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }, headers: authHeader() });
      const arr = data.data ?? data.results ?? data ?? [];
      setItems(Array.isArray(arr) ? arr : []);
      setTotal(data.total ?? arr.length ?? 0);
    } catch { setItems([]); } finally { setLoading(false); }
  }, [page]);

  useEffect(() => { loadData(); }, [loadData]);

  const openEdit = (m: MembershipType) => {
    setEditId(m.id);
    setForm({ membership_name: m.membership_name, membership_code: m.membership_code ?? '', discount_percent: String(m.discount_percent), description: m.description ?? '' });
    setShowForm(true);
  };
  const openCreate = () => { setEditId(null); setForm(MEM_INIT); setShowForm(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const payload = { ...form, discount_percent: parseFloat(form.discount_percent) };
    try {
      if (editId) await axios.put(`/api/billing-master/membership-types/${editId}`, payload, { headers: authHeader() });
      else await axios.post('/api/billing-master/membership-types', payload, { headers: authHeader() });
      toast.success(editId ? 'Membership type updated' : 'Membership type created');
      setShowForm(false); setForm(MEM_INIT); setEditId(null); loadData();
    } catch (err) { toast.error(axios.isAxiosError(err) ? err.response?.data?.message ?? 'Failed' : 'Failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Deactivate this membership type?')) return;
    try { await axios.delete(`/api/billing-master/membership-types/${id}`, { headers: authHeader() }); toast.success('Deactivated'); loadData(); }
    catch (err) { toast.error(axios.isAxiosError(err) ? err.response?.data?.message ?? 'Failed' : 'Failed'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-[var(--color-text-muted)]">Define membership tiers with discount percentages that can be assigned to patients.</p>
        <button onClick={openCreate} className="btn-primary"><Plus className="w-4 h-4" />New Membership Type</button>
      </div>
      <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="table-base">
        <thead><tr><th>Membership Name</th><th>Code</th><th>Discount %</th><th>Description</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {loading ? <SkeletonRows cols={6} />
            : items.length === 0 ? <tr><td colSpan={6}><EmptyState icon={<Award className="w-8 h-8 text-[var(--color-text-muted)]" />} title="No membership types" description="Create membership types to offer patient discounts." action={<button onClick={openCreate} className="btn-primary mt-2"><Plus className="w-4 h-4" />New Type</button>} /></td></tr>
            : items.map(m => <tr key={m.id}><td className="font-medium">{m.membership_name}</td><td className="font-data text-sm">{m.membership_code ?? '—'}</td><td className="font-data">{m.discount_percent}%</td><td className="text-sm text-[var(--color-text-muted)] max-w-[200px] truncate">{m.description ?? '—'}</td><td><span className={`badge ${m.is_active !== false ? 'badge-success' : 'badge-warning'}`}>{m.is_active !== false ? 'Active' : 'Inactive'}</span></td><td><div className="flex gap-1"><button onClick={() => openEdit(m)} className="btn-ghost p-1.5 text-[var(--color-primary)]"><Edit2 className="w-4 h-4" /></button><button onClick={() => handleDelete(m.id)} className="btn-ghost p-1.5 text-red-500"><Trash2 className="w-4 h-4" /></button></div></td></tr>)}
        </tbody>
      </table></div>
      <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
      </div>
      {showForm && <Modal title={editId ? 'Edit Membership Type' : 'New Membership Type'} onClose={() => { setShowForm(false); setEditId(null); setForm(MEM_INIT); }}>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div><label className="label">Membership Name *</label><input className="input" required value={form.membership_name} onChange={e => setForm(f => ({ ...f, membership_name: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Code</label><input className="input" value={form.membership_code} onChange={e => setForm(f => ({ ...f, membership_code: e.target.value }))} placeholder="e.g. VIP, CORP" /></div>
            <div><label className="label">Discount %</label><input className="input" type="number" min="0" max="100" step="0.1" value={form.discount_percent} onChange={e => setForm(f => ({ ...f, discount_percent: e.target.value }))} /></div>
          </div>
          <div><label className="label">Description</label><textarea className="input" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Benefits, eligibility, etc." /></div>
          <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={() => { setShowForm(false); setEditId(null); setForm(MEM_INIT); }} className="btn-secondary">Cancel</button><button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : editId ? 'Update' : 'Create'}</button></div>
        </form>
      </Modal>}
    </div>
  );
}

/* ───── Tab Map & Main Page ──────────────────────────────── */
const TAB_MAP: Record<string, React.ComponentType> = {
  schemes: SchemesTab, categories: PriceCategoriesTab, departments: ServiceDeptsTab,
  items: ServiceItemsTab, fiscal: FiscalYearsTab, credit: CreditOrgsTab, packages: PackagesTab,
  memberships: MembershipsTab,
};

export default function BillingMasterPage({ role = 'hospital_admin' }: { role?: string }) {
  const [activeTab, setActiveTab] = useState('schemes');
  const TabComponent = TAB_MAP[activeTab];
  const { t } = useTranslation(['billing', 'common']);
  return (
    <DashboardLayout role={role}>
      <div className="space-y-5 max-w-screen-2xl mx-auto">
        <div className="page-header">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Settings className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="page-title">Billing Master</h1>
              <p className="section-subtitle">Configure schemes, pricing, service items, and packages</p>
            </div>
          </div>
        </div>
        <div className="card p-1.5 flex gap-1 flex-wrap">
          {TABS.map(tab => { const Icon = tab.icon; return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.key ? 'bg-[var(--color-primary)] text-white shadow-sm' : 'hover:bg-[var(--color-border-light)] text-[var(--color-text-secondary)]'}`}
            ><Icon className="w-4 h-4" />{tab.label}</button>
          ); })}
        </div>
        <TabComponent />
      </div>
    </DashboardLayout>
  );
}
