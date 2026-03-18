import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Plus, Trash2, RefreshCw } from 'lucide-react';
import { authHeader } from '../../utils/auth';

interface Diet {
  id: number;
  patient_id: number;
  diet_name: string;
  quantity: string;
  unit: string;
  feeding_time: string;
  remarks?: string;
  created_at: string;
}

export default function DietTab({ patientId }: { patientId: number }) {
  const [diets, setDiets] = useState<Diet[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    diet_name: '',
    quantity: '',
    unit: '',
    feeding_time: '',
    remarks: '',
  });

  const fetchDiets = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`/api/clinical/diet?patientId=${patientId}`, { headers: authHeader() });
      setDiets(data.diets || []);
    } catch {
      toast.error('Failed to load diet records');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    if (patientId) fetchDiets();
  }, [fetchDiets, patientId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.post('/api/clinical/diet', {
        patient_id: patientId,
        ...form
      }, { headers: authHeader() });
      toast.success('Diet record added');
      setShowAdd(false);
      setForm({ diet_name: '', quantity: '', unit: '', feeding_time: '', remarks: '' });
      fetchDiets();
    } catch (err) {
      toast.error('Failed to add diet record');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this diet record?')) return;
    try {
      await axios.delete(`/api/clinical/diet/${id}`, { headers: authHeader() });
      toast.success('Diet record deleted');
      fetchDiets();
    } catch {
      toast.error('Failed to delete diet record');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Diet Plan</h2>
        <div className="flex gap-2">
          <button onClick={fetchDiets} className="btn-ghost" title="Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setShowAdd(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> Add Diet
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="card p-4 border border-indigo-100 dark:border-indigo-900/30 bg-indigo-50/50 dark:bg-indigo-900/10 mb-4">
          <h3 className="font-medium text-indigo-900 dark:text-indigo-300 mb-3">Add Diet Entry</h3>
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <label className="label">Diet Name *</label>
              <input type="text" required value={form.diet_name} onChange={e => setForm({ ...form, diet_name: e.target.value })} className="input" placeholder="e.g. Diabetic Diet" />
            </div>
            <div>
              <label className="label">Quantity</label>
              <input type="text" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} className="input" placeholder="e.g. 1" />
            </div>
            <div>
              <label className="label">Unit</label>
              <input type="text" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} className="input" placeholder="e.g. Bowl, Cup" />
            </div>
            <div className="md:col-span-2">
              <label className="label">Feeding Time</label>
              <input type="text" value={form.feeding_time} onChange={e => setForm({ ...form, feeding_time: e.target.value })} className="input" placeholder="e.g. Breakfast, 8:00 AM" />
            </div>
            <div className="md:col-span-2">
              <label className="label">Remarks</label>
              <input type="text" value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} className="input" placeholder="Any notes..." />
            </div>
            <div className="md:col-span-4 flex justify-end gap-2 mt-2">
              <button type="button" onClick={() => setShowAdd(false)} className="btn-ghost">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Save Diet'}</button>
            </div>
          </form>
        </div>
      )}

      <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
        <table className="table-base">
          <thead>
            <tr>
              <th>Diet Name</th>
              <th>Quantity</th>
              <th>Unit</th>
              <th>Feeding Time</th>
              <th>Remarks</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-4 text-gray-500">Loading...</td></tr>
            ) : diets.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-500">No diet records.</td></tr>
            ) : (
              diets.map(d => (
                <tr key={d.id}>
                  <td className="font-medium text-gray-900 dark:text-white">{d.diet_name}</td>
                  <td>{d.quantity || '-'}</td>
                  <td>{d.unit || '-'}</td>
                  <td>{d.feeding_time || '-'}</td>
                  <td>{d.remarks || '-'}</td>
                  <td className="text-right">
                    <button onClick={() => handleDelete(d.id)} className="text-red-500 hover:bg-red-50 p-1.5 rounded" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
