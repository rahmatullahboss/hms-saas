import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import DashboardLayout from '../../components/DashboardLayout';
import BillingSummaryCard from '../../components/billing/BillingSummaryCard';
import StatusBadge from '../../components/billing/StatusBadge';

const api = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
type Tab = 'create' | 'pending' | 'history';

interface Handover { id: number; handover_by_name: string; handover_to_name: string; handover_type: string; handover_amount: number; due_amount: number; status: string; remarks: string; created_at: string; received_at: string; }
interface Staff { id: number; name: string; }

export default function HandoverPage({ role = 'hospital_admin' }: { role?: string }) {
  const [tab, setTab] = useState<Tab>('create');
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [pending, setPending] = useState<Handover[]>([]);
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [form, setForm] = useState({ handover_to: 0, handover_amount: 0, due_amount: 0, handover_type: 'cashier', remarks: '' });
  const [dailyReport, setDailyReport] = useState<any>(null);
  const [myId, setMyId] = useState<number | null>(null);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    setMyId(user.id);
    fetchStaff();
    if (tab === 'history') fetchHandovers();
    else if (tab === 'pending' && user.id) fetchPending(user.id);
    else fetchDailyReport(user.id);
  }, [tab]);

  const fetchStaff = async () => { try { const { data } = await axios.get('/api/staff', api()); setStaff(data.staff || []); } catch { } };
  const fetchHandovers = async () => { setLoading(true); try { const { data } = await axios.get('/api/billing/handover', api()); setHandovers(data.handovers || []); } catch { toast.error('Failed'); } finally { setLoading(false); } };
  const fetchPending = async (id: number) => { setLoading(true); try { const { data } = await axios.get(`/api/billing/handover/pending/${id}`, api()); setPending(data.pending || []); } catch { toast.error('Failed'); } finally { setLoading(false); } };
  const fetchDailyReport = async (id?: number) => { if (!id) return; try { const { data } = await axios.get(`/api/billing/handover/report/daily?staff_id=${id}`, api()); setDailyReport(data); } catch { } };

  const handleCreate = async () => {
    if (!form.handover_to || !form.handover_amount) { toast.error('Select recipient and amount'); return; }
    try { await axios.post('/api/billing/handover', form, api()); toast.success('Handover created'); setForm({ handover_to: 0, handover_amount: 0, due_amount: 0, handover_type: 'cashier', remarks: '' }); if (myId) fetchDailyReport(myId); } catch { toast.error('Failed'); }
  };

  const handleReceive = async (id: number) => {
    try { await axios.put(`/api/billing/handover/${id}/receive`, {}, api()); toast.success('Handover received'); if (myId) fetchPending(myId); } catch { toast.error('Failed'); }
  };

  const diff = dailyReport ? dailyReport.total_collection - dailyReport.total_handover : 0;

  return (
    <DashboardLayout role={role}>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div><h1 className="text-2xl font-bold">Cash Handover</h1><p className="text-sm text-[var(--color-text-muted)] mt-0.5">Daily shift handover & reconciliation</p></div>
        </div>

        <div className="flex gap-1 border-b border-[var(--color-border)]">
          {(['create', 'pending', 'history'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${tab === t ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}>
              {t === 'pending' && pending.length > 0 ? <>{t} <span className="ml-1 bg-red-500 text-white text-xs rounded-full px-1.5">{pending.length}</span></> : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {tab === 'create' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Daily summary */}
            {dailyReport && (
              <div className="space-y-3">
                <h3 className="font-semibold text-sm">Today's Summary</h3>
                <div className="grid grid-cols-2 gap-3">
                  <BillingSummaryCard label="Collected" value={dailyReport.total_collection} color="teal" icon="💰" />
                  <BillingSummaryCard label="Handed Over" value={dailyReport.total_handover} color="blue" icon="🔄" />
                  <div className={`card p-4 col-span-2 ${diff > 0 ? 'border-yellow-300' : ''}`}>
                    <div className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Balance in Hand</div>
                    <div className={`text-2xl font-bold mt-1 ${diff > 0 ? 'text-yellow-600' : 'text-green-600'}`}>৳{Math.abs(diff).toLocaleString()}</div>
                    {diff > 0 && <p className="text-xs text-yellow-600 mt-1">⚠ ৳{diff.toLocaleString()} still not handed over</p>}
                  </div>
                </div>
              </div>
            )}

            {/* Create form */}
            <div className="card p-5">
              <h3 className="font-semibold text-sm mb-4">Create Handover</h3>
              <div className="space-y-3">
                <div><label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Type</label>
                  <select className="input" value={form.handover_type} onChange={e => setForm({ ...form, handover_type: e.target.value })}>
                    {['cashier', 'counter', 'department'].map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
                  </select>
                </div>
                <div><label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Hand Over To *</label>
                  <select className="input" value={form.handover_to} onChange={e => setForm({ ...form, handover_to: Number(e.target.value) })}>
                    <option value={0}>Select staff…</option>
                    {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Amount ৳ *</label><input type="number" min={0} className="input" value={form.handover_amount} onChange={e => setForm({ ...form, handover_amount: Number(e.target.value) })} /></div>
                  <div><label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Due Amount ৳</label><input type="number" min={0} className="input" value={form.due_amount} onChange={e => setForm({ ...form, due_amount: Number(e.target.value) })} /></div>
                </div>
                <div><label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Remarks</label><input className="input" value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} /></div>
                <button onClick={handleCreate} className="btn-primary w-full">Create Handover</button>
              </div>
            </div>
          </div>
        )}

        {tab === 'pending' && (
          <div className="space-y-3">
            {loading ? <div className="text-center py-8 text-[var(--color-text-muted)]">Loading…</div>
              : pending.length === 0 ? <div className="card p-8 text-center text-[var(--color-text-muted)]"><div className="text-3xl mb-2">✅</div><p>No pending handovers</p></div>
              : pending.map(h => (
                <div key={h.id} className="card p-4 flex items-center gap-4">
                  <div className="flex-1">
                    <div className="font-semibold">From: {h.handover_by_name}</div>
                    <div className="text-sm text-[var(--color-text-muted)]">{h.handover_type} • {new Date(h.created_at).toLocaleString()}</div>
                    {h.remarks && <div className="text-sm mt-1 text-[var(--color-text-secondary)]">{h.remarks}</div>}
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-[var(--color-primary)]">৳{h.handover_amount.toLocaleString()}</div>
                    <StatusBadge status={h.status} className="mt-1" />
                  </div>
                  <button onClick={() => handleReceive(h.id)} className="btn-primary px-4">✓ Receive</button>
                </div>
              ))}
          </div>
        )}

        {tab === 'history' && (
          <div className="card overflow-hidden">
            <table className="table">
              <thead><tr><th>From</th><th>To</th><th>Type</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={6} className="py-8 text-center text-[var(--color-text-muted)]">Loading…</td></tr>
                  : handovers.map(h => (
                    <tr key={h.id}>
                      <td className="font-medium text-sm">{h.handover_by_name}</td>
                      <td className="text-sm">{h.handover_to_name || '—'}</td>
                      <td className="capitalize text-xs">{h.handover_type}</td>
                      <td className="font-semibold">৳{h.handover_amount.toLocaleString()}</td>
                      <td><StatusBadge status={h.status} /></td>
                      <td className="text-xs text-[var(--color-text-muted)]">{new Date(h.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
