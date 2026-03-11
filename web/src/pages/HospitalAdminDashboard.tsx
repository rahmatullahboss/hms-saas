import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { 
  Users, FlaskConical, Receipt, UserCog, 
  TrendingUp, Activity, Clock, AlertCircle 
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import DashboardLayout from '../components/DashboardLayout';
import KPICard from '../components/dashboard/KPICard';
import axios from 'axios';

interface DashboardStats {
  totalPatients: number;
  todayPatients: number;
  pendingTests: number;
  completedTests: number;
  pendingBills: number;
  totalRevenue: number;
  staffCount: number;
  lowStockItems: number;
}

interface RecentPatient {
  id: number;
  name: string;
  mobile: string;
  created_at: string;
}

interface RevenueData {
  day: string;
  revenue: number;
}

export default function HospitalAdminDashboard({ role = 'hospital_admin' }: { role?: string }) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentPatients, setRecentPatients] = useState<RecentPatient[]>([]);
  const [revenueData, setRevenueData] = useState<RevenueData[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const { data } = await axios.get('/api/dashboard/stats', { headers });

      setStats(data.stats);
      setRecentPatients(data.recentPatients || []);
      setRevenueData(data.revenueData || []);

    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      // Use mock data on error
      setStats({
        totalPatients: 156,
        todayPatients: 12,
        pendingTests: 8,
        completedTests: 45,
        pendingBills: 15,
        totalRevenue: 250000,
        staffCount: 24,
        lowStockItems: 3,
      });
      setRevenueData([
        { day: 'Mon', revenue: 15000 },
        { day: 'Tue', revenue: 22000 },
        { day: 'Wed', revenue: 18000 },
        { day: 'Thu', revenue: 25000 },
        { day: 'Fri', revenue: 30000 },
        { day: 'Sat', revenue: 28000 },
        { day: 'Sun', revenue: 12000 },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const quickActions = [
    { label: 'New Patient', icon: <Users className="w-5 h-5" />, path: '/hospital_admin/patients/new', color: 'bg-teal-500' },
    { label: 'New Bill', icon: <Receipt className="w-5 h-5" />, path: '/hospital_admin/billing', color: 'bg-blue-500' },
    { label: 'Add Staff', icon: <UserCog className="w-5 h-5" />, path: '/hospital_admin/staff', color: 'bg-purple-500' },
    { label: 'Lab Test', icon: <FlaskConical className="w-5 h-5" />, path: '/hospital_admin/tests', color: 'bg-orange-500' },
  ];

  return (
    <DashboardLayout role={role}>
      <div className="space-y-6">
        {/* Welcome */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Dashboard</h1>
            <p className="text-[var(--color-text-muted)]">Welcome back! Here's your hospital overview.</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <Clock className="w-4 h-4" />
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            title="Total Patients"
            value={stats?.totalPatients || 0}
            icon={<Users className="w-6 h-6" />}
            trend={{ value: 12, isPositive: true }}
            loading={loading}
          />
          <KPICard
            title="Today's Patients"
            value={stats?.todayPatients || 0}
            icon={<Activity className="w-6 h-6" />}
            loading={loading}
          />
          <KPICard
            title="Pending Bills"
            value={stats?.pendingBills || 0}
            icon={<Receipt className="w-6 h-6" />}
            loading={loading}
          />
          <KPICard
            title="Staff Count"
            value={stats?.staffCount || 0}
            icon={<UserCog className="w-6 h-6" />}
            loading={loading}
          />
        </div>

        {/* Second Row - Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            title="Pending Tests"
            value={stats?.pendingTests || 0}
            icon={<FlaskConical className="w-6 h-6" />}
            loading={loading}
          />
          <KPICard
            title="Completed Tests"
            value={stats?.completedTests || 0}
            icon={<FlaskConical className="w-6 h-6" />}
            loading={loading}
          />
          <KPICard
            title="Total Revenue"
            value={`৳${(stats?.totalRevenue || 0).toLocaleString()}`}
            icon={<TrendingUp className="w-6 h-6" />}
            trend={{ value: 8, isPositive: true }}
            loading={loading}
          />
          <KPICard
            title="Low Stock Items"
            value={stats?.lowStockItems || 0}
            icon={<AlertCircle className="w-6 h-6" />}
            loading={loading}
          />
        </div>

        {/* Quick Actions */}
        <div className="card p-4">
          <h3 className="text-lg font-semibold mb-4 text-[var(--color-text-primary)]">Quick Actions</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {quickActions.map((action) => (
              <button
                key={action.label}
                onClick={() => navigate(action.path)}
                className="flex flex-col items-center gap-2 p-4 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-light)] transition-all group"
              >
                <div className={`p-3 rounded-full ${action.color} text-white group-hover:scale-110 transition-transform`}>
                  {action.icon}
                </div>
                <span className="text-sm font-medium text-[var(--color-text-primary)]">{action.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Revenue Chart */}
          <div className="card p-6 min-h-[350px]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">Revenue Overview</h3>
              <span className="text-sm text-[var(--color-text-muted)]">Last 7 days</span>
            </div>
            <div className="h-64 min-h-[256px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="day" stroke="var(--color-text-muted)" fontSize={12} />
                  <YAxis stroke="var(--color-text-muted)" fontSize={12} tickFormatter={(value) => `৳${value/1000}k`} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'var(--color-bg-card)', 
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px'
                    }}
                    formatter={(value) => [`৳${Number(value || 0).toLocaleString()}`, 'Revenue']}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="var(--color-primary)" 
                    strokeWidth={3}
                    dot={{ fill: 'var(--color-primary)', strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tests Chart */}
          <div className="card p-6 min-h-[350px]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">Lab Tests</h3>
              <span className="text-sm text-[var(--color-text-muted)]">This week</span>
            </div>
            <div className="h-64 min-h-[256px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[
                  { name: 'Pending', value: stats?.pendingTests || 0, color: '#f59e0b' },
                  { name: 'Completed', value: stats?.completedTests || 0, color: '#10b981' },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="name" stroke="var(--color-text-muted)" fontSize={12} />
                  <YAxis stroke="var(--color-text-muted)" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'var(--color-bg-card)', 
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {[
                      { name: 'Pending', value: stats?.pendingTests || 0, color: '#f59e0b' },
                      { name: 'Completed', value: stats?.completedTests || 0, color: '#10b981' },
                    ].map((entry, index) => (
                      <rect key={`bar-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Recent Patients */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">Recent Patients</h3>
            <button 
              onClick={() => navigate('/hospital_admin/patients')}
              className="text-sm text-[var(--color-primary)] hover:underline"
            >
              View All
            </button>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Mobile</th>
                <th>Registered</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    <td colSpan={5} className="p-4">
                      <div className="h-4 bg-[var(--color-border)] rounded animate-pulse"></div>
                    </td>
                  </tr>
                ))
              ) : recentPatients.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-[var(--color-text-muted)]">
                    No patients found
                  </td>
                </tr>
              ) : (
                recentPatients.map((patient) => (
                  <tr key={patient.id}>
                    <td>#{patient.id}</td>
                    <td className="font-medium">{patient.name}</td>
                    <td>{patient.mobile}</td>
                    <td>{new Date(patient.created_at).toLocaleDateString()}</td>
                    <td>
                      <button 
                        onClick={() => navigate(`/hospital_admin/patients/${patient.id}`)}
                        className="text-[var(--color-primary)] hover:underline"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}
