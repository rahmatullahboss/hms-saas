import { useState, useEffect, useCallback } from 'react';
import {
  Scan, FileText, Search, Plus, X, Activity, RefreshCw,
  ClipboardList, ImageIcon, Filter, AlertTriangle, CheckCircle2,
  Clock, ChevronRight, Upload, FlaskConical, Zap,
} from 'lucide-react';
import axios, { AxiosError } from 'axios';
import toast from 'react-hot-toast';
import DashboardLayout from '../components/DashboardLayout';
import KPICard from '../components/dashboard/KPICard';
import { authHeader } from '../utils/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Stats {
  pending: number;
  scanned: number;
  reported: number;
  cancelled: number;
  stat_pending: number;
}

interface ImagingType {
  id: number;
  name: string;
  code?: string;
}

interface ImagingItem {
  id: number;
  imaging_type_id: number;
  name: string;
  procedure_code?: string;
  price_paisa: number;
}

interface Requisition {
  id: number;
  patient_id: number;
  patient_name?: string;
  imaging_type_name?: string;
  imaging_item_name?: string;
  urgency: 'normal' | 'urgent' | 'stat';
  order_status: 'pending' | 'scanned' | 'reported' | 'cancelled';
  imaging_date: string;
  is_scanned: number;
  is_report_saved: number;
  prescriber_name?: string;
  created_at: string;
}

interface Report {
  id: number;
  requisition_id: number;
  patient_id: number;
  patient_name?: string;
  imaging_type_name?: string;
  imaging_item_name?: string;
  radiology_number?: string;
  order_status: 'pending' | 'final';
  performer_name?: string;
  created_at: string;
}

interface Patient { id: number; name: string; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Badge({ text, variant }: { text: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'muted' | 'stat' }) {
  const map = {
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    danger:  'bg-red-50 text-red-700 border-red-200',
    info:    'bg-blue-50 text-blue-700 border-blue-200',
    muted:   'bg-zinc-50 text-zinc-500 border-zinc-200',
    stat:    'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${map[variant]}`}>
      {text}
    </span>
  );
}

function urgencyVariant(u: string): 'success' | 'warning' | 'stat' {
  if (u === 'stat')   return 'stat';
  if (u === 'urgent') return 'warning';
  return 'success';
}

function statusVariant(s: string): 'info' | 'warning' | 'success' | 'muted' {
  if (s === 'reported') return 'success';
  if (s === 'scanned')  return 'info';
  if (s === 'pending')  return 'warning';
  return 'muted';
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function RadiologyDashboard() {
  const [tab, setTab] = useState<'orders' | 'reports' | 'catalog' | 'pacs'>('orders');
  const [stats, setStats] = useState<Stats | null>(null);
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [imagingTypes, setImagingTypes] = useState<ImagingType[]>([]);
  const [imagingItems, setImagingItems] = useState<ImagingItem[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [showNewReport, setShowNewReport] = useState<number | null>(null);
  const [reqTotal, setReqTotal] = useState(0);
  const [reqPage, setReqPage] = useState(1);

  // New order form
  const [newOrder, setNewOrder] = useState({
    patient_id: '', imaging_type_id: '', imaging_item_id: '',
    urgency: 'normal', imaging_date: new Date().toISOString().split('T')[0],
    prescriber_name: '', requisition_remarks: '',
  });
  const [filteredItems, setFilteredItems] = useState<ImagingItem[]>([]);

  // New report form
  const [newReport, setNewReport] = useState({
    report_text: '', indication: '', performer_name: '', order_status: 'final',
  });

  const loadStats = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/radiology/stats', { headers: authHeader() });
      setStats(data);
    } catch { /* silent */ }
  }, []);

  const loadRequisitions = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(reqPage), limit: '20' };
      if (statusFilter) params.status = statusFilter;
      const { data } = await axios.get('/api/radiology/requisitions', { headers: authHeader(), params });
      setRequisitions(data.requisitions ?? []);
      setReqTotal(data.meta?.total ?? 0);
    } catch { toast.error('Failed to load orders'); }
    setLoading(false);
  }, [statusFilter, reqPage]);

  const loadReports = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/radiology/reports', { headers: authHeader(), params: { limit: '20' } });
      setReports(data.reports ?? []);
    } catch { /* silent */ }
  }, []);

  const loadCatalog = useCallback(async () => {
    try {
      const [tRes, iRes] = await Promise.all([
        axios.get('/api/radiology/imaging-types', { headers: authHeader() }),
        axios.get('/api/radiology/imaging-items', { headers: authHeader() }),
      ]);
      setImagingTypes(tRes.data.imaging_types ?? []);
      setImagingItems(iRes.data.imaging_items ?? []);
    } catch { /* silent */ }
  }, []);

  const loadPatients = useCallback(async (q: string) => {
    if (q.length < 2) return;
    try {
      const { data } = await axios.get('/api/patients', { headers: authHeader(), params: { search: q, limit: 10 } });
      setPatients(data.patients ?? data.data ?? []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadStats(); loadCatalog(); }, []);
  useEffect(() => { if (tab === 'orders')  loadRequisitions(); }, [tab, loadRequisitions]);
  useEffect(() => { if (tab === 'reports') loadReports(); }, [tab, loadReports]);

  // Filter items by selected type
  useEffect(() => {
    if (newOrder.imaging_type_id) {
      setFilteredItems(imagingItems.filter(i => String(i.imaging_type_id) === newOrder.imaging_type_id));
    } else {
      setFilteredItems(imagingItems);
    }
  }, [newOrder.imaging_type_id, imagingItems]);

  // ── Create Requisition ──
  const handleCreateOrder = async () => {
    if (!newOrder.patient_id || !newOrder.imaging_type_id || !newOrder.imaging_item_id) {
      toast.error('Patient, imaging type, and item are required'); return;
    }
    try {
      await axios.post('/api/radiology/requisitions', {
        patient_id: Number(newOrder.patient_id),
        imaging_type_id: Number(newOrder.imaging_type_id),
        imaging_item_id: Number(newOrder.imaging_item_id),
        urgency: newOrder.urgency,
        imaging_date: newOrder.imaging_date,
        prescriber_name: newOrder.prescriber_name || undefined,
        requisition_remarks: newOrder.requisition_remarks || undefined,
      }, { headers: authHeader() });
      toast.success('Radiology order created ✓');
      setShowNewOrder(false);
      setNewOrder({ patient_id: '', imaging_type_id: '', imaging_item_id: '', urgency: 'normal', imaging_date: new Date().toISOString().split('T')[0], prescriber_name: '', requisition_remarks: '' });
      loadRequisitions();
      loadStats();
    } catch (err) {
      const msg = (err as AxiosError<{ message?: string }>).response?.data?.message;
      toast.error(msg ?? 'Failed to create order');
    }
  };

  // ── Mark as Scanned ──
  const handleScan = async (id: number) => {
    try {
      await axios.patch(`/api/radiology/requisitions/${id}/scan`, {}, { headers: authHeader() });
      toast.success('Marked as scanned ✓');
      loadRequisitions(); loadStats();
    } catch { toast.error('Failed to mark as scanned'); }
  };

  // ── Create Report ──
  const handleCreateReport = async (requisitionId: number, patientId: number) => {
    if (!newReport.report_text) { toast.error('Report text is required'); return; }
    try {
      const req = requisitions.find(r => r.id === requisitionId);
      await axios.post('/api/radiology/reports', {
        requisition_id: requisitionId,
        patient_id: patientId,
        imaging_type_name: req?.imaging_type_name,
        imaging_item_name: req?.imaging_item_name,
        report_text: newReport.report_text,
        indication: newReport.indication || undefined,
        performer_name: newReport.performer_name || undefined,
        order_status: newReport.order_status,
      }, { headers: authHeader() });
      toast.success('Report created ✓');
      setShowNewReport(null);
      setNewReport({ report_text: '', indication: '', performer_name: '', order_status: 'final' });
      loadRequisitions(); loadStats();
    } catch (err) {
      const msg = (err as AxiosError<{ message?: string }>).response?.data?.message;
      toast.error(msg ?? 'Failed to create report');
    }
  };

  // ── Finalize Report ──
  const handleFinalizeReport = async (id: number) => {
    try {
      await axios.patch(`/api/radiology/reports/${id}/finalize`, {}, { headers: authHeader() });
      toast.success('Report finalized ✓');
      loadReports();
    } catch { toast.error('Failed to finalize report'); }
  };

  const filteredReqs = requisitions.filter(r =>
    !searchQuery || r.patient_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.imaging_item_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const tabs = [
    { id: 'orders',  label: 'Orders',     icon: ClipboardList },
    { id: 'reports', label: 'Reports',    icon: FileText },
    { id: 'catalog', label: 'Test Catalog', icon: FlaskConical },
    { id: 'pacs',    label: 'PACS Studies', icon: ImageIcon },
  ] as const;

  return (
    <DashboardLayout role="hospital_admin">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-sky-100">
              <Scan className="w-6 h-6 text-sky-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[var(--color-text)]">Radiology</h1>
              <p className="text-sm text-[var(--color-text-muted)]">Imaging orders, reports & PACS studies</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { loadStats(); loadRequisitions(); loadReports(); }}
              className="p-2 rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-secondary)] transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            {tab === 'orders' && (
              <button
                onClick={() => setShowNewOrder(true)}
                id="btn-new-radiology-order"
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Order
              </button>
            )}
          </div>
        </div>

        {/* KPI Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <KPICard title="Pending" value={stats.pending} icon={<Clock className="w-5 h-5 text-amber-500" />} />
            <KPICard title="Scanned" value={stats.scanned} icon={<Scan className="w-5 h-5 text-blue-500" />} />
            <KPICard title="Reported" value={stats.reported} icon={<CheckCircle2 className="w-5 h-5 text-emerald-500" />} />
            <KPICard title="STAT Orders" value={stats.stat_pending} icon={<Zap className="w-5 h-5 text-fuchsia-500" />} />
            <KPICard title="Cancelled" value={stats.cancelled} icon={<X className="w-5 h-5 text-red-500" />} />
          </div>
        )}

        {/* Alert for STAT orders */}
        {stats && stats.stat_pending > 0 && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-fuchsia-50 border border-fuchsia-200 text-fuchsia-800 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span><strong>{stats.stat_pending} STAT order{stats.stat_pending > 1 ? 's' : ''}</strong> require immediate attention</span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-[var(--color-border)]">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === id
                  ? 'border-sky-600 text-sky-600'
                  : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* ── ORDERS TAB ── */}
        {tab === 'orders' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
                <input
                  type="text" placeholder="Search patient or imaging item…"
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <select
                value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setReqPage(1); }}
                className="px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="scanned">Scanned</option>
                <option value="reported">Reported</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)]">
                  <tr>
                    {['#', 'Patient', 'Imaging Test', 'Date', 'Urgency', 'Status', 'Actions'].map(h => (
                      <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {loading ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-[var(--color-text-muted)]">Loading…</td></tr>
                  ) : filteredReqs.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-[var(--color-text-muted)]">No orders found</td></tr>
                  ) : filteredReqs.map(req => (
                    <tr key={req.id} className="hover:bg-[var(--color-bg-secondary)] transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-[var(--color-text-muted)]">#{req.id}</td>
                      <td className="px-4 py-3 font-medium text-[var(--color-text)]">{req.patient_name ?? `Patient #${req.patient_id}`}</td>
                      <td className="px-4 py-3 text-[var(--color-text)]">
                        <div>{req.imaging_item_name ?? '—'}</div>
                        {req.imaging_type_name && <div className="text-xs text-[var(--color-text-muted)]">{req.imaging_type_name}</div>}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text-muted)]">{req.imaging_date}</td>
                      <td className="px-4 py-3"><Badge text={req.urgency.toUpperCase()} variant={urgencyVariant(req.urgency)} /></td>
                      <td className="px-4 py-3"><Badge text={req.order_status} variant={statusVariant(req.order_status)} /></td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          {req.order_status === 'pending' && !req.is_scanned && (
                            <button
                              onClick={() => handleScan(req.id)}
                              className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                            >
                              <Scan className="w-3 h-3" />Scan
                            </button>
                          )}
                          {(req.order_status === 'scanned' || req.order_status === 'pending') && !req.is_report_saved && (
                            <button
                              onClick={() => setShowNewReport(req.id)}
                              className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                            >
                              <FileText className="w-3 h-3" />Report
                            </button>
                          )}
                          {req.is_report_saved === 1 && (
                            <span className="flex items-center gap-1 text-xs text-emerald-600">
                              <CheckCircle2 className="w-3 h-3" />Reported
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {reqTotal > 20 && (
                <div className="px-4 py-3 border-t border-[var(--color-border)] flex items-center justify-between text-sm text-[var(--color-text-muted)]">
                  <span>Showing page {reqPage} — {reqTotal} total</span>
                  <div className="flex gap-2">
                    <button disabled={reqPage === 1} onClick={() => setReqPage(p => p - 1)} className="px-3 py-1 rounded border border-[var(--color-border)] disabled:opacity-40">Prev</button>
                    <button disabled={reqPage * 20 >= reqTotal} onClick={() => setReqPage(p => p + 1)} className="px-3 py-1 rounded border border-[var(--color-border)] disabled:opacity-40">Next</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── REPORTS TAB ── */}
        {tab === 'reports' && (
          <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)]">
                <tr>
                  {['Rad #', 'Patient', 'Test', 'Radiologist', 'Status', 'Date', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {reports.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-[var(--color-text-muted)]">No reports yet</td></tr>
                ) : reports.map(r => (
                  <tr key={r.id} className="hover:bg-[var(--color-bg-secondary)] transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-medium text-sky-600">{r.radiology_number ?? `#${r.id}`}</td>
                    <td className="px-4 py-3 font-medium">{r.patient_name ?? `Patient #${r.patient_id}`}</td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)]">{r.imaging_item_name ?? r.imaging_type_name ?? '—'}</td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)]">{r.performer_name ?? '—'}</td>
                    <td className="px-4 py-3"><Badge text={r.order_status} variant={r.order_status === 'final' ? 'success' : 'warning'} /></td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)]">{r.created_at?.split('T')[0]}</td>
                    <td className="px-4 py-3">
                      {r.order_status === 'pending' && (
                        <button
                          onClick={() => handleFinalizeReport(r.id)}
                          className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                        >
                          <CheckCircle2 className="w-3 h-3" />Finalize
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── CATALOG TAB ── */}
        {tab === 'catalog' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Imaging Types */}
            <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] flex items-center justify-between">
                <h3 className="font-medium text-[var(--color-text)]">Imaging Types</h3>
                <span className="text-sm text-[var(--color-text-muted)]">{imagingTypes.length} types</span>
              </div>
              <div className="divide-y divide-[var(--color-border)]">
                {imagingTypes.map(t => (
                  <div key={t.id} className="px-4 py-3 flex items-center justify-between hover:bg-[var(--color-bg-secondary)]">
                    <div className="flex items-center gap-2">
                      {t.code && <span className="font-mono text-xs bg-sky-50 text-sky-700 px-1.5 py-0.5 rounded">{t.code}</span>}
                      <span className="text-sm text-[var(--color-text)]">{t.name}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)]" />
                  </div>
                ))}
                {imagingTypes.length === 0 && (
                  <div className="px-4 py-6 text-center text-sm text-[var(--color-text-muted)]">No imaging types configured</div>
                )}
              </div>
            </div>

            {/* Imaging Items */}
            <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] flex items-center justify-between">
                <h3 className="font-medium text-[var(--color-text)]">Imaging Tests</h3>
                <span className="text-sm text-[var(--color-text-muted)]">{imagingItems.length} tests</span>
              </div>
              <div className="divide-y divide-[var(--color-border)] max-h-96 overflow-y-auto">
                {imagingItems.map(it => {
                  const typeName = imagingTypes.find(t => t.id === it.imaging_type_id)?.name;
                  return (
                    <div key={it.id} className="px-4 py-3 hover:bg-[var(--color-bg-secondary)]">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-[var(--color-text)]">{it.name}</span>
                        {it.price_paisa > 0 && (
                          <span className="text-xs text-[var(--color-text-muted)]">৳{(it.price_paisa / 100).toFixed(0)}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {typeName && <span className="text-xs text-[var(--color-text-muted)]">{typeName}</span>}
                        {it.procedure_code && <span className="font-mono text-xs text-sky-500">{it.procedure_code}</span>}
                      </div>
                    </div>
                  );
                })}
                {imagingItems.length === 0 && (
                  <div className="px-4 py-6 text-center text-sm text-[var(--color-text-muted)]">No items — seed data will load on first request</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── PACS TAB ── */}
        {tab === 'pacs' && (
          <div className="flex flex-col items-center justify-center py-16 text-[var(--color-text-muted)]">
            <ImageIcon className="w-12 h-12 mb-4 opacity-30" />
            <p className="text-lg font-medium mb-1">PACS / DICOM Studies</p>
            <p className="text-sm text-center max-w-sm">
              DICOM studies are registered when images arrive from the imaging modality.
              Connect your X-Ray / CT / MRI machine via the REST API (<code className="text-xs bg-zinc-100 px-1 rounded">/api/radiology/pacs</code>) or an OrthanC DICOM-to-REST bridge.
            </p>
          </div>
        )}

        {/* ── MODAL: New Order ── */}
        {showNewOrder && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-[var(--color-bg)] rounded-2xl shadow-2xl w-full max-w-lg">
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
                <h2 className="text-lg font-semibold text-[var(--color-text)]">New Radiology Order</h2>
                <button onClick={() => setShowNewOrder(false)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                {/* Patient search */}
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Patient *</label>
                  <div className="flex gap-2">
                    <input
                      type="text" placeholder="Search patient name…"
                      onChange={e => loadPatients(e.target.value)}
                      className="flex-1 px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  {patients.length > 0 && (
                    <div className="mt-1 border border-[var(--color-border)] rounded-lg overflow-hidden max-h-32 overflow-y-auto">
                      {patients.map(p => (
                        <button
                          key={p.id}
                          onClick={() => { setNewOrder(o => ({ ...o, patient_id: String(p.id) })); setPatients([]); }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-bg-secondary)] ${newOrder.patient_id === String(p.id) ? 'bg-sky-50 text-sky-700 font-medium' : 'text-[var(--color-text)]'}`}
                        >
                          {p.name} <span className="text-xs text-[var(--color-text-muted)]">(#{p.id})</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {newOrder.patient_id && (
                    <p className="mt-1 text-xs text-emerald-600">✓ Patient #{newOrder.patient_id} selected</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Imaging Type *</label>
                    <select
                      value={newOrder.imaging_type_id}
                      onChange={e => setNewOrder(o => ({ ...o, imaging_type_id: e.target.value, imaging_item_id: '' }))}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] focus:outline-none focus:ring-2 focus:ring-sky-500"
                    >
                      <option value="">Select type…</option>
                      {imagingTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Imaging Test *</label>
                    <select
                      value={newOrder.imaging_item_id}
                      onChange={e => setNewOrder(o => ({ ...o, imaging_item_id: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] focus:outline-none focus:ring-2 focus:ring-sky-500"
                      disabled={!newOrder.imaging_type_id}
                    >
                      <option value="">Select test…</option>
                      {filteredItems.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Urgency</label>
                    <select
                      value={newOrder.urgency}
                      onChange={e => setNewOrder(o => ({ ...o, urgency: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] focus:outline-none focus:ring-2 focus:ring-sky-500"
                    >
                      <option value="normal">Normal</option>
                      <option value="urgent">Urgent</option>
                      <option value="stat">STAT (Immediate)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Imaging Date</label>
                    <input
                      type="date" value={newOrder.imaging_date}
                      onChange={e => setNewOrder(o => ({ ...o, imaging_date: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Prescribing Doctor</label>
                  <input
                    type="text" placeholder="Dr. Name"
                    value={newOrder.prescriber_name}
                    onChange={e => setNewOrder(o => ({ ...o, prescriber_name: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Clinical Remarks</label>
                  <textarea
                    rows={2} placeholder="Clinical indications, symptoms…"
                    value={newOrder.requisition_remarks}
                    onChange={e => setNewOrder(o => ({ ...o, requisition_remarks: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                  />
                </div>
              </div>
              <div className="flex gap-3 px-6 pb-6">
                <button onClick={() => setShowNewOrder(false)} className="flex-1 py-2 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-bg-secondary)] transition-colors">
                  Cancel
                </button>
                <button onClick={handleCreateOrder} className="flex-1 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition-colors">
                  Create Order
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── MODAL: Create Report ── */}
        {showNewReport !== null && (() => {
          const req = requisitions.find(r => r.id === showNewReport);
          if (!req) return null;
          return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-[var(--color-bg)] rounded-2xl shadow-2xl w-full max-w-lg">
                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
                  <div>
                    <h2 className="text-lg font-semibold text-[var(--color-text)]">Create Radiology Report</h2>
                    <p className="text-sm text-[var(--color-text-muted)]">{req.imaging_item_name} — {req.patient_name}</p>
                  </div>
                  <button onClick={() => setShowNewReport(null)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Indication / Clinical History</label>
                    <input
                      type="text" placeholder="Clinical indication…"
                      value={newReport.indication}
                      onChange={e => setNewReport(r => ({ ...r, indication: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Report / Findings *</label>
                    <textarea
                      rows={5} placeholder="Describe the radiological findings…"
                      value={newReport.report_text}
                      onChange={e => setNewReport(r => ({ ...r, report_text: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Radiologist</label>
                      <input
                        type="text" placeholder="Dr. Name"
                        value={newReport.performer_name}
                        onChange={e => setNewReport(r => ({ ...r, performer_name: e.target.value }))}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Report Status</label>
                      <select
                        value={newReport.order_status}
                        onChange={e => setNewReport(r => ({ ...r, order_status: e.target.value }))}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] focus:outline-none focus:ring-2 focus:ring-sky-500"
                      >
                        <option value="final">Final</option>
                        <option value="pending">Preliminary</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 px-6 pb-6">
                  <button onClick={() => setShowNewReport(null)} className="flex-1 py-2 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-bg-secondary)] transition-colors">
                    Cancel
                  </button>
                  <button onClick={() => handleCreateReport(req.id, req.patient_id)} className="flex-1 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition-colors">
                    Save Report
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </DashboardLayout>
  );
}
