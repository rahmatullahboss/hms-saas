import { useState, useEffect } from 'react';
import { Users, DollarSign, UserCheck, Search } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import DashboardLayout from '../components/DashboardLayout';
import { useTranslation } from 'react-i18next';

interface Staff {
  id: number;
  name: string;
  address: string;
  position: string;
  salary: number;
  bank_account: string;
  mobile: string;
  joining_date: string;
  status: string;
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT', minimumFractionDigits: 0 }).format(n);

export default function StaffPage({ role = 'md' }: { role?: string }) {
  const [staff, setStaff]   = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { t } = useTranslation(['staff', 'common']);

  const fetchStaff = async () => {
    try {
      const token = localStorage.getItem('hms_token');
      const res = await axios.get('/api/staff', { headers: { Authorization: `Bearer ${token}` } });
      setStaff(res.data.staff || []);
    } catch { toast.error('Failed to fetch staff'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchStaff(); }, []);

  const filtered = staff.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.position.toLowerCase().includes(search.toLowerCase()) ||
    s.mobile.includes(search)
  );

  const totalSalary  = staff.reduce((sum, s) => sum + (s.salary || 0), 0);
  const activeCount  = staff.filter(s => s.status === 'active').length;

  return (
    <DashboardLayout role={role}>
      <div className="space-y-5 max-w-screen-2xl mx-auto">

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: t('totalStaff',   { defaultValue: 'Total Staff' }),   value: staff.length,          icon: Users,     color: 'text-[var(--color-primary)]' },
            { label: t('monthlySalary',{ defaultValue: 'Monthly Salary' }), value: fmt(totalSalary),      icon: DollarSign, color: 'text-amber-600' },
            { label: t('activeStaff',  { defaultValue: 'Active Staff' }),   value: activeCount,           icon: UserCheck, color: 'text-emerald-600' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="card p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-[var(--color-primary)]/10 flex items-center justify-center flex-shrink-0">
                <Icon className="w-5 h-5 text-[var(--color-primary)]" />
              </div>
              <div>
                <p className="text-xs text-[var(--color-text-muted)] mb-0.5">{label}</p>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Search ── */}
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
          <input
            type="text"
            placeholder={t('search', { ns: 'common' })}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input pl-9"
          />
        </div>

        {/* ── Table ── */}
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>{t('name',       { ns: 'common' })}</th>
                  <th>{t('position',   { defaultValue: 'Position' })}</th>
                  <th>{t('phone',      { ns: 'common' })}</th>
                  <th>{t('bankAccount',{ defaultValue: 'Bank Account' })}</th>
                  <th className="text-right">{t('salary', { defaultValue: 'Salary' })}</th>
                  <th>{t('joined',     { defaultValue: 'Joined' })}</th>
                  <th className="text-center">{t('status', { ns: 'common' })}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i}>{[...Array(7)].map((_, j) => <td key={j}><div className="skeleton h-4 rounded" /></td>)}</tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="py-14 text-center text-[var(--color-text-muted)]">No staff found</td></tr>
                ) : (
                  filtered.map(member => (
                    <tr key={member.id}>
                      <td className="font-medium">{member.name}</td>
                      <td className="text-sm text-[var(--color-text-secondary)]">{member.position}</td>
                      <td className="font-data text-sm">{member.mobile}</td>
                      <td className="font-data text-sm text-[var(--color-text-muted)]">{member.bank_account || '—'}</td>
                      <td className="text-right font-medium">{fmt(member.salary || 0)}</td>
                      <td className="font-data text-sm text-[var(--color-text-muted)]">
                        {member.joining_date ? new Date(member.joining_date).toLocaleDateString('en-GB') : '—'}
                      </td>
                      <td className="text-center">
                        <span className={`badge ${member.status === 'active' ? 'badge-success' : 'badge-secondary'}`}>
                          {member.status || 'active'}
                        </span>
                      </td>
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
