import { useState } from 'react';
import { FileText, Printer, RefreshCw } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import DashboardLayout from '../../components/DashboardLayout';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT', minimumFractionDigits: 0 }).format(n);

export default function Reports({ role = 'md' }: { role?: string }) {
  const today = new Date().toISOString().split('T')[0];
  const [reportType, setReportType] = useState('pl');
  const [startDate,  setStartDate]  = useState(today);
  const [endDate,    setEndDate]    = useState(today);
  const [data,       setData]       = useState<Record<string, unknown> | null>(null);
  const [loading,    setLoading]    = useState(false);

  const generateReport = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('hms_token');
      const headers = { Authorization: `Bearer ${token}` };
      let res;
      if      (reportType === 'pl')      res = await axios.get(`/api/reports/pl?startDate=${startDate}&endDate=${endDate}`, { headers });
      else if (reportType === 'income')  res = await axios.get(`/api/reports/income-by-source?startDate=${startDate}&endDate=${endDate}`, { headers });
      else if (reportType === 'expense') res = await axios.get(`/api/reports/expense-by-category?startDate=${startDate}&endDate=${endDate}`, { headers });
      else if (reportType === 'monthly') res = await axios.get(`/api/reports/monthly?year=${new Date().getFullYear()}`, { headers });
      setData(res?.data ?? null);
    } catch { toast.error('Error generating report'); }
    finally { setLoading(false); }
  };

  return (
    <DashboardLayout role={role}>
      <div className="space-y-5 max-w-screen-2xl mx-auto">

        {/* ── Header ── */}
        <div className="page-header">
          <h1 className="page-title"><FileText className="inline w-6 h-6 mr-2 mb-0.5 text-[var(--color-primary)]" />Financial Reports</h1>
          <button onClick={() => window.print()} className="btn-secondary">
            <Printer className="w-4 h-4" /> Print
          </button>
        </div>

        {/* ── Controls ── */}
        <div className="card p-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="label">Report Type</label>
              <select value={reportType} onChange={e => setReportType(e.target.value)} className="input">
                <option value="pl">Profit &amp; Loss</option>
                <option value="income">Income by Source</option>
                <option value="expense">Expense by Category</option>
                <option value="monthly">Monthly Summary</option>
              </select>
            </div>
            {reportType !== 'monthly' && (
              <>
                <div>
                  <label className="label">Start Date</label>
                  <input type="date" className="input" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
                <div>
                  <label className="label">End Date</label>
                  <input type="date" className="input" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
              </>
            )}
            <div className={reportType !== 'monthly' ? '' : 'md:col-start-4'}>
              <button onClick={generateReport} disabled={loading} className="btn-primary w-full">
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                {loading ? 'Generating…' : 'Generate Report'}
              </button>
            </div>
          </div>
        </div>

        {/* ── Report Output ── */}
        {data && (
          <div className="card p-6 print:shadow-none space-y-6">

            {/* P&L */}
            {reportType === 'pl' && (() => {
              const d = data as { income: { items: { source: string; total: number }[]; total: number }; expenses: { items: { category: string; total: number }[]; total: number }; netProfit: number };
              return (
                <>
                  <div className="text-center">
                    <h2 className="text-xl font-bold text-[var(--color-text)]">Profit &amp; Loss Statement</h2>
                    <p className="text-sm text-[var(--color-text-muted)] mt-1">Period: {startDate} to {endDate}</p>
                  </div>
                  <div>
                    <h3 className="section-title mb-3 pb-2 border-b border-[var(--color-border)]">Income</h3>
                    <table className="table-base">
                      <tbody>
                        {d.income.items.map((item, i) => (
                          <tr key={i}><td className="capitalize">{item.source}</td><td className="text-right font-data">{fmt(item.total)}</td></tr>
                        ))}
                        <tr className="font-bold">
                          <td>Total Income</td>
                          <td className="text-right text-emerald-600 font-data">{fmt(d.income.total)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div>
                    <h3 className="section-title mb-3 pb-2 border-b border-[var(--color-border)]">Expenses</h3>
                    <table className="table-base">
                      <tbody>
                        {d.expenses.items.map((item, i) => (
                          <tr key={i}><td className="capitalize">{item.category}</td><td className="text-right font-data">{fmt(item.total)}</td></tr>
                        ))}
                        <tr className="font-bold">
                          <td>Total Expenses</td>
                          <td className="text-right text-red-600 font-data">{fmt(d.expenses.total)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="border-t-2 border-[var(--color-border)] pt-4">
                    <div className="flex justify-between items-center text-lg font-bold">
                      <span>Net Profit</span>
                      <span className={`font-data ${d.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(d.netProfit)}</span>
                    </div>
                  </div>
                </>
              );
            })()}

            {/* Income by Source */}
            {reportType === 'income' && (() => {
              const d = data as { breakdown: { source: string; amount: number; percentage: string }[]; total: number };
              return (
                <>
                  <div className="text-center">
                    <h2 className="text-xl font-bold text-[var(--color-text)]">Income by Source</h2>
                    <p className="text-sm text-[var(--color-text-muted)] mt-1">Period: {startDate} to {endDate}</p>
                  </div>
                  <table className="table-base">
                    <thead><tr><th>Source</th><th className="text-right">Amount</th><th className="text-right">%</th></tr></thead>
                    <tbody>
                      {d.breakdown.map((item, i) => (
                        <tr key={i}>
                          <td className="capitalize">{item.source}</td>
                          <td className="text-right font-data">{fmt(item.amount)}</td>
                          <td className="text-right font-data">{item.percentage}%</td>
                        </tr>
                      ))}
                      <tr className="font-bold">
                        <td>Total</td>
                        <td className="text-right text-emerald-600 font-data">{fmt(d.total)}</td>
                        <td className="text-right font-data">100%</td>
                      </tr>
                    </tbody>
                  </table>
                </>
              );
            })()}

            {/* Expense by Category */}
            {reportType === 'expense' && (() => {
              const d = data as { breakdown: { category: string; amount: number; percentage: string }[]; total: number };
              return (
                <>
                  <div className="text-center">
                    <h2 className="text-xl font-bold text-[var(--color-text)]">Expense by Category</h2>
                    <p className="text-sm text-[var(--color-text-muted)] mt-1">Period: {startDate} to {endDate}</p>
                  </div>
                  <table className="table-base">
                    <thead><tr><th>Category</th><th className="text-right">Amount</th><th className="text-right">%</th></tr></thead>
                    <tbody>
                      {d.breakdown.map((item, i) => (
                        <tr key={i}>
                          <td>{item.category}</td>
                          <td className="text-right font-data">{fmt(item.amount)}</td>
                          <td className="text-right font-data">{item.percentage}%</td>
                        </tr>
                      ))}
                      <tr className="font-bold">
                        <td>Total</td>
                        <td className="text-right text-red-600 font-data">{fmt(d.total)}</td>
                        <td className="text-right font-data">100%</td>
                      </tr>
                    </tbody>
                  </table>
                </>
              );
            })()}

            {/* Monthly Summary */}
            {reportType === 'monthly' && (() => {
              const d = data as { year: number; monthly: { month: string; income: number; expense: number; profit: number }[]; summary: { totalIncome: number; totalExpense: number; netProfit: number } };
              return (
                <>
                  <div className="text-center">
                    <h2 className="text-xl font-bold text-[var(--color-text)]">Monthly Summary — {d.year}</h2>
                  </div>
                  <table className="table-base">
                    <thead><tr><th>Month</th><th className="text-right">Income</th><th className="text-right">Expense</th><th className="text-right">Profit</th></tr></thead>
                    <tbody>
                      {d.monthly.map((item, i) => (
                        <tr key={i}>
                          <td className="capitalize">{item.month}</td>
                          <td className="text-right text-emerald-600 font-data">{fmt(item.income)}</td>
                          <td className="text-right text-red-600 font-data">{fmt(item.expense)}</td>
                          <td className={`text-right font-data font-medium ${item.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(item.profit)}</td>
                        </tr>
                      ))}
                      <tr className="font-bold">
                        <td>Total</td>
                        <td className="text-right text-emerald-600 font-data">{fmt(d.summary.totalIncome)}</td>
                        <td className="text-right text-red-600 font-data">{fmt(d.summary.totalExpense)}</td>
                        <td className={`text-right font-data ${d.summary.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(d.summary.netProfit)}</td>
                      </tr>
                    </tbody>
                  </table>
                </>
              );
            })()}

            <p className="text-center text-xs text-[var(--color-text-muted)]">Generated: {new Date().toLocaleString()}</p>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}
