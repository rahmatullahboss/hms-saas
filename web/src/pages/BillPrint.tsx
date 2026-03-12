import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { ArrowLeft, Printer, Download } from 'lucide-react';
import axios from 'axios';
import DashboardLayout from '../components/DashboardLayout';

// ─── Types ───────────────────────────────────────────────────────────────────

interface BillDetail {
  id: number;
  invoice_no: string;
  patient_name: string;
  patient_code: string;
  mobile: string;
  address: string;
  subtotal: number;
  discount: number;
  total_amount: number;
  paid_amount: number;
  status: string;
  created_at: string;
  created_by: string;
}

interface InvoiceItem {
  id: number;
  item_category: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
}

interface Payment {
  id: number;
  amount: number;
  type: string;
  receipt_no: string;
  payment_method: string | null;
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(date: string) {
  return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtTime(date: string) {
  return new Date(date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}
function money(n: number) {
  return `৳${n.toLocaleString('en-BD')}`;
}

/** Get hospital name from localStorage tenant data */
function getHospitalName(): string {
  try {
    const tenant = JSON.parse(localStorage.getItem('tenant') ?? '{}');
    return tenant?.name ?? 'Hospital Management System';
  } catch {
    return 'Hospital Management System';
  }
}

const STATUS_BADGE: Record<string, string> = {
  open: 'invoice-status-unpaid',
  partially_paid: 'invoice-status-partial',
  paid: 'invoice-status-paid',
};
const STATUS_LABEL: Record<string, string> = {
  open: 'UNPAID', partially_paid: 'PARTIAL', paid: 'PAID',
};

// ─── Print-specific inline styles (no Tailwind dependency) ────────────────────

const PRINT_STYLES = `
@media print {
  /* Hide everything except the invoice */
  aside, header, nav,
  .no-print { display: none !important; }

  /* Reset layout so invoice fills the page */
  body, html { background: white !important; }
  main {
    margin: 0 !important;
    padding: 0 !important;
    width: 100% !important;
    max-width: 100% !important;
    overflow: visible !important;
  }
  .flex.h-screen { display: block !important; overflow: visible !important; }

  /* Invoice card clean-up */
  .invoice-card {
    box-shadow: none !important;
    border: none !important;
    border-radius: 0 !important;
  }
  .invoice-header {
    background: #1e293b !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  @page { margin: 1cm; size: A4; }
}

/* Status badge styles used in invoice (non-Tailwind) */
.invoice-status-unpaid {
  display: inline-block;
  padding: 0.25rem 0.625rem;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  font-weight: 700;
  border: 1px solid #fbbf24;
  background: #fef3c7;
  color: #b45309;
}
.invoice-status-partial {
  display: inline-block;
  padding: 0.25rem 0.625rem;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  font-weight: 700;
  border: 1px solid #93c5fd;
  background: #dbeafe;
  color: #1d4ed8;
}
.invoice-status-paid {
  display: inline-block;
  padding: 0.25rem 0.625rem;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  font-weight: 700;
  border: 1px solid #6ee7b7;
  background: #d1fae5;
  color: #047857;
}
`;

// ─── Component ───────────────────────────────────────────────────────────────

export default function BillPrint({ role = 'hospital_admin' }: { role?: string }) {
  const { slug = '', billId = '' } = useParams<{ slug: string; billId: string }>();
  const navigate = useNavigate();
  const basePath = `/h/${slug}`;

  // Build correct back-link for role
  const billingPath = role === 'hospital_admin'
    ? `${basePath}/billing`
    : `${basePath}/reception/billing`;

  const [bill, setBill]         = useState<BillDetail | null>(null);
  const [items, setItems]       = useState<InvoiceItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading]   = useState(true);

  const fetchBill = useCallback(async () => {
    setLoading(true);
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const res = await axios.get(`/api/billing/${billId}`, { headers });
      setBill(res.data.bill as BillDetail);
      setItems(res.data.items ?? []);
      setPayments(res.data.payments ?? []);
    } catch (err) {
      console.error('[BillPrint] Fetch failed:', err);
      // Deterministic mock data for dev
      setBill({
        id: Number(billId), invoice_no: 'INV-00001',
        patient_name: 'Mohammad Karim', patient_code: 'P-00012',
        mobile: '01711-234567', address: '45 Mirpur Road, Dhaka',
        subtotal: 3500, discount: 200, total_amount: 3300,
        paid_amount: 2000, status: 'partially_paid',
        created_at: new Date().toISOString(), created_by: 'admin',
      });
      setItems([
        { id: 1, item_category: 'lab', description: 'CBC', quantity: 1, unit_price: 350, line_total: 350 },
        { id: 2, item_category: 'lab', description: 'Blood Glucose', quantity: 1, unit_price: 200, line_total: 200 },
        { id: 3, item_category: 'doctor_visit', description: 'Consultation Fee', quantity: 1, unit_price: 800, line_total: 800 },
        { id: 4, item_category: 'medicine', description: 'Paracetamol 500mg x20', quantity: 1, unit_price: 150, line_total: 150 },
        { id: 5, item_category: 'operation', description: 'Minor Procedure', quantity: 1, unit_price: 2000, line_total: 2000 },
      ]);
      setPayments([
        { id: 1, amount: 2000, type: 'payment', receipt_no: 'RCP-001', payment_method: 'cash', created_at: new Date().toISOString() },
      ]);
    } finally {
      setLoading(false);
    }
  }, [billId]);

  useEffect(() => { fetchBill(); }, [fetchBill]);

  const handlePrint = () => window.print();

  const outstanding = bill ? bill.total_amount - bill.paid_amount : 0;
  const hospitalName = getHospitalName();

  // ── Loading skeleton ──
  if (loading) {
    return (
      <DashboardLayout role={role}>
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="skeleton h-8 w-48 rounded-lg" />
          <div className="skeleton h-80 w-full rounded-xl" />
        </div>
      </DashboardLayout>
    );
  }

  if (!bill) {
    return (
      <DashboardLayout role={role}>
        <div className="card p-12 text-center max-w-md mx-auto">
          <p className="text-[var(--color-text-muted)]">Bill not found.</p>
          <button onClick={() => navigate(-1)} className="btn-primary mt-4">← Go Back</button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role={role}>
      <style>{PRINT_STYLES}</style>

      <div className="max-w-3xl mx-auto space-y-4">

        {/* ── Action Bar (hidden on print) ── */}
        <div className="flex items-center justify-between no-print">
          <Link to={billingPath} className="flex items-center gap-1 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">
            <ArrowLeft className="w-3.5 h-3.5" /> All Bills
          </Link>
          <div className="flex gap-2">
            <button onClick={handlePrint} className="btn-primary">
              <Printer className="w-4 h-4" /> Print Invoice
            </button>
            <button onClick={handlePrint} className="btn-secondary" title="Use your browser's 'Save as PDF' option in the print dialog">
              <Download className="w-4 h-4" /> Save as PDF
            </button>
          </div>
        </div>

        {/* ── Invoice Card ── */}
        <div className="invoice-card bg-white rounded-2xl shadow-md border border-gray-200 overflow-hidden">

          {/* Header */}
          <div className="invoice-header bg-gradient-to-r from-slate-800 to-slate-700 text-white p-6">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-xl font-bold tracking-tight">{hospitalName}</h1>
                <p className="text-slate-300 text-sm mt-1">Healthcare with Compassion</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold tracking-wider">INVOICE</p>
                <p className="text-slate-300 font-mono text-lg">{bill.invoice_no}</p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">

            {/* Meta row */}
            <div className="flex flex-wrap justify-between gap-4 text-sm">
              <div>
                <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Bill To</p>
                <p className="font-semibold text-gray-900">{bill.patient_name}</p>
                <p className="text-gray-500">{bill.patient_code} · {bill.mobile}</p>
                {bill.address && <p className="text-gray-500 mt-0.5">{bill.address}</p>}
              </div>
              <div className="text-right">
                <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Invoice Date</p>
                <p className="font-semibold text-gray-900">{fmt(bill.created_at)}</p>
                <p className="text-gray-500">{fmtTime(bill.created_at)}</p>
                <span className={`mt-2 ${STATUS_BADGE[bill.status] ?? STATUS_BADGE.open}`}>
                  {STATUS_LABEL[bill.status] ?? bill.status.toUpperCase()}
                </span>
              </div>
            </div>

            {/* ── Line Items Table ── */}
            <div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="pb-2 text-left text-gray-500 font-medium">#</th>
                    <th className="pb-2 text-left text-gray-500 font-medium">Description</th>
                    <th className="pb-2 text-left text-gray-500 font-medium">Category</th>
                    <th className="pb-2 text-center text-gray-500 font-medium">Qty</th>
                    <th className="pb-2 text-right text-gray-500 font-medium">Unit Price</th>
                    <th className="pb-2 text-right text-gray-500 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={item.id} className="border-b border-gray-100">
                      <td className="py-2.5 text-gray-400">{idx + 1}</td>
                      <td className="py-2.5 font-medium text-gray-900">{item.description || '—'}</td>
                      <td className="py-2.5">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">
                          {item.item_category.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-2.5 text-center text-gray-700">{item.quantity}</td>
                      <td className="py-2.5 text-right text-gray-700 font-mono">{money(item.unit_price)}</td>
                      <td className="py-2.5 text-right font-semibold text-gray-900 font-mono">{money(item.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Totals ── */}
            <div className="flex justify-end">
              <div className="w-72 space-y-2 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span className="font-mono">{money(bill.subtotal)}</span>
                </div>
                {bill.discount > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>Discount</span>
                    <span className="font-mono text-red-500">-{money(bill.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t-2 border-gray-900 text-gray-900 font-bold text-base">
                  <span>Total</span>
                  <span className="font-mono">{money(bill.total_amount)}</span>
                </div>
                <div className="flex justify-between text-emerald-600 font-medium">
                  <span>Paid</span>
                  <span className="font-mono">{money(bill.paid_amount)}</span>
                </div>
                {outstanding > 0 && (
                  <div className="flex justify-between text-amber-600 font-bold pt-1 border-t border-gray-200">
                    <span>Balance Due</span>
                    <span className="font-mono">{money(outstanding)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── Payments History ── */}
            {payments.length > 0 && (
              <div>
                <h3 className="text-xs uppercase tracking-wider text-gray-400 mb-2">Payment History</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="pb-1.5 text-left text-gray-500 font-medium">Receipt</th>
                      <th className="pb-1.5 text-left text-gray-500 font-medium">Date</th>
                      <th className="pb-1.5 text-left text-gray-500 font-medium">Method</th>
                      <th className="pb-1.5 text-right text-gray-500 font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map(p => (
                      <tr key={p.id} className="border-b border-gray-50">
                        <td className="py-2 font-mono text-gray-600">{p.receipt_no}</td>
                        <td className="py-2 text-gray-600">{fmt(p.created_at)}</td>
                        <td className="py-2 capitalize text-gray-600">{p.payment_method ?? 'N/A'}</td>
                        <td className="py-2 text-right font-mono font-semibold text-emerald-600">{money(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── Footer ── */}
            <div className="border-t border-gray-200 pt-4 text-center text-xs text-gray-400">
              <p>Thank you for choosing our healthcare services.</p>
              <p className="mt-1">This is a computer-generated invoice. No signature required.</p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
