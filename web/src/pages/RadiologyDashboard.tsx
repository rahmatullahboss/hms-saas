import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Scan, FileText, Search, Plus, X, Activity, RefreshCw,
  ClipboardList, ImageIcon, Filter, AlertTriangle, CheckCircle2,
  Clock, ChevronRight, FlaskConical, Zap, RotateCcw, Ban, Eye,
  AlertCircle, Database,
} from 'lucide-react';
import axios, { AxiosError } from 'axios';
import toast from 'react-hot-toast';
import DashboardLayout from '../components/DashboardLayout';
import KPICard from '../components/dashboard/KPICard';
import ReportDetailModal from '../components/radiology/ReportDetailModal';
import { authHeader } from '../utils/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Stats {
  pending: number;
  scanned: number;
  reported: number;
  cancelled: number;
  stat_pending: number;
}

interface ImagingType { id: number; name: string; code?: string; }
interface ImagingItem { id: number; imaging_type_id: number; name: string; procedure_code?: string; price_paisa: number; }

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

interface DicomStudy {
  id: number;
  patient_id?: number;
  patient_name?: string;
  study_instance_uid: string;
  modality?: string;
  study_date?: string;
  study_description?: string;
  series_count?: number;
  image_count?: number;
  is_mapped: number;
  created_at: string;
}

interface Patient { id: number; name: string; }

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function TableSkeleton({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <>
      {[...Array(rows)].map((_, i) => (
        <tr key={i} className="animate-pulse">
          {[...Array(cols)].map((_, j) => (
            <td key={j} className="px-4 py-3">
              <div className="h-4 bg-[var(--color-bg-secondary)] rounded w-3/4" style={{ width: `${50 + Math.random() * 40}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function KPISkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="rounded-xl border border-[var(--color-border)] p-4 animate-pulse">
          <div className="h-3 bg-[var(--color-bg-secondary)] rounded w-16 mb-3" />
          <div className="h-7 bg-[var(--color-bg-secondary)] rounded w-10" />
        </div>
      ))}
    </div>
  );
}

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

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <tr>
      <td colSpan={99} className="px-4 py-10 text-center">
        <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
        <p className="text-sm text-red-600 mb-3">{message}</p>
        <button onClick={onRetry} className="px-4 py-1.5 text-xs rounded-lg bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 transition-colors">
          Retry
        </button>
      </td>
    </tr>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function RadiologyDashboard() {
  const { t } = useTranslation('radiology');
  const [tab, setTab] = useState<'orders' | 'reports' | 'catalog' | 'pacs'>('orders');

  // Data
  const [stats, setStats]               = useState<Stats | null>(null);
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [reports, setReports]           = useState<Report[]>([]);
  const [imagingTypes, setImagingTypes] = useState<ImagingType[]>([]);
  const [imagingItems, setImagingItems] = useState<ImagingItem[]>([]);
  const [patients, setPatients]         = useState<Patient[]>([]);
  const [pacsStudies, setPacsStudies]   = useState<DicomStudy[]>([]);
  const [pacsTotal, setPacsTotal]       = useState(0);

  // Loading/error per section
  const [loadingOrders,  setLoadingOrders]  = useState(false);
  const [loadingReports, setLoadingReports] = useState(false);
  const [loadingPacs,    setLoadingPacs]    = useState(false);
  const [errOrders,  setErrOrders]  = useState(false);
  const [errReports, setErrReports] = useState(false);
  const [errPacs,    setErrPacs]    = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery,  setSearchQuery]  = useState('');
  const [fromDate,     setFromDate]     = useState('');
  const [toDate,       setToDate]       = useState('');
  const [modalityFilter, setModalityFilter] = useState('');
  const [reqPage,  setReqPage]  = useState(1);
  const [reqTotal, setReqTotal] = useState(0);

  // Modals
  const [showNewOrder,   setShowNewOrder]   = useState(false);
  const [showNewReport,  setShowNewReport]  = useState<number | null>(null);
  const [showCancel,     setShowCancel]     = useState<number | null>(null);
  const [cancelRemarks,  setCancelRemarks]  = useState('');
  const [viewReportId,   setViewReportId]   = useState<number | null>(null);

  // Forms
  const [newOrder, setNewOrder] = useState({
    patient_id: '', imaging_type_id: '', imaging_item_id: '',
    urgency: 'normal', imaging_date: new Date().toISOString().split('T')[0],
    prescriber_name: '', requisition_remarks: '',
  });
  const [filteredItems, setFilteredItems] = useState<ImagingItem[]>([]);
  const [newReport, setNewReport] = useState({
    report_text: '', indication: '', performer_name: '', order_status: 'final',
  });

  // ── Loaders ────────────────────────────────────────────────────────────────

  const loadStats = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/radiology/stats', { headers: authHeader() });
      setStats(data);
    } catch { /* silent — KPI is supplementary */ }
  }, []);

  const loadRequisitions = useCallback(async () => {
    setLoadingOrders(true);
    setErrOrders(false);
    try {
      const params: Record<string, string> = { page: String(reqPage), limit: '20' };
      if (statusFilter) params.status = statusFilter;
      if (fromDate)     params.from_date = fromDate;
      if (toDate)       params.to_date = toDate;
      const { data } = await axios.get('/api/radiology/requisitions', { headers: authHeader(), params });
      setRequisitions(data.requisitions ?? []);
      setReqTotal(data.meta?.total ?? 0);
    } catch {
      setErrOrders(true);
    } finally {
      setLoadingOrders(false);
    }
  }, [statusFilter, fromDate, toDate, reqPage]);

  const loadReports = useCallback(async () => {
    setLoadingReports(true);
    setErrReports(false);
    try {
      const { data } = await axios.get('/api/radiology/reports', { headers: authHeader(), params: { limit: '50' } });
      setReports(data.reports ?? []);
    } catch {
      setErrReports(true);
    } finally {
      setLoadingReports(false);
    }
  }, []);

  const loadCatalog = useCallback(async () => {
    try {
      const [tRes, iRes] = await Promise.all([
        axios.get('/api/radiology/imaging-types', { headers: authHeader() }),
        axios.get('/api/radiology/imaging-items',  { headers: authHeader() }),
      ]);
      setImagingTypes(tRes.data.imaging_types ?? []);
      setImagingItems(iRes.data.imaging_items  ?? []);
    } catch { /* silent */ }
  }, []);

  const loadPacsStudies = useCallback(async () => {
    setLoadingPacs(true);
    setErrPacs(false);
    try {
      const params: Record<string, string> = { limit: '20' };
      if (modalityFilter) params.modality = modalityFilter;
      const { data } = await axios.get('/api/radiology/pacs', { headers: authHeader(), params });
      setPacsStudies(data.studies ?? []);
      setPacsTotal(data.meta?.total ?? 0);
    } catch {
      setErrPacs(true);
    } finally {
      setLoadingPacs(false);
    }
  }, [modalityFilter]);

  const loadPatients = useCallback(async (q: string) => {
    if (q.length < 2) return;
    try {
      const { data } = await axios.get('/api/patients', { headers: authHeader(), params: { search: q, limit: 10 } });
      setPatients(data.patients ?? data.data ?? []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadStats(); loadCatalog(); }, []);
  useEffect(() => { if (tab === 'orders')  loadRequisitions(); }, [tab, loadRequisitions]);
  useEffect(() => { if (tab === 'reports') loadReports();      }, [tab, loadReports]);
  useEffect(() => { if (tab === 'pacs')    loadPacsStudies();  }, [tab, loadPacsStudies]);
  useEffect(() => {
    setFilteredItems(
      newOrder.imaging_type_id
        ? imagingItems.filter(i => String(i.imaging_type_id) === newOrder.imaging_type_id)
        : imagingItems,
    );
  }, [newOrder.imaging_type_id, imagingItems]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleCreateOrder = async () => {
    if (!newOrder.patient_id || !newOrder.imaging_type_id || !newOrder.imaging_item_id) {
      toast.error(t('messages.missingFields')); return;
    }
    try {
      await axios.post('/api/radiology/requisitions', {
        patient_id:     Number(newOrder.patient_id),
        imaging_type_id: Number(newOrder.imaging_type_id),
        imaging_item_id: Number(newOrder.imaging_item_id),
        urgency:          newOrder.urgency,
        imaging_date:     newOrder.imaging_date,
        prescriber_name:  newOrder.prescriber_name  || undefined,
        requisition_remarks: newOrder.requisition_remarks || undefined,
      }, { headers: authHeader() });
      toast.success(t('messages.orderCreated'));
      setShowNewOrder(false);
      setNewOrder({ patient_id: '', imaging_type_id: '', imaging_item_id: '', urgency: 'normal', imaging_date: new Date().toISOString().split('T')[0], prescriber_name: '', requisition_remarks: '' });
      loadRequisitions(); loadStats();
    } catch (err) {
      const msg = (err as AxiosError<{ message?: string }>).response?.data?.message;
      toast.error(msg ?? t('messages.orderFailed'));
    }
  };

  const handleScan = async (id: number) => {
    try {
      await axios.patch(`/api/radiology/requisitions/${id}/scan`, {}, { headers: authHeader() });
      toast.success(t('messages.markedScanned'));
      loadRequisitions(); loadStats();
    } catch { toast.error(t('messages.scannedFailed')); }
  };

  const handleUnscan = async (id: number) => {
    try {
      await axios.patch(`/api/radiology/requisitions/${id}/unscan`, {}, { headers: authHeader() });
      toast.success(t('messages.unscanned'));
      loadRequisitions(); loadStats();
    } catch (err) {
      const msg = (err as AxiosError<{ message?: string }>).response?.data?.message;
      toast.error(msg ?? t('messages.unscanFailed'));
    }
  };

  const handleConfirmCancel = async () => {
    if (!showCancel) return;
    try {
      await axios.patch(`/api/radiology/requisitions/${showCancel}/cancel`, { cancel_remarks: cancelRemarks || undefined }, { headers: authHeader() });
      toast.success(t('messages.orderCancelled'));
      setShowCancel(null);
      setCancelRemarks('');
      loadRequisitions(); loadStats();
    } catch {
      toast.error(t('messages.cancelFailed'));
    }
  };

  const handleCreateReport = async (requisitionId: number, patientId: number) => {
    if (!newReport.report_text) { toast.error(t('messages.missingReportText')); return; }
    try {
      const req = requisitions.find(r => r.id === requisitionId);
      await axios.post('/api/radiology/reports', {
        requisition_id:   requisitionId,
        patient_id:       patientId,
        imaging_type_name: req?.imaging_type_name,
        imaging_item_name: req?.imaging_item_name,
        report_text:      newReport.report_text,
        indication:       newReport.indication    || undefined,
        performer_name:   newReport.performer_name || undefined,
        order_status:     newReport.order_status,
      }, { headers: authHeader() });
      toast.success(t('messages.reportCreated'));
      setShowNewReport(null);
      setNewReport({ report_text: '', indication: '', performer_name: '', order_status: 'final' });
      loadRequisitions(); loadStats();
    } catch (err) {
      const msg = (err as AxiosError<{ message?: string }>).response?.data?.message;
      toast.error(msg ?? t('messages.reportFailed'));
    }
  };

  const handleFinalizeReport = async (id: number) => {
    try {
      await axios.patch(`/api/radiology/reports/${id}/finalize`, {}, { headers: authHeader() });
      toast.success(t('messages.reportFinalized'));
      loadReports();
    } catch { toast.error(t('messages.finalizeFailed')); }
  };

  const filteredReqs = requisitions.filter(r =>
    !searchQuery ||
    r.patient_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.imaging_item_name?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const tabs = [
    { id: 'orders',  label: t('tabs.orders'),  icon: ClipboardList },
    { id: 'reports', label: t('tabs.reports'), icon: FileText },
    { id: 'catalog', label: t('tabs.catalog'), icon: FlaskConical },
    { id: 'pacs',    label: t('tabs.pacs'),    icon: ImageIcon },
  ] as const;

  const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] focus:outline-none focus:ring-2 focus:ring-sky-500';

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
              <h1 className="text-2xl font-bold text-[var(--color-text)]">{t('title')}</h1>
              <p className="text-sm text-[var(--color-text-muted)]">{t('subtitle')}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { loadStats(); if (tab === 'orders') loadRequisitions(); else if (tab === 'reports') loadReports(); else if (tab === 'pacs') loadPacsStudies(); }}
              className="p-2 rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-secondary)] transition-colors"
              title={t('refresh')}
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
                {t('newOrder')}
              </button>
            )}
          </div>
        </div>

        {/* KPI Cards */}
        {!stats ? <KPISkeleton /> : (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <KPICard title={t('kpi.pending')}    value={stats.pending}     icon={<Clock        className="w-5 h-5 text-amber-500" />} />
            <KPICard title={t('kpi.scanned')}    value={stats.scanned}     icon={<Scan         className="w-5 h-5 text-blue-500" />} />
            <KPICard title={t('kpi.reported')}   value={stats.reported}    icon={<CheckCircle2 className="w-5 h-5 text-emerald-500" />} />
            <KPICard title={t('kpi.statOrders')} value={stats.stat_pending} icon={<Zap         className="w-5 h-5 text-fuchsia-500" />} />
            <KPICard title={t('kpi.cancelled')}  value={stats.cancelled}   icon={<X            className="w-5 h-5 text-red-500" />} />
          </div>
        )}

        {/* STAT alert */}
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
              key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === id
                  ? 'border-sky-600 text-sky-600'
                  : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </div>

        {/* ── ORDERS TAB ── */}
        {tab === 'orders' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
                <input
                  type="text" placeholder={t('orders.searchPlaceholder')}
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <select
                value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setReqPage(1); }}
                className="px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="">{t('orders.allStatuses')}</option>
                <option value="pending">{t('orders.statusPending')}</option>
                <option value="scanned">{t('orders.statusScanned')}</option>
                <option value="reported">{t('orders.statusReported')}</option>
                <option value="cancelled">{t('orders.statusCancelled')}</option>
              </select>
              <input
                type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setReqPage(1); }}
                title={t('orders.fromDate')}
                className="px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <input
                type="date" value={toDate} onChange={e => { setToDate(e.target.value); setReqPage(1); }}
                title={t('orders.toDate')}
                className="px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)]">
                  <tr>
                    {[t('orders.table.hash'), t('orders.table.patient'), t('orders.table.imagingTest'), t('orders.table.date'), t('orders.table.urgency'), t('orders.table.status'), t('orders.table.actions')].map(h => (
                      <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {loadingOrders ? (
                    <TableSkeleton cols={7} />
                  ) : errOrders ? (
                    <ErrorState message={t('orders.errorLoading')} onRetry={loadRequisitions} />
                  ) : filteredReqs.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-[var(--color-text-muted)]">{t('orders.noOrders')}</td></tr>
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
                        <div className="flex flex-wrap gap-1.5">
                          {/* Scan */}
                          {req.order_status === 'pending' && !req.is_scanned && (
                            <button onClick={() => handleScan(req.id)}
                              className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors">
                              <Scan className="w-3 h-3" />{t('orders.scan')}
                            </button>
                          )}
                          {/* Un-scan */}
                          {req.order_status === 'scanned' && !req.is_report_saved && (
                            <button onClick={() => handleUnscan(req.id)}
                              className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors">
                              <RotateCcw className="w-3 h-3" />{t('orders.unscan')}
                            </button>
                          )}
                          {/* Report */}
                          {(req.order_status === 'scanned' || req.order_status === 'pending') && !req.is_report_saved && (
                            <button onClick={() => setShowNewReport(req.id)}
                              className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors">
                              <FileText className="w-3 h-3" />{t('orders.report')}
                            </button>
                          )}
                          {/* Reported badge */}
                          {req.is_report_saved === 1 && (
                            <span className="flex items-center gap-1 text-xs text-emerald-600">
                              <CheckCircle2 className="w-3 h-3" />{t('orders.reportedLabel')}
                            </span>
                          )}
                          {/* Cancel */}
                          {req.order_status !== 'reported' && req.order_status !== 'cancelled' && (
                            <button onClick={() => { setShowCancel(req.id); setCancelRemarks(''); }}
                              className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-red-50 text-red-700 hover:bg-red-100 transition-colors">
                              <Ban className="w-3 h-3" />{t('orders.cancel')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {reqTotal > 20 && (
                <div className="px-4 py-3 border-t border-[var(--color-border)] flex items-center justify-between text-sm text-[var(--color-text-muted)]">
                  <span>{t('orders.showingPage', { page: reqPage, total: reqTotal })}</span>
                  <div className="flex gap-2">
                    <button disabled={reqPage === 1} onClick={() => setReqPage(p => p - 1)} className="px-3 py-1 rounded border border-[var(--color-border)] disabled:opacity-40">{t('orders.prev')}</button>
                    <button disabled={reqPage * 20 >= reqTotal} onClick={() => setReqPage(p => p + 1)} className="px-3 py-1 rounded border border-[var(--color-border)] disabled:opacity-40">{t('orders.next')}</button>
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
                  {[t('reports.table.radNum'), t('reports.table.patient'), t('reports.table.test'), t('reports.table.radiologist'), t('reports.table.status'), t('reports.table.date'), t('reports.table.actions')].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {loadingReports ? (
                  <TableSkeleton cols={7} />
                ) : errReports ? (
                  <ErrorState message={t('reports.errorLoading')} onRetry={loadReports} />
                ) : reports.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-[var(--color-text-muted)]">{t('reports.noReports')}</td></tr>
                ) : reports.map(r => (
                  <tr key={r.id} className="hover:bg-[var(--color-bg-secondary)] transition-colors cursor-pointer" onClick={() => setViewReportId(r.id)}>
                    <td className="px-4 py-3 font-mono text-xs font-medium text-sky-600">{r.radiology_number ?? `#${r.id}`}</td>
                    <td className="px-4 py-3 font-medium">{r.patient_name ?? `Patient #${r.patient_id}`}</td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)]">{r.imaging_item_name ?? r.imaging_type_name ?? '—'}</td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)]">{r.performer_name ?? '—'}</td>
                    <td className="px-4 py-3"><Badge text={r.order_status} variant={r.order_status === 'final' ? 'success' : 'warning'} /></td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)]">{r.created_at?.split('T')[0]}</td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1.5">
                        <button onClick={() => setViewReportId(r.id)}
                          className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-sky-50 text-sky-700 hover:bg-sky-100 transition-colors">
                          <Eye className="w-3 h-3" />{t('reports.view')}
                        </button>
                        {r.order_status === 'pending' && (
                          <button onClick={() => handleFinalizeReport(r.id)}
                            className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors">
                            <CheckCircle2 className="w-3 h-3" />{t('reports.finalize')}
                          </button>
                        )}
                      </div>
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
            <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] flex items-center justify-between">
                <h3 className="font-medium text-[var(--color-text)]">{t('catalog.imagingTypes')}</h3>
                <span className="text-sm text-[var(--color-text-muted)]">{t('catalog.typesCount', { count: imagingTypes.length })}</span>
              </div>
              <div className="divide-y divide-[var(--color-border)]">
                {imagingTypes.map(type => (
                  <div key={type.id} className="px-4 py-3 flex items-center justify-between hover:bg-[var(--color-bg-secondary)]">
                    <div className="flex items-center gap-2">
                      {type.code && <span className="font-mono text-xs bg-sky-50 text-sky-700 px-1.5 py-0.5 rounded">{type.code}</span>}
                      <span className="text-sm text-[var(--color-text)]">{type.name}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)]" />
                  </div>
                ))}
                {imagingTypes.length === 0 && (
                  <div className="px-4 py-6 text-center text-sm text-[var(--color-text-muted)]">{t('catalog.noTypes')}</div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] flex items-center justify-between">
                <h3 className="font-medium text-[var(--color-text)]">{t('catalog.imagingTests')}</h3>
                <span className="text-sm text-[var(--color-text-muted)]">{t('catalog.testsCount', { count: imagingItems.length })}</span>
              </div>
              <div className="divide-y divide-[var(--color-border)] max-h-96 overflow-y-auto">
                {imagingItems.map(item => {
                  const typeName = imagingTypes.find(t => t.id === item.imaging_type_id)?.name;
                  return (
                    <div key={item.id} className="px-4 py-3 hover:bg-[var(--color-bg-secondary)]">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-[var(--color-text)]">{item.name}</span>
                        {item.price_paisa > 0 && (
                          <span className="text-xs text-[var(--color-text-muted)]">৳{(item.price_paisa / 100).toFixed(0)}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {typeName && <span className="text-xs text-[var(--color-text-muted)]">{typeName}</span>}
                        {item.procedure_code && <span className="font-mono text-xs text-sky-500">{item.procedure_code}</span>}
                      </div>
                    </div>
                  );
                })}
                {imagingItems.length === 0 && (
                  <div className="px-4 py-6 text-center text-sm text-[var(--color-text-muted)]">{t('catalog.noTests')}</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── PACS TAB ── */}
        {tab === 'pacs' && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <select
                value={modalityFilter}
                onChange={e => { setModalityFilter(e.target.value); }}
                className="px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="">{t('pacs.allModalities')}</option>
                {['CR', 'CT', 'MR', 'US', 'DX', 'MG', 'PT', 'NM', 'RF', 'XA'].map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <span className="ml-auto text-sm text-[var(--color-text-muted)] self-center">
                {pacsTotal} {pacsTotal === 1 ? 'study' : 'studies'}
              </span>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)]">
                  <tr>
                    {[t('pacs.table.studyUid'), t('pacs.table.patient'), t('pacs.table.modality'), t('pacs.table.date'), t('pacs.table.series'), t('pacs.table.images'), t('pacs.table.mapped')].map(h => (
                      <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {loadingPacs ? (
                    <TableSkeleton cols={7} />
                  ) : errPacs ? (
                    <ErrorState message={t('pacs.errorLoading')} onRetry={loadPacsStudies} />
                  ) : pacsStudies.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-14 text-center">
                        <Database className="w-10 h-10 text-[var(--color-text-muted)] opacity-30 mx-auto mb-3" />
                        <p className="text-sm text-[var(--color-text-muted)]">{t('pacs.noStudies')}</p>
                        <p className="text-xs text-[var(--color-text-muted)] mt-1">{t('pacs.description')}</p>
                      </td>
                    </tr>
                  ) : pacsStudies.map(s => (
                    <tr key={s.id} className="hover:bg-[var(--color-bg-secondary)] transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-sky-600 max-w-32 truncate" title={s.study_instance_uid}>{s.study_instance_uid}</td>
                      <td className="px-4 py-3 font-medium">{s.patient_name ?? `#${s.patient_id ?? '—'}`}</td>
                      <td className="px-4 py-3"><Badge text={s.modality ?? '?'} variant="info" /></td>
                      <td className="px-4 py-3 text-[var(--color-text-muted)]">{s.study_date ?? '—'}</td>
                      <td className="px-4 py-3 text-[var(--color-text-muted)]">{s.series_count ?? '—'}</td>
                      <td className="px-4 py-3 text-[var(--color-text-muted)]">{s.image_count ?? '—'}</td>
                      <td className="px-4 py-3">
                        {s.is_mapped ? (
                          <Badge text="Mapped" variant="success" />
                        ) : (
                          <Badge text="Unlinked" variant="muted" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── MODAL: New Order ── */}
        {showNewOrder && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-[var(--color-bg)] rounded-2xl shadow-2xl w-full max-w-lg">
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
                <h2 className="text-lg font-semibold text-[var(--color-text)]">{t('modals.newOrder.title')}</h2>
                <button onClick={() => setShowNewOrder(false)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                {/* Patient */}
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">{t('modals.newOrder.patientLabel')}</label>
                  <input type="text" placeholder={t('modals.newOrder.patientSearchPlaceholder')}
                    onChange={e => loadPatients(e.target.value)}
                    className={inputCls} />
                  {patients.length > 0 && (
                    <div className="mt-1 border border-[var(--color-border)] rounded-lg overflow-hidden max-h-32 overflow-y-auto">
                      {patients.map(p => (
                        <button key={p.id}
                          onClick={() => { setNewOrder(o => ({ ...o, patient_id: String(p.id) })); setPatients([]); }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-bg-secondary)] ${newOrder.patient_id === String(p.id) ? 'bg-sky-50 text-sky-700 font-medium' : 'text-[var(--color-text)]'}`}>
                          {p.name} <span className="text-xs text-[var(--color-text-muted)]">(#{p.id})</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {newOrder.patient_id && <p className="mt-1 text-xs text-emerald-600">{t('modals.newOrder.patientSelected', { id: newOrder.patient_id })}</p>}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">{t('modals.newOrder.typeLabel')}</label>
                    <select value={newOrder.imaging_type_id}
                      onChange={e => setNewOrder(o => ({ ...o, imaging_type_id: e.target.value, imaging_item_id: '' }))}
                      className={inputCls}>
                      <option value="">{t('modals.newOrder.typePlaceholder')}</option>
                      {imagingTypes.map(ty => <option key={ty.id} value={ty.id}>{ty.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">{t('modals.newOrder.testLabel')}</label>
                    <select value={newOrder.imaging_item_id}
                      onChange={e => setNewOrder(o => ({ ...o, imaging_item_id: e.target.value }))}
                      className={inputCls} disabled={!newOrder.imaging_type_id}>
                      <option value="">{t('modals.newOrder.testPlaceholder')}</option>
                      {filteredItems.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">{t('modals.newOrder.urgencyLabel')}</label>
                    <select value={newOrder.urgency} onChange={e => setNewOrder(o => ({ ...o, urgency: e.target.value }))} className={inputCls}>
                      <option value="normal">{t('modals.newOrder.urgencyNormal')}</option>
                      <option value="urgent">{t('modals.newOrder.urgencyUrgent')}</option>
                      <option value="stat">{t('modals.newOrder.urgencyStat')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">{t('modals.newOrder.dateLabel')}</label>
                    <input type="date" value={newOrder.imaging_date}
                      onChange={e => setNewOrder(o => ({ ...o, imaging_date: e.target.value }))}
                      className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">{t('modals.newOrder.doctorLabel')}</label>
                  <input type="text" placeholder={t('modals.newOrder.doctorPlaceholder')} value={newOrder.prescriber_name}
                    onChange={e => setNewOrder(o => ({ ...o, prescriber_name: e.target.value }))}
                    className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">{t('modals.newOrder.remarksLabel')}</label>
                  <textarea rows={2} placeholder={t('modals.newOrder.remarksPlaceholder')} value={newOrder.requisition_remarks}
                    onChange={e => setNewOrder(o => ({ ...o, requisition_remarks: e.target.value }))}
                    className={`${inputCls} resize-none`} />
                </div>
              </div>
              <div className="flex gap-3 px-6 pb-6">
                <button onClick={() => setShowNewOrder(false)} className="flex-1 py-2 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-bg-secondary)] transition-colors">{t('modals.newOrder.cancel')}</button>
                <button onClick={handleCreateOrder} className="flex-1 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition-colors">{t('modals.newOrder.submit')}</button>
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
                    <h2 className="text-lg font-semibold text-[var(--color-text)]">{t('modals.newReport.title')}</h2>
                    <p className="text-sm text-[var(--color-text-muted)]">{req.imaging_item_name} — {req.patient_name}</p>
                  </div>
                  <button onClick={() => setShowNewReport(null)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">{t('modals.newReport.indicationLabel')}</label>
                    <input type="text" placeholder={t('modals.newReport.indicationPlaceholder')} value={newReport.indication}
                      onChange={e => setNewReport(r => ({ ...r, indication: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">{t('modals.newReport.reportLabel')}</label>
                    <textarea rows={6} placeholder={t('modals.newReport.reportPlaceholder')} value={newReport.report_text}
                      onChange={e => setNewReport(r => ({ ...r, report_text: e.target.value }))}
                      className={`${inputCls} resize-none font-mono`} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">{t('modals.newReport.radiologistLabel')}</label>
                      <input type="text" placeholder={t('modals.newReport.radiologistPlaceholder')} value={newReport.performer_name}
                        onChange={e => setNewReport(r => ({ ...r, performer_name: e.target.value }))} className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">{t('modals.newReport.statusLabel')}</label>
                      <select value={newReport.order_status} onChange={e => setNewReport(r => ({ ...r, order_status: e.target.value }))} className={inputCls}>
                        <option value="final">{t('modals.newReport.statusFinal')}</option>
                        <option value="pending">{t('modals.newReport.statusPreliminary')}</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 px-6 pb-6">
                  <button onClick={() => setShowNewReport(null)} className="flex-1 py-2 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-bg-secondary)] transition-colors">{t('modals.newReport.cancel')}</button>
                  <button onClick={() => handleCreateReport(req.id, req.patient_id)} className="flex-1 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition-colors">{t('modals.newReport.submit')}</button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── MODAL: Cancel Order ── */}
        {showCancel !== null && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-[var(--color-bg)] rounded-2xl shadow-2xl w-full max-w-md">
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                  <h2 className="text-lg font-semibold text-[var(--color-text)]">{t('modals.cancelOrder.title')}</h2>
                </div>
                <button onClick={() => setShowCancel(null)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6">
                <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">{t('modals.cancelOrder.remarksLabel')}</label>
                <textarea rows={3} placeholder={t('modals.cancelOrder.remarksPlaceholder')} value={cancelRemarks}
                  onChange={e => setCancelRemarks(e.target.value)}
                  className={`${inputCls} resize-none`} />
              </div>
              <div className="flex gap-3 px-6 pb-6">
                <button onClick={() => setShowCancel(null)} className="flex-1 py-2 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-bg-secondary)] transition-colors">{t('modals.cancelOrder.cancel')}</button>
                <button onClick={handleConfirmCancel} className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors">{t('modals.cancelOrder.submit')}</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Report Detail Modal ── */}
        {viewReportId !== null && (
          <ReportDetailModal
            reportId={viewReportId}
            onClose={() => setViewReportId(null)}
            onFinalized={loadReports}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
