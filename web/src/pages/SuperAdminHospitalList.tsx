import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  Building2, Search, Eye, Edit2, Power,
  Plus, ChevronLeft, X,
} from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { saveToken } from '../hooks/useAuth';

interface Hospital {
  id: number;
  name: string;
  subdomain: string;
  status: string;
  plan: string;
  created_at: string;
  user_count: number;
  patient_count: number;
}

export default function SuperAdminHospitalList() {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    fetchHospitals();
    if (searchParams.get('action') === 'create') setShowCreate(true);
  }, []);

  const fetchHospitals = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('hms_token');
      const { data } = await axios.get('/api/admin/hospitals', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setHospitals(data.hospitals);
    } catch {
      toast.error('Failed to load hospitals');
    } finally {
      setLoading(false);
    }
  };

  const handleImpersonate = async (id: number) => {
    try {
      const token = localStorage.getItem('hms_token');
      const { data } = await axios.post(`/api/admin/impersonate/${id}`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Store super admin token for later
      const currentToken = localStorage.getItem('hms_token');
      if (currentToken) {
        localStorage.setItem('hms_super_token', currentToken);
      }

      // Set impersonation token and redirect
      saveToken(data.token);
      localStorage.setItem('hms_impersonating', JSON.stringify({
        tenantName: data.tenant.name,
        tenantId: data.tenant.id,
      }));

      window.open(data.redirectUrl, '_blank');
    } catch {
      toast.error('Failed to impersonate');
    }
  };

  const handleToggleStatus = async (hospital: Hospital) => {
    const newStatus = hospital.status === 'active' ? 'inactive' : 'active';
    try {
      const token = localStorage.getItem('hms_token');
      await axios.put(`/api/admin/hospitals/${hospital.id}`, {
        name: hospital.name,
        status: newStatus,
        plan: hospital.plan,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success(`Hospital ${newStatus === 'active' ? 'activated' : 'deactivated'}`);
      fetchHospitals();
    } catch {
      toast.error('Failed to update hospital');
    }
  };

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCreating(true);
    const formData = new FormData(e.currentTarget);
    try {
      const token = localStorage.getItem('hms_token');
      await axios.post('/api/admin/hospitals', {
        name: formData.get('name'),
        subdomain: formData.get('subdomain'),
        adminEmail: formData.get('adminEmail'),
        adminName: formData.get('adminName'),
        adminPassword: formData.get('adminPassword'),
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Hospital created!');
      setShowCreate(false);
      fetchHospitals();
    } catch (err: unknown) {
      const errMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to create';
      toast.error(errMsg);
    } finally {
      setCreating(false);
    }
  };

  const filtered = hospitals.filter((h) => {
    const matchesSearch = h.name.toLowerCase().includes(search.toLowerCase()) ||
      h.subdomain.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === 'all' || h.status === filter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/super-admin/dashboard')} className="btn-ghost p-2">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Hospitals</h1>
              <p className="text-sm text-[var(--color-text-muted)]">{hospitals.length} total hospitals</p>
            </div>
          </div>
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> Add Hospital
          </button>
        </div>

        {/* Filters */}
        <div className="card p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
              <input
                type="text"
                placeholder="Search hospitals..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-field pl-9 w-full"
              />
            </div>
            <div className="flex gap-1 bg-[var(--color-bg-secondary)] rounded-lg p-1">
              {['all', 'active', 'inactive', 'suspended'].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                    filter === f
                      ? 'bg-[var(--color-bg-card)] text-[var(--color-text-primary)] shadow-sm'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Hospital</th>
                  <th>Slug</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Users</th>
                  <th>Patients</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i}>
                      {[...Array(8)].map((_, j) => (
                        <td key={j}><div className="skeleton h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-[var(--color-text-muted)]">
                      No hospitals found
                    </td>
                  </tr>
                ) : (
                  filtered.map((h) => (
                    <tr key={h.id}>
                      <td className="font-medium">{h.name}</td>
                      <td className="font-data text-sm text-[var(--color-text-secondary)]">{h.subdomain}</td>
                      <td>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          h.plan === 'enterprise' ? 'bg-purple-100 text-purple-700' :
                          h.plan === 'professional' ? 'bg-blue-100 text-blue-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {h.plan}
                        </span>
                      </td>
                      <td>
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                          h.status === 'active' ? 'text-emerald-600' :
                          h.status === 'suspended' ? 'text-red-500' :
                          'text-slate-400'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            h.status === 'active' ? 'bg-emerald-500' :
                            h.status === 'suspended' ? 'bg-red-500' :
                            'bg-slate-400'
                          }`} />
                          {h.status}
                        </span>
                      </td>
                      <td className="font-data text-sm">{h.user_count}</td>
                      <td className="font-data text-sm">{h.patient_count}</td>
                      <td className="text-sm text-[var(--color-text-muted)]">
                        {new Date(h.created_at).toLocaleDateString('en-GB')}
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => navigate(`/super-admin/hospitals/${h.id}`)}
                            className="btn-ghost p-1.5" title="View Details"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleImpersonate(h.id)}
                            className="btn-ghost p-1.5 text-indigo-600" title="Impersonate"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleToggleStatus(h)}
                            className={`btn-ghost p-1.5 ${h.status === 'active' ? 'text-amber-600' : 'text-emerald-600'}`}
                            title={h.status === 'active' ? 'Deactivate' : 'Activate'}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Create Modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="card max-w-md w-full mx-4 p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Create Hospital</h2>
                <button onClick={() => setShowCreate(false)} className="btn-ghost p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Hospital Name</label>
                  <input name="name" required className="input-field w-full" placeholder="e.g. City General Hospital" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Subdomain (Slug)</label>
                  <input name="subdomain" required className="input-field w-full" placeholder="e.g. city-general" pattern="^[a-z0-9][a-z0-9-]*[a-z0-9]$" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Admin Name</label>
                  <input name="adminName" required className="input-field w-full" placeholder="Admin full name" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Admin Email</label>
                  <input name="adminEmail" type="email" required className="input-field w-full" placeholder="admin@hospital.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Admin Password</label>
                  <input name="adminPassword" type="password" required minLength={8} className="input-field w-full" placeholder="Min 8 characters" />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowCreate(false)} className="btn-ghost flex-1">Cancel</button>
                  <button type="submit" disabled={creating} className="btn-primary flex-1">
                    {creating ? 'Creating...' : 'Create Hospital'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
    </div>
  );
}
