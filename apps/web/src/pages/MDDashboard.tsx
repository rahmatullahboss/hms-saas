import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import DashboardLayout from '../components/DashboardLayout';

interface DailyData {
  date: string;
  total: number;
  bySource?: { source: string; total: number }[];
}

interface MonthlyData {
  month: string;
  income: number;
  expenses: number;
  profit: number;
  margin: string;
}

interface Staff {
  id: number;
  name: string;
  position: string;
  salary: number;
  status: string;
}

export default function MDDashboard({ role = 'md' }: { role?: string }) {
  const [dailyIncome, setDailyIncome] = useState<DailyData>({ date: '', total: 0 });
  const [dailyExpenses, setDailyExpenses] = useState<DailyData>({ date: '', total: 0 });
  const [monthly, setMonthly] = useState<MonthlyData | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      const [incomeRes, expensesRes, monthlyRes, staffRes] = await Promise.all([
        axios.get('/api/dashboard/daily-income', { headers }),
        axios.get('/api/dashboard/daily-expenses', { headers }),
        axios.get('/api/dashboard/monthly-summary', { headers }),
        axios.get('/api/staff', { headers }),
      ]);
      
      setDailyIncome(incomeRes.data);
      setDailyExpenses(expensesRes.data);
      setMonthly(monthlyRes.data);
      setStaff(staffRes.data.staff || []);
    } catch (error) {
      toast.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout role={role}>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Managing Director Dashboard</h1>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">Today's Income</div>
            <div className="text-2xl font-bold text-green-600">{dailyIncome.total.toFixed(0)} Taka</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">Today's Expenses</div>
            <div className="text-2xl font-bold text-red-600">{dailyExpenses.total.toFixed(0)} Taka</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">Today's Profit</div>
            <div className="text-2xl font-bold text-primary-600">
              {(dailyIncome.total - dailyExpenses.total).toFixed(0)} Taka
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">Total Staff</div>
            <div className="text-2xl font-bold text-gray-600">{staff.length}</div>
          </div>
        </div>

        {monthly && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm text-gray-500">Monthly Income</div>
              <div className="text-2xl font-bold text-green-600">{monthly.income.toFixed(0)} Taka</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm text-gray-500">Monthly Expenses</div>
              <div className="text-2xl font-bold text-red-600">{monthly.expenses.toFixed(0)} Taka</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm text-gray-500">Monthly Profit</div>
              <div className={`text-2xl font-bold ${monthly.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {monthly.profit.toFixed(0)} Taka
                <span className="text-sm text-gray-500 ml-2">({monthly.margin}%)</span>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b">
              <h2 className="font-semibold">Income Sources Today</h2>
            </div>
            <div className="p-4">
              {dailyIncome.bySource?.length ? (
                <div className="space-y-2">
                  {dailyIncome.bySource.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between">
                      <span className="capitalize">{item.source}</span>
                      <span className="font-medium">{item.total?.toFixed(0) || 0} Taka</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">No income today</p>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b">
              <h2 className="font-semibold">Expenses Today</h2>
            </div>
            <div className="p-4">
              {dailyExpenses.bySource?.length ? (
                <div className="space-y-2">
                  {dailyExpenses.bySource.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between">
                      <span className="capitalize">{item.category}</span>
                      <span className="font-medium">{item.total?.toFixed(0) || 0} Taka</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">No expenses today</p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b flex justify-between items-center">
            <h2 className="font-semibold">Staff Overview</h2>
          </div>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Position</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Salary</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {staff.length === 0 ? (
                <tr><td colSpan={4} className="px-6 py-4 text-center">No staff found</td></tr>
              ) : (
                staff.slice(0, 5).map((member) => (
                  <tr key={member.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm">{member.name}</td>
                    <td className="px-6 py-4 text-sm">{member.position}</td>
                    <td className="px-6 py-4 text-sm">{member.salary.toFixed(0)} Taka</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        member.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {member.status}
                      </span>
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