import { useState, useEffect, useCallback } from 'react';
import { FlaskConical, Plus, X, Trash2, Tag, FileText, Truck, Hash } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import DashboardLayout from '../components/DashboardLayout';
import EmptyState from '../components/dashboard/EmptyState';
import { authHeader } from '../utils/auth';
import { useTranslation } from 'react-i18next';

const TABS = [
  { key: 'categories', label: 'Test Categories', icon: Tag       },
  { key: 'templates',  label: 'Report Templates',icon: FileText  },
  { key: 'vendors',    label: 'Vendors',          icon: Truck     },
  { key: 'runnumber',  label: 'Run Number',       icon: Hash      },
];

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

function CategoriesTab() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ category_name: '', category_code: '', description: '' });
  const loadData = useCallback(async () => {
    setLoading(true);
    try { const { data } = await axios.get('/api/lab-settings/categories', { headers: authHeader() }); setItems(data.data ?? []); }
    catch { setItems([]); } finally { setLoading(false); }
  }, []);
  useEffect(() => { loadData(); }, [loadData]);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try { await axios.post('/api/lab-settings/categories', form, { headers: authHeader() }); toast.success('Category created'); setShowForm(false); loadData(); }
    catch (err) { toast.error(axios.isAxiosError(err) ? err.response?.data?.message ?? 'Failed' : 'Failed'); }
    finally { setSaving(false); }
  };
  const handleDelete = async (id: number) => {
    if (!confirm('Deactivate this category?')) return;
    try { await axios.delete(`/api/lab-settings/categories/${id}`, { headers: authHeader() }); toast.success('Deactivated'); loadData(); }
    catch (err) { toast.error(axios.isAxiosError(err) ? err.response?.data?.message ?? 'Failed' : 'Failed'); }
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><button onClick={() => setShowForm(true)} className="btn-primary"><Plus className="w-4 h-4" />New Category</button></div>
      <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="table-base">
        <thead><tr><th>Category Name</th><th>Code</th><th>Description</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {loading ? <SkeletonRows cols={5} />
            : items.length === 0 ? <tr><td colSpan={5}><EmptyState icon={<Tag className="w-8 h-8 text-[var(--color-text-muted)]" />} title="No lab categories" description="Organize tests into categories." action={<button onClick={() => setShowForm(true)} className="btn-primary mt-2"><Plus className="w-4 h-4" />New Category</button>} /></td></tr>
            : items.map(c => <tr key={c.id}><td className="font-medium">{c.category_name}</td><td className="font-data text-sm">{c.category_code ?? '—'}</td><td className="text-[var(--color-text-secondary)]">{c.description ?? '—'}</td><td><span className={`badge ${c.is_active ? 'badge-success' : 'badge-warning'}`}>{c.is_active ? 'Active' : 'Inactive'}</span></td><td><button onClick={() => handleDelete(c.id)} className="btn-ghost p-1.5 text-red-500"><Trash2 className="w-4 h-4" /></button></td></tr>)}
        </tbody>
      </table></div></div>
      {showForm && <Modal title="New Lab Category" onClose={() => setShowForm(false)}>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div><label className="label">Category Name *</label><input className="input" required value={form.category_name} onChange={e => setForm(f => ({ ...f, category_name: e.target.value }))} /></div>
          <div><label className="label">Code</label><input className="input" value={form.category_code} onChange={e => setForm(f => ({ ...f, category_code: e.target.value }))} /></div>
          <div><label className="label">Description</label><input className="input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button><button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Create'}</button></div>
        </form>
      </Modal>}
    </div>
  );
}

function TemplatesTab() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ template_name: '', template_code: '', header_html: '', footer_html: '', is_default: false });
  const loadData = useCallback(async () => {
    setLoading(true);
    try { const { data } = await axios.get('/api/lab-settings/templates', { headers: authHeader() }); setItems(data.data ?? []); }
    catch { setItems([]); } finally { setLoading(false); }
  }, []);
  useEffect(() => { loadData(); }, [loadData]);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try { await axios.post('/api/lab-settings/templates', form, { headers: authHeader() }); toast.success('Template created'); setShowForm(false); loadData(); }
    catch (err) { toast.error(axios.isAxiosError(err) ? err.response?.data?.message ?? 'Failed' : 'Failed'); }
    finally { setSaving(false); }
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><button onClick={() => setShowForm(true)} className="btn-primary"><Plus className="w-4 h-4" />New Template</button></div>
      <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="table-base">
        <thead><tr><th>Template Name</th><th>Code</th><th>Default</th><th>Status</th></tr></thead>
        <tbody>
          {loading ? <SkeletonRows cols={4} />
            : items.length === 0 ? <tr><td colSpan={4}><EmptyState icon={<FileText className="w-8 h-8 text-[var(--color-text-muted)]" />} title="No report templates" description="Create lab report print templates." action={<button onClick={() => setShowForm(true)} className="btn-primary mt-2"><Plus className="w-4 h-4" />New Template</button>} /></td></tr>
            : items.map(t => <tr key={t.id}><td className="font-medium">{t.template_name}</td><td className="font-data text-sm">{t.template_code ?? '—'}</td><td>{t.is_default ? <span className="badge badge-success">Default</span> : '—'}</td><td><span className={`badge ${t.is_active ? 'badge-success' : 'badge-warning'}`}>{t.is_active ? 'Active' : 'Inactive'}</span></td></tr>)}
        </tbody>
      </table></div></div>
      {showForm && <Modal title="New Report Template" onClose={() => setShowForm(false)}>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div><label className="label">Template Name *</label><input className="input" required value={form.template_name} onChange={e => setForm(f => ({ ...f, template_name: e.target.value }))} /></div>
          <div><label className="label">Code</label><input className="input" value={form.template_code} onChange={e => setForm(f => ({ ...f, template_code: e.target.value }))} /></div>
          <div><label className="label">Header HTML</label><textarea className="input font-mono text-sm" rows={3} value={form.header_html} onChange={e => setForm(f => ({ ...f, header_html: e.target.value }))} placeholder="<div>Hospital Name</div>" /></div>
          <div><label className="label">Footer HTML</label><textarea className="input font-mono text-sm" rows={2} value={form.footer_html} onChange={e => setForm(f => ({ ...f, footer_html: e.target.value }))} placeholder="<div>Signature</div>" /></div>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.is_default} onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))} className="rounded" /><span className="text-sm">Set as default template</span></label>
          <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button><button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Create'}</button></div>
        </form>
      </Modal>}
    </div>
  );
}

function VendorsTab() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ vendor_name: '', vendor_code: '', contact_person: '', contact_no: '', email: '', address: '' });
  const loadData = useCallback(async () => {
    setLoading(true);
    try { const { data } = await axios.get('/api/lab-settings/vendors', { headers: authHeader() }); setItems(data.data ?? []); }
    catch { setItems([]); } finally { setLoading(false); }
  }, []);
  useEffect(() => { loadData(); }, [loadData]);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try { await axios.post('/api/lab-settings/vendors', form, { headers: authHeader() }); toast.success('Vendor created'); setShowForm(false); loadData(); }
    catch (err) { toast.error(axios.isAxiosError(err) ? err.response?.data?.message ?? 'Failed' : 'Failed'); }
    finally { setSaving(false); }
  };
  const handleDelete = async (id: number) => {
    if (!confirm('Deactivate this vendor?')) return;
    try { await axios.delete(`/api/lab-settings/vendors/${id}`, { headers: authHeader() }); toast.success('Deactivated'); loadData(); }
    catch (err) { toast.error(axios.isAxiosError(err) ? err.response?.data?.message ?? 'Failed' : 'Failed'); }
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><button onClick={() => setShowForm(true)} className="btn-primary"><Plus className="w-4 h-4" />New Vendor</button></div>
      <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="table-base">
        <thead><tr><th>Vendor Name</th><th>Code</th><th>Contact</th><th>Email</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {loading ? <SkeletonRows cols={6} />
            : items.length === 0 ? <tr><td colSpan={6}><EmptyState icon={<Truck className="w-8 h-8 text-[var(--color-text-muted)]" />} title="No vendors" description="Add external lab or reagent vendors." action={<button onClick={() => setShowForm(true)} className="btn-primary mt-2"><Plus className="w-4 h-4" />New Vendor</button>} /></td></tr>
            : items.map(v => <tr key={v.id}><td className="font-medium">{v.vendor_name}</td><td className="font-data text-sm">{v.vendor_code ?? '—'}</td><td>{v.contact_person ? `${v.contact_person}${v.contact_no ? ` — ${v.contact_no}` : ''}` : (v.contact_no ?? '—')}</td><td>{v.email ?? '—'}</td><td><span className={`badge ${v.is_active ? 'badge-success' : 'badge-warning'}`}>{v.is_active ? 'Active' : 'Inactive'}</span></td><td><button onClick={() => handleDelete(v.id)} className="btn-ghost p-1.5 text-red-500"><Trash2 className="w-4 h-4" /></button></td></tr>)}
        </tbody>
      </table></div></div>
      {showForm && <Modal title="New Lab Vendor" onClose={() => setShowForm(false)}>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div><label className="label">Vendor Name *</label><input className="input" required value={form.vendor_name} onChange={e => setForm(f => ({ ...f, vendor_name: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Code</label><input className="input" value={form.vendor_code} onChange={e => setForm(f => ({ ...f, vendor_code: e.target.value }))} /></div>
            <div><label className="label">Contact Person</label><input className="input" value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Phone</label><input className="input" value={form.contact_no} onChange={e => setForm(f => ({ ...f, contact_no: e.target.value }))} /></div>
            <div><label className="label">Email</label><input className="input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
          </div>
          <div><label className="label">Address</label><input className="input" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
          <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button><button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Create'}</button></div>
        </form>
      </Modal>}
    </div>
  );
}

function RunNumberTab() {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ prefix: 'LAB', starting_number: '1', padding_digits: '5', reset_period: 'yearly' });
  const loadData = useCallback(async () => {
    setLoading(true);
    try { const { data } = await axios.get('/api/lab-settings/run-number', { headers: authHeader() }); setConfig(data); if (data) setForm({ prefix: data.prefix ?? 'LAB', starting_number: String(data.starting_number ?? 1), padding_digits: String(data.padding_digits ?? 5), reset_period: data.reset_period ?? 'yearly' }); }
    catch { setConfig(null); } finally { setLoading(false); }
  }, []);
  useEffect(() => { loadData(); }, [loadData]);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try { await axios.put('/api/lab-settings/run-number', { ...form, starting_number: parseInt(form.starting_number), padding_digits: parseInt(form.padding_digits) }, { headers: authHeader() }); toast.success('Run number settings saved'); loadData(); }
    catch (err) { toast.error(axios.isAxiosError(err) ? err.response?.data?.message ?? 'Failed' : 'Failed'); }
    finally { setSaving(false); }
  };
  const preview = `${form.prefix}-${String(form.starting_number || 1).padStart(parseInt(form.padding_digits) || 5, '0')}`;
  return (
    <div className="max-w-lg">
      {loading ? <div className="card p-6"><div className="skeleton h-48 rounded-lg" /></div> : (
        <div className="card p-6 space-y-5">
          <div className="flex items-center gap-2 mb-1"><Hash className="w-5 h-5 text-[var(--color-primary)]" /><h3 className="font-semibold">Lab Run Number Configuration</h3></div>
          <p className="text-sm text-[var(--color-text-secondary)]">Configure how lab report numbers are generated and sequenced.</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><label className="label">Prefix</label><input className="input" value={form.prefix} onChange={e => setForm(f => ({ ...f, prefix: e.target.value }))} placeholder="e.g. LAB" /></div>
              <div><label className="label">Starting Number</label><input className="input" type="number" min="1" value={form.starting_number} onChange={e => setForm(f => ({ ...f, starting_number: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="label">Padding Digits</label><input className="input" type="number" min="1" max="10" value={form.padding_digits} onChange={e => setForm(f => ({ ...f, padding_digits: e.target.value }))} /></div>
              <div><label className="label">Reset Period</label><select className="input" value={form.reset_period} onChange={e => setForm(f => ({ ...f, reset_period: e.target.value }))}><option value="daily">Daily</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="never">Never</option></select></div>
            </div>
            <div className="p-3 rounded-lg bg-[var(--color-border-light)] flex items-center gap-2">
              <span className="text-sm text-[var(--color-text-secondary)]">Preview:</span>
              <span className="font-data font-semibold text-[var(--color-primary)]">{preview}</span>
            </div>
            <div className="flex justify-end"><button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save Settings'}</button></div>
          </form>
        </div>
      )}
    </div>
  );
}

const TAB_MAP: Record<string, React.ComponentType> = {
  categories: CategoriesTab, templates: TemplatesTab, vendors: VendorsTab, runnumber: RunNumberTab,
};

export default function LabSettingsPage({ role = 'hospital_admin' }: { role?: string }) {
  const [activeTab, setActiveTab] = useState('categories');
  const TabComponent = TAB_MAP[activeTab];
  const { t } = useTranslation(['laboratory', 'common']);
  return (
    <DashboardLayout role={role}>
      <div className="space-y-5 max-w-screen-2xl mx-auto">
        <div className="page-header">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <FlaskConical className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="page-title">Lab Settings</h1>
              <p className="section-subtitle">Configure lab categories, report templates, vendors, and run numbers</p>
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
