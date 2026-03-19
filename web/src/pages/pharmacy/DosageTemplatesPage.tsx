import { useState, useEffect, useCallback } from 'react';
import {
  Plus, X, Pencil, Trash2, Loader2, Pill
} from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import DashboardLayout from '../../components/DashboardLayout';

interface DosageTemplate {
  id: number;
  generic_id: number | null;
  generic_name: string | null;
  dosage_label: string;
  frequency: string;
  route: string;
  duration_days: number | null;
  notes: string | null;
  is_active: number;
}

type FormState = {
  generic_id: string; dosage_label: string; frequency: string;
  route: string; duration_days: string; notes: string;
};

const EMPTY: FormState = {
  generic_id: '', dosage_label: '', frequency: '', route: 'Oral', duration_days: '', notes: ''
};

const ROUTES = ['Oral', 'IV', 'IM', 'SC', 'Topical', 'Intranasal', 'Sublingual', 'Rectal', 'Ophthalmic', 'Otic'];
const COMMON_FREQUENCIES = [
  'Once Daily (OD)', 'Twice Daily (BD)', 'Thrice Daily (TDS)', 'Four Times Daily (QDS)',
  'Every 6 Hours (Q6H)', 'Every 8 Hours (Q8H)', 'Every 12 Hours (Q12H)',
  'Once Daily at Night (HS)', 'Once Weekly', 'As Needed (SOS / PRN)',
];
const COMMON_LABELS = [
  '1-0-0', '0-1-0', '0-0-1',
  '1-0-1', '1-1-0', '0-1-1',
  '1-1-1', '½-0-½', '1-1-1-1',
];

export default function DosageTemplatesPage({ role = 'hospital_admin' }: { role?: string }) {
  const [templates, setTemplates] = useState<DosageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const token = () => localStorage.getItem('hms_token');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get('/api/pharmacy/dosage-templates', {
        headers: { Authorization: `Bearer ${token()}` },
      });
      setTemplates(data.data ?? []);
    } catch { toast.error('Failed to load dosage templates'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setForm(EMPTY); setEditId(null); setShowModal(true); };
  const openEdit = (t: DosageTemplate) => {
    setForm({
      generic_id: t.generic_id?.toString() ?? '',
      dosage_label: t.dosage_label,
      frequency: t.frequency,
      route: t.route,
      duration_days: t.duration_days?.toString() ?? '',
      notes: t.notes ?? '',
    });
    setEditId(t.id);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.dosage_label || !form.frequency) {
      toast.error('Dosage label and frequency are required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        dosage_label: form.dosage_label,
        frequency: form.frequency,
        route: form.route,
        generic_id: form.generic_id ? parseInt(form.generic_id) : undefined,
        duration_days: form.duration_days ? parseInt(form.duration_days) : undefined,
        notes: form.notes || undefined,
      };
      if (editId) {
        await axios.put(`/api/pharmacy/dosage-templates/${editId}`, payload, {
          headers: { Authorization: `Bearer ${token()}` },
        });
        toast.success('Template updated');
      } else {
        await axios.post('/api/pharmacy/dosage-templates', payload, {
          headers: { Authorization: `Bearer ${token()}` },
        });
        toast.success('Template created');
      }
      setShowModal(false);
      load();
    } catch { toast.error('Failed to save template'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    try {
      await axios.delete(`/api/pharmacy/dosage-templates/${id}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      toast.success('Template deactivated');
      load();
    } catch { toast.error('Failed to delete template'); }
  };

  // Group by generic
  const grouped = templates.reduce<Record<string, DosageTemplate[]>>((acc, t) => {
    const key = t.generic_name ?? 'General (All Generics)';
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  return (
    <DashboardLayout role={role}>
      <div className="space-y-5 max-w-screen-lg mx-auto">
        <div className="page-header">
          <div>
            <h1 className="page-title">Dosage Templates</h1>
            <p className="page-subtitle">Predefined dosage labels, frequencies, and routes for dispensing</p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> Add Template
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : templates.length === 0 ? (
          <div className="card p-12 text-center text-gray-400">
            <Pill className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No dosage templates yet. Create one to speed up dispensing.</p>
          </div>
        ) : (
          Object.entries(grouped).map(([group, items]) => (
            <div key={group} className="card">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-700">{group}</p>
              </div>
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Dosage Label</th>
                      <th>Frequency</th>
                      <th>Route</th>
                      <th>Duration</th>
                      <th>Notes</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(t => (
                      <tr key={t.id}>
                        <td>
                          <span className="font-mono bg-gray-100 text-gray-800 px-2 py-0.5 rounded text-sm">{t.dosage_label}</span>
                        </td>
                        <td className="text-sm">{t.frequency}</td>
                        <td>
                          <span className="badge badge-secondary text-xs">{t.route}</span>
                        </td>
                        <td className="text-sm text-gray-500">{t.duration_days ? `${t.duration_days} days` : '—'}</td>
                        <td className="text-sm text-gray-500 max-w-xs truncate">{t.notes || '—'}</td>
                        <td>
                          <div className="flex justify-end gap-1">
                            <button className="btn btn-ghost btn-xs" onClick={() => openEdit(t)}>
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button className="btn btn-ghost btn-xs text-red-500" onClick={() => handleDelete(t.id)}>
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}

        {/* Modal */}
        {showModal && (
          <div className="modal-overlay">
            <div className="modal max-w-lg">
              <div className="modal-header">
                <h2 className="modal-title">{editId ? 'Edit Dosage Template' : 'New Dosage Template'}</h2>
                <button className="btn btn-ghost btn-xs" onClick={() => setShowModal(false)}>
                  <X className="h-4 w-4" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="modal-body space-y-4">

                <div>
                  <label className="form-label">Generic ID <span className="text-gray-400 text-xs">(optional — leave blank for all generics)</span></label>
                  <input type="number" className="form-control" placeholder="e.g. 42"
                    value={form.generic_id} onChange={e => setForm(f => ({ ...f, generic_id: e.target.value }))} />
                </div>

                <div>
                  <label className="form-label">Dosage Label <span className="text-red-500">*</span></label>
                  <div className="flex gap-2">
                    <input className="form-control flex-1" placeholder='e.g. 1-0-1 or "After meals"'
                      value={form.dosage_label} onChange={e => setForm(f => ({ ...f, dosage_label: e.target.value }))} />
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {COMMON_LABELS.map(l => (
                      <button key={l} type="button"
                        className="text-xs px-2 py-0.5 rounded bg-gray-100 hover:bg-primary hover:text-white transition-colors"
                        onClick={() => setForm(f => ({ ...f, dosage_label: l }))}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="form-label">Frequency <span className="text-red-500">*</span></label>
                  <input list="freq-suggestions" className="form-control"
                    placeholder="e.g. Twice Daily (BD)" value={form.frequency}
                    onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))} />
                  <datalist id="freq-suggestions">
                    {COMMON_FREQUENCIES.map(f => <option key={f} value={f} />)}
                  </datalist>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">Route</label>
                    <select className="form-control" value={form.route}
                      onChange={e => setForm(f => ({ ...f, route: e.target.value }))}>
                      {ROUTES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Duration (days)</label>
                    <input type="number" min="1" className="form-control"
                      placeholder="Leave blank for open" value={form.duration_days}
                      onChange={e => setForm(f => ({ ...f, duration_days: e.target.value }))} />
                  </div>
                </div>

                <div>
                  <label className="form-label">Notes</label>
                  <textarea className="form-control" rows={2} placeholder="e.g. Take with food"
                    value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                </div>

                <div className="modal-footer">
                  <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                    {editId ? 'Update' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
