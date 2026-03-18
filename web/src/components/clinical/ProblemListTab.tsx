import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Plus, Trash2, CheckCircle, RefreshCw } from 'lucide-react';
import { authHeader } from '../../utils/auth';

interface Problem {
  id: number;
  patient_id: number;
  description: string;
  icd10_code?: string;
  severity?: 'mild' | 'moderate' | 'severe';
  status: 'active' | 'resolved' | 'inactive';
  beg_date?: string;
  end_date?: string;
  comments?: string;
  created_at: string;
}

export default function ProblemListTab({ patientId }: { patientId: number }) {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    description: '',
    icd10_code: '',
    severity: 'moderate',
    status: 'active',
    beg_date: new Date().toISOString().split('T')[0],
    comments: '',
  });

  const fetchProblems = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`/api/clinical/problems?patientId=${patientId}`, { headers: authHeader() });
      setProblems(data.problems || []);
    } catch {
      toast.error('Failed to load problem list');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    if (patientId) fetchProblems();
  }, [fetchProblems, patientId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.post('/api/clinical/problems', {
        patient_id: patientId,
        ...form
      }, { headers: authHeader() });
      toast.success('Problem added');
      setShowAdd(false);
      setForm({
        description: '', icd10_code: '', severity: 'moderate', status: 'active',
        beg_date: new Date().toISOString().split('T')[0], comments: ''
      });
      fetchProblems();
    } catch (err) {
      toast.error('Failed to add problem');
    } finally {
      setSaving(false);
    }
  };

  const handleResolve = async (id: number) => {
    try {
      await axios.put(`/api/clinical/problems/${id}/resolve`, {}, { headers: authHeader() });
      toast.success('Problem marked as resolved');
      fetchProblems();
    } catch {
      toast.error('Failed to resolve problem');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this problem?')) return;
    try {
      await axios.delete(`/api/clinical/problems/${id}`, { headers: authHeader() });
      toast.success('Problem deleted');
      fetchProblems();
    } catch {
      toast.error('Failed to delete problem');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Active Problems</h2>
        <div className="flex gap-2">
          <button onClick={fetchProblems} className="btn-ghost" title="Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setShowAdd(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> Add Problem
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="card p-4 border border-indigo-100 dark:border-indigo-900/30 bg-indigo-50/50 dark:bg-indigo-900/10 mb-4">
          <h3 className="font-medium text-indigo-900 dark:text-indigo-300 mb-3">New Problem</h3>
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Description *</label>
              <input type="text" required value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="input" placeholder="e.g. Essential hypertension" />
            </div>
            <div>
              <label className="label">ICD-10 Code</label>
              <input type="text" value={form.icd10_code} onChange={e => setForm({ ...form, icd10_code: e.target.value })} className="input" placeholder="e.g. I10" />
            </div>
            <div>
              <label className="label">Severity</label>
              <select value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value as any })} className="input">
                <option value="mild">Mild</option>
                <option value="moderate">Moderate</option>
                <option value="severe">Severe</option>
              </select>
            </div>
            <div>
              <label className="label">Onset Date</label>
              <input type="date" value={form.beg_date} onChange={e => setForm({ ...form, beg_date: e.target.value })} className="input" />
            </div>
            <div className="md:col-span-2">
              <label className="label">Comments</label>
              <input type="text" value={form.comments} onChange={e => setForm({ ...form, comments: e.target.value })} className="input" placeholder="Additional notes..." />
            </div>
            <div className="md:col-span-2 flex justify-end gap-2 mt-2">
              <button type="button" onClick={() => setShowAdd(false)} className="btn-ghost">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Save Problem'}</button>
            </div>
          </form>
        </div>
      )}

      <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
        <table className="table-base">
          <thead>
            <tr>
              <th>Description</th>
              <th>ICD-10</th>
              <th>Severity</th>
              <th>Status</th>
              <th>Onset Date</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-4 text-gray-500">Loading...</td></tr>
            ) : problems.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-500">No problems recorded.</td></tr>
            ) : (
              problems.map(p => (
                <tr key={p.id}>
                  <td className="font-medium">{p.description}
                    {p.comments && <div className="text-xs text-gray-500 font-normal mt-0.5">{p.comments}</div>}
                  </td>
                  <td>{p.icd10_code || '-'}</td>
                  <td>
                    <span className={`badge ${
                      p.severity === 'severe' ? 'bg-red-100 text-red-700' :
                      p.severity === 'mild' ? 'bg-green-100 text-green-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {p.severity || 'moderate'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${
                      p.status === 'active' ? 'bg-blue-100 text-blue-700' :
                      p.status === 'resolved' ? 'bg-emerald-100 text-emerald-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {p.status}
                    </span>
                  </td>
                  <td>{p.beg_date ? new Date(p.beg_date).toLocaleDateString() : '-'}</td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {p.status === 'active' && (
                        <button onClick={() => handleResolve(p.id)} className="text-emerald-600 hover:bg-emerald-50 p-1.5 rounded" title="Mark Resolved">
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => handleDelete(p.id)} className="text-red-500 hover:bg-red-50 p-1.5 rounded" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
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
