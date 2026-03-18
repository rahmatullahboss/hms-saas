import { useState, useEffect } from 'react';
import { X, Printer, CheckCircle2, FileText, User, Calendar, Hash, Stethoscope, Badge as BadgeIcon } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { authHeader } from '../../utils/auth';

interface ReportDetail {
  id: number;
  radiology_number?: string;
  patient_id: number;
  patient_name?: string;
  patient_phone?: string;
  patient_dob?: string;
  requisition_id: number;
  imaging_type_name?: string;
  imaging_item_name?: string;
  prescriber_name?: string;
  performer_name?: string;
  indication?: string;
  report_text?: string;
  order_status: 'pending' | 'final';
  created_at: string;
}

interface Props {
  reportId: number;
  onClose: () => void;
  onFinalized?: () => void;
}

function PrintStyles() {
  return (
    <style>{`
      @media print {
        body > *:not(#radiology-print-area) { display: none !important; }
        #radiology-print-area { display: block !important; position: fixed; top: 0; left: 0; width: 100%; }
        .no-print { display: none !important; }
      }
    `}</style>
  );
}

export default function ReportDetailModal({ reportId, onClose, onFinalized }: Props) {
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [finalizing, setFinalizing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get(`/api/radiology/reports/${reportId}`, { headers: authHeader() });
        setReport(data.report);
      } catch {
        toast.error('Failed to load report');
        onClose();
      } finally {
        setLoading(false);
      }
    })();
  }, [reportId, onClose]);

  const handleFinalize = async () => {
    if (!report) return;
    setFinalizing(true);
    try {
      await axios.patch(`/api/radiology/reports/${report.id}/finalize`, {}, { headers: authHeader() });
      toast.success('Report finalized ✓');
      setReport(r => r ? { ...r, order_status: 'final' } : r);
      onFinalized?.();
    } catch {
      toast.error('Failed to finalize report');
    } finally {
      setFinalizing(false);
    }
  };

  const handlePrint = () => window.print();

  return (
    <>
      <PrintStyles />
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 no-print">
        <div className="bg-[var(--color-bg)] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-lg bg-sky-100">
                <FileText className="w-4 h-4 text-sky-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-[var(--color-text)]">Radiology Report</h2>
                {report?.radiology_number && (
                  <p className="text-xs font-mono text-sky-600">{report.radiology_number}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {report?.order_status === 'pending' && (
                <button
                  onClick={handleFinalize}
                  disabled={finalizing}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {finalizing ? 'Finalizing…' : 'Finalize'}
                </button>
              )}
              {report?.order_status === 'final' && (
                <span className="flex items-center gap-1 text-sm text-emerald-600 font-medium px-3 py-1.5 bg-emerald-50 rounded-lg border border-emerald-200">
                  <CheckCircle2 className="w-4 h-4" /> Final
                </span>
              )}
              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-secondary)] transition-colors"
              >
                <Printer className="w-4 h-4" /> Print
              </button>
              <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div id="radiology-print-area" className="flex-1 overflow-y-auto p-6 space-y-6">
            {loading ? (
              <div className="space-y-4 animate-pulse">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-6 bg-[var(--color-bg-secondary)] rounded w-3/4" />
                ))}
              </div>
            ) : report ? (
              <>
                {/* Patient + Test Info */}
                <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-[var(--color-bg-secondary)] border border-[var(--color-border)]">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <User className="w-4 h-4 text-[var(--color-text-muted)]" />
                      <span className="text-[var(--color-text-muted)]">Patient:</span>
                      <span className="font-medium text-[var(--color-text)]">
                        {report.patient_name ?? `#${report.patient_id}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Stethoscope className="w-4 h-4 text-[var(--color-text-muted)]" />
                      <span className="text-[var(--color-text-muted)]">Referring:</span>
                      <span className="text-[var(--color-text)]">{report.prescriber_name ?? '—'}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <BadgeIcon className="w-4 h-4 text-[var(--color-text-muted)]" />
                      <span className="text-[var(--color-text-muted)]">Test:</span>
                      <span className="text-[var(--color-text)]">{report.imaging_item_name ?? report.imaging_type_name ?? '—'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="w-4 h-4 text-[var(--color-text-muted)]" />
                      <span className="text-[var(--color-text-muted)]">Date:</span>
                      <span className="text-[var(--color-text)]">{report.created_at?.split('T')[0]}</span>
                    </div>
                  </div>
                </div>

                {/* Indication */}
                {report.indication && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">Clinical Indication</h3>
                    <p className="text-sm text-[var(--color-text)] p-3 bg-[var(--color-bg-secondary)] rounded-lg">{report.indication}</p>
                  </div>
                )}

                {/* Findings */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">Findings</h3>
                  <div className="text-sm text-[var(--color-text)] p-4 bg-[var(--color-bg-secondary)] rounded-lg border border-[var(--color-border)] whitespace-pre-wrap font-mono leading-relaxed min-h-[120px]">
                    {report.report_text || <span className="text-[var(--color-text-muted)] italic">No findings recorded</span>}
                  </div>
                </div>

                {/* Radiologist */}
                <div className="flex items-center justify-between pt-2 border-t border-[var(--color-border)]">
                  <div className="text-sm text-[var(--color-text-muted)]">
                    Radiologist: <span className="text-[var(--color-text)] font-medium">{report.performer_name ?? '—'}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-mono text-sky-600">
                    <Hash className="w-3 h-3" />
                    {report.radiology_number ?? `Report #${report.id}`}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
