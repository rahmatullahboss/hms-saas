import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Users, Search, Plus, Eye, Pencil, Download, Filter, RefreshCw } from 'lucide-react';
import axios from 'axios';
import DashboardLayout from '../components/DashboardLayout';
import { useTranslation } from 'react-i18next';

interface Patient {
  id: number;
  name: string;
  father_husband: string;
  address: string;
  mobile: string;
  guardian_mobile: string;
  age?: number;
  gender?: string;
  created_at: string;
}

export default function PatientList({ role = 'hospital_admin' }: { role?: string }) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const perPage = 20;
  const navigate = useNavigate();
  const { t } = useTranslation(['patients', 'common']);

  const { slug = '' } = useParams<{ slug: string }>();
  const basePath = `/h/${slug}`;
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const today = new Date().toDateString();

  const fetchPatients = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('hms_token');
      const { data } = await axios.get('/api/patients', {
        params: { search, page, perPage },
        headers: { Authorization: `Bearer ${token}` },
      });
      setPatients(data.patients || []);
      setTotal(data.total ?? data.patients?.length ?? 0);
    } catch {
      // fallback mock
      setPatients([
        { id: 1, name: 'Mohammad Karim',  father_husband: 'Abdul Karim',  address: 'Dhaka', mobile: '01711-234567', guardian_mobile: '', created_at: new Date().toISOString(), gender: 'Male',   age: 45 },
        { id: 2, name: 'Fatema Begum',    father_husband: 'Rahim Mia',    address: 'Chittagong', mobile: '01812-345678', guardian_mobile: '', created_at: new Date().toISOString(), gender: 'Female', age: 32 },
        { id: 3, name: 'Rahim Uddin',     father_husband: 'Karim Uddin',  address: 'Sylhet', mobile: '01911-456789', guardian_mobile: '', created_at: new Date().toISOString(), gender: 'Male',   age: 58 },
        { id: 4, name: 'Nasrin Akter',    father_husband: 'Jabbar Mia',   address: 'Rajshahi', mobile: '01611-567890', guardian_mobile: '', created_at: new Date().toISOString(), gender: 'Female', age: 28 },
        { id: 5, name: 'Kabir Hossain',   father_husband: 'Mofiz Hossain',address: 'Khulna', mobile: '01511-678901', guardian_mobile: '', created_at: new Date().toISOString(), gender: 'Male',   age: 63 },
      ]);
      setTotal(5);
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => { fetchPatients(); }, [fetchPatients]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <DashboardLayout role={role}>
      <div className="space-y-5 max-w-screen-2xl mx-auto">

        {/* ── Page Header ── */}
        <div className="page-header">
          <div>
            <h1 className="page-title">{t('title')}</h1>
            <nav className="text-sm text-[var(--color-text-muted)] mt-1">
              <span>{t('dashboard', { ns: 'dashboard', defaultValue: 'Dashboard' })}</span> <span className="mx-1.5">›</span> <span className="text-[var(--color-text-secondary)]">{t('title')}</span>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchPatients} className="btn-ghost" title="Refresh"><RefreshCw className="w-4 h-4" /></button>
            <button className="btn-secondary"><Download className="w-4 h-4" /> {t('export', { ns: 'common', defaultValue: 'Export' })}</button>
            <button onClick={() => navigate(`${basePath}/patients/new`)} className="btn-primary">
              <Plus className="w-4 h-4" /> {t('newPatient')}
            </button>
          </div>
        </div>

        {/* ── Summary chips ── */}
        <div className="flex flex-wrap gap-2">
          <span className="badge badge-primary">{t('total', { ns: 'common' })}: {total.toLocaleString()}</span>
          <span className="badge badge-info">{t('today', { ns: 'common', defaultValue: 'Today' })}: {loading ? '…' : patients.filter(p => new Date(p.created_at).toDateString() === today).length}</span>
        </div>

        {/* ── Search & Filter ── */}
        <div className="card p-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
            <input
              type="text"
              placeholder={t('search', { ns: 'common' })}
              value={search}
              onChange={(e) => {
                const v = e.target.value;
                setSearch(v);
                setPage(1);
                clearTimeout(searchTimer.current);
                searchTimer.current = setTimeout(() => fetchPatients(), 350);
              }}
              className="input pl-9"
            />
          </div>
          <button className="btn-secondary"><Filter className="w-4 h-4" /> {t('filter', { ns: 'common', defaultValue: 'Filter' })}</button>
        </div>

        {/* ── Table ── */}
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('patientId')}</th>
                  <th>{t('name', { ns: 'common' })}</th>
                  <th>{t('age')} / {t('gender')}</th>
                  <th>{t('phone', { ns: 'common' })}</th>
                  <th>{t('date', { ns: 'common' })}</th>
                  <th>{t('actions', { ns: 'common' })}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(6)].map((_, i) => (
                    <tr key={i}>
                      {[...Array(7)].map((_, j) => (
                        <td key={j}><div className="skeleton h-4 w-full rounded" /></td>
                      ))}
                    </tr>
                  ))
                ) : patients.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center">
                      <div className="flex flex-col items-center gap-3 text-[var(--color-text-muted)]">
                        <Users className="w-10 h-10 opacity-30" />
                        <p className="font-medium">{t('noPatients', { defaultValue: 'No patients found' })}</p>
                        <button onClick={() => navigate(`${basePath}/patients/new`)} className="btn-primary">
                          <Plus className="w-4 h-4" /> {t('addFirst', { defaultValue: 'Add First Patient' })}
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  patients.map((p, idx) => (
                    <tr key={p.id}>
                      <td className="text-[var(--color-text-muted)]">{(page - 1) * perPage + idx + 1}</td>
                      <td className="font-data font-medium text-[var(--color-primary-dark)]">P-{String(p.id).padStart(4, '0')}</td>
                      <td className="font-medium">{p.name}</td>
                      <td className="text-[var(--color-text-secondary)]">
                        {p.age ? `${p.age}` : '—'}{p.gender ? ` / ${p.gender[0]}` : ''}
                      </td>
                      <td className="font-data text-sm">{p.mobile}</td>
                      <td className="text-sm text-[var(--color-text-muted)]">
                        {new Date(p.created_at).toLocaleDateString('en-GB')}
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => navigate(`${basePath}/patients/${p.id}`)}
                            className="btn-ghost p-1.5" title="View"
                          ><Eye className="w-4 h-4" /></button>
                          <button
                            onClick={() => navigate(`${basePath}/patients/${p.id}/edit`)}
                            className="btn-ghost p-1.5" title="Edit"
                          ><Pencil className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!loading && patients.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--color-border)]">
              <span className="text-sm text-[var(--color-text-muted)]">
                {t('showing', { defaultValue: 'Showing' })} {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} {t('of', { defaultValue: 'of' })} {total.toLocaleString()} {t('patientsList', { defaultValue: 'patients' })}
              </span>
              <div className="flex items-center gap-1">
                <button
                  disabled={page === 1}
                  onClick={() => setPage(p => p - 1)}
                  className="btn-ghost text-sm disabled:opacity-40"
                >← {t('prev', { ns: 'common', defaultValue: 'Prev' })}</button>
                {[...Array(Math.min(5, totalPages))].map((_, i) => {
                  const pg = i + 1;
                  return (
                    <button key={pg} onClick={() => setPage(pg)}
                      className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                        pg === page ? 'bg-[var(--color-primary)] text-white' : 'hover:bg-[var(--color-border-light)] text-[var(--color-text-secondary)]'
                      }`}>
                      {pg}
                    </button>
                  );
                })}
                <button
                  disabled={page === totalPages}
                  onClick={() => setPage(p => p + 1)}
                  className="btn-ghost text-sm disabled:opacity-40"
                >{t('next', { ns: 'common', defaultValue: 'Next' })} →</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}