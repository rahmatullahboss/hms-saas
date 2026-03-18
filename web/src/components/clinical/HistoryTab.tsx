import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Plus, Trash2, RefreshCw } from 'lucide-react';
import { authHeader } from '../../utils/auth';

type HistoryType = 'family' | 'social' | 'surgical';

export default function HistoryTab({ patientId }: { patientId: number }) {
  const [activeSubTab, setActiveSubTab] = useState<HistoryType>('family');
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form states based on sub-tab
  const [familyForm, setFamilyForm] = useState({ icd10_code: '', relationship: '', note: '' });
  const [socialForm, setSocialForm] = useState({ smoking_history: '', alcohol_history: '', drug_history: '', occupation: '', note: '' });
  const [surgicalForm, setSurgicalForm] = useState({ surgery_type: '', surgery_date: '', icd10_code: '', note: '' });

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`/api/clinical/history/${activeSubTab}?patientId=${patientId}`, { headers: authHeader() });
      setRecords(data.history || []);
    } catch {
      toast.error(`Failed to load ${activeSubTab} history`);
    } finally {
      setLoading(false);
    }
  }, [patientId, activeSubTab]);

  useEffect(() => {
    if (patientId) fetchHistory();
  }, [fetchHistory, patientId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    let payload = {};
    if (activeSubTab === 'family') payload = familyForm;
    else if (activeSubTab === 'social') payload = socialForm;
    else if (activeSubTab === 'surgical') payload = surgicalForm;

    try {
      await axios.post(`/api/clinical/history/${activeSubTab}`, {
        patient_id: patientId,
        ...payload
      }, { headers: authHeader() });
      toast.success('History record added');
      setShowAdd(false);
      // Reset forms
      setFamilyForm({ icd10_code: '', relationship: '', note: '' });
      setSocialForm({ smoking_history: '', alcohol_history: '', drug_history: '', occupation: '', note: '' });
      setSurgicalForm({ surgery_type: '', surgery_date: '', icd10_code: '', note: '' });
      fetchHistory();
    } catch (err) {
      toast.error('Failed to add record');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this record?')) return;
    try {
      await axios.delete(`/api/clinical/history/${activeSubTab}/${id}`, { headers: authHeader() });
      toast.success('Record deleted');
      fetchHistory();
    } catch {
      toast.error('Failed to delete record');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
          {['family', 'social', 'surgical'].map((tab) => (
            <button
              key={tab}
              onClick={() => { setActiveSubTab(tab as HistoryType); setShowAdd(false); }}
              className={`px-4 py-1.5 text-sm font-medium rounded-md capitalize ${
                activeSubTab === tab ? 'bg-white dark:bg-gray-700 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-gray-600 dark:text-gray-400'
              }`}
            >
              {tab} History
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={fetchHistory} className="btn-ghost" title="Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setShowAdd(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> Add Record
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="card p-4 border border-indigo-100 dark:border-indigo-900/30 bg-indigo-50/50 dark:bg-indigo-900/10 mb-4">
          <h3 className="font-medium text-indigo-900 dark:text-indigo-300 mb-3 capitalize">Add {activeSubTab} History</h3>
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {activeSubTab === 'family' && (
              <>
                <div><label className="label">Relationship *</label><input type="text" required value={familyForm.relationship} onChange={e => setFamilyForm({...familyForm, relationship: e.target.value})} className="input" placeholder="e.g. Father, Mother" /></div>
                <div><label className="label">ICD-10 Code</label><input type="text" value={familyForm.icd10_code} onChange={e => setFamilyForm({...familyForm, icd10_code: e.target.value})} className="input" /></div>
                <div className="md:col-span-2"><label className="label">Notes</label><textarea value={familyForm.note} onChange={e => setFamilyForm({...familyForm, note: e.target.value})} className="input min-h-[80px]" /></div>
              </>
            )}

            {activeSubTab === 'social' && (
              <>
                <div><label className="label">Smoking History</label><input type="text" value={socialForm.smoking_history} onChange={e => setSocialForm({...socialForm, smoking_history: e.target.value})} className="input" placeholder="e.g. 1 pack/day" /></div>
                <div><label className="label">Alcohol History</label><input type="text" value={socialForm.alcohol_history} onChange={e => setSocialForm({...socialForm, alcohol_history: e.target.value})} className="input" placeholder="e.g. Occasional" /></div>
                <div><label className="label">Drug History</label><input type="text" value={socialForm.drug_history} onChange={e => setSocialForm({...socialForm, drug_history: e.target.value})} className="input" /></div>
                <div><label className="label">Occupation</label><input type="text" value={socialForm.occupation} onChange={e => setSocialForm({...socialForm, occupation: e.target.value})} className="input" /></div>
                <div className="md:col-span-2"><label className="label">Notes</label><textarea value={socialForm.note} onChange={e => setSocialForm({...socialForm, note: e.target.value})} className="input min-h-[80px]" /></div>
              </>
            )}

            {activeSubTab === 'surgical' && (
              <>
                <div><label className="label">Surgery Type *</label><input type="text" required value={surgicalForm.surgery_type} onChange={e => setSurgicalForm({...surgicalForm, surgery_type: e.target.value})} className="input" placeholder="e.g. Appendectomy" /></div>
                <div><label className="label">Surgery Date</label><input type="date" value={surgicalForm.surgery_date} onChange={e => setSurgicalForm({...surgicalForm, surgery_date: e.target.value})} className="input" /></div>
                <div><label className="label">ICD-10 Code</label><input type="text" value={surgicalForm.icd10_code} onChange={e => setSurgicalForm({...surgicalForm, icd10_code: e.target.value})} className="input" /></div>
                <div className="md:col-span-2"><label className="label">Notes</label><textarea value={surgicalForm.note} onChange={e => setSurgicalForm({...surgicalForm, note: e.target.value})} className="input min-h-[80px]" /></div>
              </>
            )}

            <div className="md:col-span-2 flex justify-end gap-2 mt-2">
              <button type="button" onClick={() => setShowAdd(false)} className="btn-ghost">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </form>
        </div>
      )}

      <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
        <table className="table-base">
          <thead>
            {activeSubTab === 'family' && <tr><th>Relationship</th><th>ICD-10</th><th>Notes</th><th className="text-right">Actions</th></tr>}
            {activeSubTab === 'social' && <tr><th>Smoking</th><th>Alcohol</th><th>Drugs</th><th>Occupation</th><th>Notes</th><th className="text-right">Actions</th></tr>}
            {activeSubTab === 'surgical' && <tr><th>Surgery Type</th><th>Date</th><th>ICD-10</th><th>Notes</th><th className="text-right">Actions</th></tr>}
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-4 text-gray-500">Loading...</td></tr>
            ) : records.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-500">No records found.</td></tr>
            ) : (
              records.map(r => (
                <tr key={r.id}>
                  {activeSubTab === 'family' && <>
                    <td className="font-medium">{r.relationship}</td><td>{r.icd10_code || '-'}</td><td>{r.note || '-'}</td>
                  </>}
                  {activeSubTab === 'social' && <>
                    <td>{r.smoking_history || '-'}</td><td>{r.alcohol_history || '-'}</td><td>{r.drug_history || '-'}</td><td>{r.occupation || '-'}</td><td>{r.note || '-'}</td>
                  </>}
                  {activeSubTab === 'surgical' && <>
                    <td className="font-medium">{r.surgery_type}</td><td>{r.surgery_date ? new Date(r.surgery_date).toLocaleDateString() : '-'}</td><td>{r.icd10_code || '-'}</td><td>{r.note || '-'}</td>
                  </>}
                  <td className="text-right">
                    <button onClick={() => handleDelete(r.id)} className="text-red-500 hover:bg-red-50 p-1.5 rounded" title="Delete">
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
