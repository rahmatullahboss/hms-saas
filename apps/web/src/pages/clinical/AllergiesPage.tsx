import { useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import DashboardLayout from '../../components/DashboardLayout';
import StatusBadge from '../../components/billing/StatusBadge';

const api = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

interface Allergy { id: number; allergy_name: string; allergy_type: string; reaction: string; severity: string; verification_status: string; notes: string; }

const SEVERITY_COLORS: Record<string, string> = {
  mild: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  moderate: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  severe: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  'life-threatening': 'bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-200',
};

export default function AllergiesPage({ role = 'hospital_admin' }: { role?: string }) {
  const [patientSearch, setPatientSearch] = useState('');
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [allergies, setAllergies] = useState<Allergy[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ allergy_name: '', allergy_type: 'drug', reaction: '', severity: 'mild', notes: '' });

  const searchPatients = async (q: string) => { setPatientSearch(q); if (q.length < 2) { setPatients([]); return; } try { const { data } = await axios.get(`/api/patients?search=${q}`, api()); setPatients(data.patients?.slice(0, 6) || []); } catch { } };

  const selectPatient = async (p: any) => {
    setPatients([]); setPatientSearch(p.name); setSelectedPatient(p); setLoading(true);
    try { const { data } = await axios.get(`/api/allergies/patient/${p.id}`, api()); setAllergies(data.allergies || []); }
    catch { toast.error('Failed to load allergies'); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    if (!selectedPatient || !form.allergy_name) { toast.error('Patient and allergy name required'); return; }
    try {
      await axios.post('/api/allergies', { patient_id: selectedPatient.id, ...form }, api());
      toast.success('Allergy added');
      setShowForm(false);
      setForm({ allergy_name: '', allergy_type: 'drug', reaction: '', severity: 'mild', notes: '' });
      selectPatient(selectedPatient);
    } catch { toast.error('Failed to save'); }
  };

  const hasLifeThreatening = allergies.some(a => a.severity === 'life-threatening');

  return (
    <DashboardLayout role={role}>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div><h1 className="text-2xl font-bold">Allergies</h1><p className="text-sm text-[var(--color-text-muted)] mt-0.5">Patient allergy records & safety checks</p></div>
        </div>

        <div className="relative max-w-lg">
          <input className="input" placeholder="Search patient…" value={patientSearch} onChange={e => searchPatients(e.target.value)} />
          {patients.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-10 card shadow-lg mt-1 overflow-hidden">
              {patients.map(p => <button key={p.id} onClick={() => selectPatient(p)} className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--color-bg-secondary)] border-b border-[var(--color-border-light)]">{p.name} <span className="text-xs text-[var(--color-text-muted)]">{p.patient_code}</span></button>)}
            </div>
          )}
        </div>

        {selectedPatient && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Allergies — <span className="text-[var(--color-primary)]">{selectedPatient.name}</span></h2>
              <button onClick={() => setShowForm(true)} className="btn-primary text-sm px-4">+ Add Allergy</button>
            </div>

            {/* Safety alert */}
            {hasLifeThreatening && (
              <div className="bg-red-100 dark:bg-red-900/30 border-2 border-red-400 rounded-lg p-4 flex gap-3 animate-pulse">
                <span className="text-2xl">☠️</span>
                <div>
                  <div className="font-bold text-red-800 dark:text-red-300">LIFE-THREATENING ALLERGY ALERT</div>
                  <div className="text-sm text-red-700 dark:text-red-400 mt-0.5">This patient has one or more life-threatening allergies. Verify before prescribing.</div>
                </div>
              </div>
            )}

            {/* Allergy cards */}
            {loading ? <div className="text-center py-8 text-[var(--color-text-muted)]">Loading…</div>
              : allergies.length === 0 ? (
                <div className="card p-8 text-center text-[var(--color-text-muted)]">
                  <div className="text-3xl mb-2">✅</div>
                  <p>No allergies recorded</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {allergies.map(a => (
                    <div key={a.id} className={`card p-4 border-l-4 ${a.severity === 'life-threatening' ? 'border-l-red-600' : a.severity === 'severe' ? 'border-l-red-400' : a.severity === 'moderate' ? 'border-l-orange-400' : 'border-l-yellow-400'}`}>
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-semibold">{a.allergy_name}</div>
                          <div className="text-xs text-[var(--color-text-muted)] capitalize mt-0.5">{a.allergy_type} allergy</div>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${SEVERITY_COLORS[a.severity] || ''}`}>{a.severity}</span>
                      </div>
                      {a.reaction && <div className="text-sm mt-2 text-[var(--color-text-secondary)]">Reaction: {a.reaction}</div>}
                      {a.notes && <div className="text-xs text-[var(--color-text-muted)] mt-1">{a.notes}</div>}
                      <div className="mt-2 flex items-center gap-2">
                        <StatusBadge status={a.verification_status || 'unverified'} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-md">
            <h3 className="font-bold text-lg mb-4">Add Allergy — {selectedPatient?.name}</h3>
            <div className="space-y-3">
              <div><label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Allergy Name *</label><input className="input" placeholder="e.g. Penicillin, Peanuts…" value={form.allergy_name} onChange={e => setForm({ ...form, allergy_name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Type</label>
                  <select className="input" value={form.allergy_type} onChange={e => setForm({ ...form, allergy_type: e.target.value })}>
                    {['drug', 'food', 'environmental', 'contact', 'other'].map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
                  </select>
                </div>
                <div><label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Severity *</label>
                  <select className="input" value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })}>
                    {['mild', 'moderate', 'severe', 'life-threatening'].map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
                  </select>
                </div>
              </div>
              {form.severity === 'life-threatening' && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-300 rounded p-2 text-xs text-red-600 font-medium">⚠️ Life-threatening allergy will be prominently flagged on all patient views.</div>
              )}
              <div><label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Reaction Symptoms</label><input className="input" placeholder="e.g. Anaphylaxis, Rash, Swelling…" value={form.reaction} onChange={e => setForm({ ...form, reaction: e.target.value })} /></div>
              <div><label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Notes</label><input className="input" placeholder="Optional additional context" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <div className="flex gap-3 mt-5"><button onClick={handleSave} className="btn-primary flex-1">Save Allergy</button><button onClick={() => setShowForm(false)} className="btn-secondary px-5">Cancel</button></div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
