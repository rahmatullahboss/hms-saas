import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Users } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import DashboardLayout from '../components/DashboardLayout';
import KPICard from '../components/dashboard/KPICard';
import { authHeader } from '../utils/auth';
import { useTranslation } from 'react-i18next';

interface DailyData  { date: string; total: number; bySource?: { source: string; total: number }[] }
interface MonthlyData { month: string; income: number; expenses: number; profit: number; margin: string }
interface Staff       { id: number; name: string; position: string; salary: number; status: string }

const fmt = (n: number) =>
  new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT', minimumFractionDigits: 0 }).format(n);

export default function MDDashboard({ role = 'md' }: { role?: string }) {
  const { t } = useTranslation(['dashboard', 'common']);
  const [dailyIncome,   setDailyIncome]   = useState<DailyData>({ date: '', total: 0 });
  const [dailyExpenses, setDailyExpenses] = useState<DailyData>({ date: '', total: 0 });
  const [monthly,       setMonthly]       = useState<MonthlyData | null>(null);
  const [staff,         setStaff]         = useState<Staff[]>([]);
  const [loading,       setLoading]       = useState(true);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const headers = authHeader();
      const [iRes, eRes, mRes, sRes] = await Promise.all([
        axios.get('/api/dashboard/daily-income',    { headers }),
        axios.get('/api/dashboard/daily-expenses',  { headers }),
        axios.get('/api/dashboard/monthly-summary', { headers }),
        axios.get('/api/staff',                     { headers }),
      ]);
      setDailyIncome(iRes.data);
      setDailyExpenses(eRes.data);
      setMonthly(mRes.data);
      setStaff(sRes.data.staff || []);
    } catch { toast.error('Failed to fetch data'); }
    finally { setLoading(false); }
  };

  const todayProfit = dailyIncome.total - dailyExpenses.total;

  return (
    <DashboardLayout role={role}>
      <div className="space-y-5 max-w-screen-2xl mx-auto">

        {/* ── Today KPIs ── */}
        <div>
          <h1 className="page-title mb-4">{t('managingDirectorDashboard', { defaultValue: 'Managing Director Dashboard' })}</h1>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard title={t('todaysIncome',   { defaultValue: "Today's Income" })}   value={fmt(dailyIncome.total)}   loading={loading} icon={<TrendingUp className="w-5 h-5" />}   iconBg="bg-emerald-50 text-emerald-600" index={0} />
            <KPICard title={t('todaysExpenses', { defaultValue: "Today's Expenses" })} value={fmt(dailyExpenses.total)} loading={loading} icon={<TrendingDown className="w-5 h-5" />} iconBg="bg-red-50 text-red-600"         index={1} />
            <KPICard title={t('todaysProfit',   { defaultValue: "Today's Profit" })}   value={fmt(todayProfit)}         loading={loading} icon={<DollarSign className="w-5 h-5" />}  iconBg="bg-[var(--color-primary-light)] text-[var(--color-primary)]" index={2} />
            <KPICard title={t('totalStaff',     { ns: 'staff', defaultValue: 'Total Staff' })} value={staff.length} loading={loading} icon={<Users className="w-5 h-5" />} iconBg="bg-blue-50 text-blue-600" index={3} />
          </div>
        </div>

        {/* ── Monthly Summary ── */}
        {monthly && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: t('monthlyIncome',   { ns: 'common', defaultValue: 'Monthly Income' }),   value: fmt(monthly.income),   color: 'text-emerald-600' },
              { label: t('monthlyExpenses', { ns: 'common', defaultValue: 'Monthly Expenses' }), value: fmt(monthly.expenses), color: 'text-red-600' },
              { label: t('monthlyProfit',   { ns: 'common', defaultValue: 'Monthly Profit' }),   value: `${fmt(monthly.profit)} (${monthly.margin}%)`, color: monthly.profit >= 0 ? 'text-[var(--color-primary)]' : 'text-red-600' },
            ].map(({ label, value, color }) => (
              <div key={label} className="card p-5">
                <p className="text-xs text-[var(--color-text-muted)] mb-1">{label}</p>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Income + Expense Sources ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="card p-5">
            <h3 className="section-title mb-4">{t('incomeSourcesToday', { defaultValue: 'Income Sources Today' })}</h3>
            {dailyIncome.bySource?.length ? (
              <div className="space-y-2">
                {dailyIncome.bySource.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="capitalize text-[var(--color-text-secondary)]">{item.source}</span>
                    <span className="font-medium text-emerald-600">{fmt(item.total || 0)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--color-text-muted)]">{t('noData', { ns: 'common', defaultValue: 'No data' })}</p>
            )}
          </div>

          <div className="card p-5">
            <h3 className="section-title mb-4">{t('expensesToday', { defaultValue: 'Expenses Today' })}</h3>
            {dailyExpenses.bySource?.length ? (
              <div className="space-y-2">
                {dailyExpenses.bySource.map((item: { category?: string; total?: number }, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="capitalize text-[var(--color-text-secondary)]">{item.category}</span>
                    <span className="font-medium text-red-600">{fmt(item.total || 0)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--color-text-muted)]">{t('noData', { ns: 'common', defaultValue: 'No data' })}</p>
            )}
          </div>
        </div>

        {/* ── Staff Overview ── */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--color-border)]">
            <h3 className="section-title">{t('staffOverview', { defaultValue: 'Staff Overview' })}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>{t('name', { ns: 'common' })}</th><th>{t('position', { defaultValue: 'Position' })}</th><th>{t('salary', { defaultValue: 'Salary' })}</th><th>{t('status', { ns: 'common' })}</th></tr></thead>
              <tbody>
                {loading ? (
                  [...Array(4)].map((_, i) => <tr key={i}>{[...Array(4)].map((_, j) => <td key={j}><div className="skeleton h-4 rounded" /></td>)}</tr>)
                ) : staff.length === 0 ? (
                  <tr><td colSpan={4} className="py-12 text-center text-[var(--color-text-muted)]">{t('noStaff', { ns: 'staff', defaultValue: 'No staff found' })}</td></tr>
                ) : (
                  staff.slice(0, 5).map(m => (
                    <tr key={m.id}>
                      <td className="font-medium">{m.name}</td>
                      <td className="text-sm text-[var(--color-text-secondary)]">{m.position}</td>
                      <td className="font-data text-sm">{fmt(m.salary)}</td>
                      <td><span className={`badge ${m.status === 'active' ? 'badge-success' : 'badge-secondary'}`}>{m.status}</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}