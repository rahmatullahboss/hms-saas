import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import DashboardLayout from '../../components/DashboardLayout';

interface DashboardData {
  today: { income: number; expense: number; profit: number };
  mtd: { income: number; expense: number; profit: number };
  lastUpdated: string;
}

interface IncomeBreakdown {
  source: string;
  amount: number;
  percentage: string;
}

interface ExpenseBreakdown {
  category: string;
  amount: number;
  percentage: string;
}

interface Trend {
  month: string;
  income: number;
  expense: number;
  profit: number;
}

const API_BASE = '/api/accounting';

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: 'BDT',
    minimumFractionDigits: 0,
  }).format(amount);
};

const sourceLabels: Record<string, string> = {
  pharmacy: 'Pharmacy',
  laboratory: 'Laboratory',
  doctor_visit: 'Doctor Visit',
  admission: 'Admission',
  operation: 'Operation',
  ambulance: 'Ambulance',
  other: 'Other',
};

const categoryLabels: Record<string, string> = {
  SALARY: 'Staff Salary',
  MEDICINE: 'Medicine Purchase',
  RENT: 'Rent',
  ELECTRICITY: 'Electricity',
  WATER: 'Water Supply',
  COMMUNICATION: 'Internet & Phone',
  MAINTENANCE: 'Maintenance',
  SUPPLIES: 'Medical Supplies',
  MARKETING: 'Marketing',
  BANK: 'Bank Charges',
  MISC: 'Miscellaneous',
};

export default function AccountingDashboard({ role = 'md' }: { role?: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [incomeBreakdown, setIncomeBreakdown] = useState<IncomeBreakdown[]>([]);
  const [expenseBreakdown, setExpenseBreakdown] = useState<ExpenseBreakdown[]>([]);
  const [trends, setTrends] = useState<Trend[]>([]);
  const [loading, setLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [incomeForm, setIncomeForm] = useState({ date: new Date().toISOString().split('T')[0], source: 'other', amount: '', description: '' });
  const [expenseForm, setExpenseForm] = useState({ date: new Date().toISOString().split('T')[0], category: 'MISC', amount: '', description: '' });

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem('hms_token');
      const headers = { Authorization: `Bearer ${token}` };
      const [summaryRes, incomeRes, expenseRes, trendsRes] = await Promise.all([
        axios.get(`${API_BASE}/summary`, { headers }),
        axios.get(`${API_BASE}/income-breakdown`, { headers }),
        axios.get(`${API_BASE}/expense-breakdown`, { headers }),
        axios.get(`${API_BASE}/trends`, { headers }),
      ]);

      setData(summaryRes.data);
      setIncomeBreakdown(incomeRes.data.breakdown || []);
      setExpenseBreakdown(expenseRes.data.breakdown || []);
      setTrends(trendsRes.data.trends || []);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    const token = localStorage.getItem('hms_token');
    if (!token) return; // Can't connect without auth

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/api/accounting/ws?token=${encodeURIComponent(token)}`;
    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout>;
    let reconnectDelay = 3000;
    let attempts = 0;
    const maxAttempts = 3; // Stop retrying after 3 failures — polling is the fallback
    let disposed = false;

    const connect = () => {
      if (disposed || attempts >= maxAttempts) {
        // Silently fall back to HTTP polling (already running via setInterval)
        return;
      }
      attempts++;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setWsConnected(true);
        reconnectDelay = 3000;
        attempts = 0; // reset on successful connect
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'income_update' || message.type === 'expense_update' || message.type === 'sync') {
            setData(prev => prev ? {
              ...prev,
              today: {
                income: message.data.todayIncome,
                expense: message.data.todayExpense,
                profit: message.data.todayIncome - message.data.todayExpense,
              },
              mtd: {
                income: message.data.mtdIncome,
                expense: message.data.mtdExpense,
                profit: message.data.mtdIncome - message.data.mtdExpense,
              },
              lastUpdated: message.data.lastUpdated,
            } : null);
          }
        } catch (e) {
          // silently ignore parse errors
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (!disposed && attempts < maxAttempts) {
          reconnectTimeout = setTimeout(connect, reconnectDelay);
          reconnectDelay = Math.min(reconnectDelay * 2, 30000);
        }
      };

      ws.onerror = () => {
        // Don't log — just close and let onclose handler retry
        ws?.close();
      };
    };

    connect();

    return () => {
      disposed = true;
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  const handleAddIncome = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('hms_token');
      const headers = { Authorization: `Bearer ${token}` };
      await axios.post('/api/income', incomeForm, { headers });
      setShowIncomeModal(false);
      setIncomeForm({ date: new Date().toISOString().split('T')[0], source: 'other', amount: '', description: '' });
      fetchData();
    } catch (error) {
      console.error('Error adding income:', error);
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('hms_token');
      const headers = { Authorization: `Bearer ${token}` };
      await axios.post('/api/expenses', expenseForm, { headers });
      setShowExpenseModal(false);
      setExpenseForm({ date: new Date().toISOString().split('T')[0], category: 'MISC', amount: '', description: '' });
      fetchData();
    } catch (error) {
      console.error('Error adding expense:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <DashboardLayout role={role}>
      <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Accounting Dashboard</h1>
          <p className="text-sm text-gray-500">
            Last updated: {data?.lastUpdated ? new Date(data.lastUpdated).toLocaleString() : 'N/A'}
            {wsConnected && <span className="ml-2 text-green-500">● Live</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowIncomeModal(true)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            + Add Income
          </button>
          <button
            onClick={() => setShowExpenseModal(true)}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            + Add Expense
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-green-500">
          <h3 className="text-gray-500 text-sm font-medium">Today's Income</h3>
          <p className="text-3xl font-bold text-green-600">{formatCurrency(data?.today.income || 0)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-red-500">
          <h3 className="text-gray-500 text-sm font-medium">Today's Expense</h3>
          <p className="text-3xl font-bold text-red-600">{formatCurrency(data?.today.expense || 0)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-blue-500">
          <h3 className="text-gray-500 text-sm font-medium">Today's Profit</h3>
          <p className={`text-3xl font-bold ${(data?.today.profit || 0) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
            {formatCurrency(data?.today.profit || 0)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-gray-500 text-sm font-medium mb-2">MTD Income</h3>
          <p className="text-2xl font-bold text-gray-800">{formatCurrency(data?.mtd.income || 0)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-gray-500 text-sm font-medium mb-2">MTD Expense</h3>
          <p className="text-2xl font-bold text-gray-800">{formatCurrency(data?.mtd.expense || 0)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-gray-500 text-sm font-medium mb-2">MTD Profit</h3>
          <p className={`text-2xl font-bold ${(data?.mtd.profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(data?.mtd.profit || 0)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Income by Source (MTD)</h3>
          {incomeBreakdown.length > 0 ? (
            <div className="space-y-3">
              {incomeBreakdown.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${
                      item.source === 'pharmacy' ? 'bg-blue-500' :
                      item.source === 'laboratory' ? 'bg-green-500' :
                      item.source === 'doctor_visit' ? 'bg-purple-500' :
                      item.source === 'admission' ? 'bg-yellow-500' :
                      item.source === 'operation' ? 'bg-pink-500' : 'bg-gray-500'
                    }`}></div>
                    <span className="text-gray-700">{sourceLabels[item.source] || item.source}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-medium">{formatCurrency(item.amount)}</span>
                    <span className="text-gray-400 text-sm ml-2">({item.percentage}%)</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-4">No income data</p>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Expense by Category (MTD)</h3>
          {expenseBreakdown.length > 0 ? (
            <div className="space-y-3">
              {expenseBreakdown.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${
                      item.category === 'SALARY' ? 'bg-red-500' :
                      item.category === 'MEDICINE' ? 'bg-orange-500' :
                      item.category === 'RENT' ? 'bg-purple-500' :
                      item.category === 'ELECTRICITY' ? 'bg-yellow-500' :
                      item.category === 'WATER' ? 'bg-blue-500' : 'bg-gray-500'
                    }`}></div>
                    <span className="text-gray-700">{categoryLabels[item.category] || item.category}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-medium">{formatCurrency(item.amount)}</span>
                    <span className="text-gray-400 text-sm ml-2">({item.percentage}%)</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-4">No expense data</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Profit Trend (Last 6 Months)</h3>
        {trends.length > 0 ? (
          <div className="h-64 flex items-end gap-4">
            {trends.map((trend, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center">
                <div className="w-full flex gap-1 h-48 items-end">
                  <div
                    className="flex-1 bg-green-500 rounded-t"
                    style={{ height: `${Math.max(5, (trend.income / Math.max(...trends.map(t => Math.max(t.income, t.expense)))) * 100)}%` }}
                    title={`Income: ${formatCurrency(trend.income)}`}
                  ></div>
                  <div
                    className="flex-1 bg-red-400 rounded-t"
                    style={{ height: `${Math.max(5, (trend.expense / Math.max(...trends.map(t => Math.max(t.income, t.expense)))) * 100)}%` }}
                    title={`Expense: ${formatCurrency(trend.expense)}`}
                  ></div>
                </div>
                <span className="text-xs text-gray-500 mt-2">{trend.month}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-400 text-center py-8">No trend data available</p>
        )}
      </div>

      {showIncomeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Add Income</h2>
            <form onSubmit={handleAddIncome}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Date</label>
                  <input
                    type="date"
                    value={incomeForm.date}
                    onChange={(e) => setIncomeForm({ ...incomeForm, date: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Source</label>
                  <select
                    value={incomeForm.source}
                    onChange={(e) => setIncomeForm({ ...incomeForm, source: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"
                  >
                    <option value="pharmacy">Pharmacy</option>
                    <option value="laboratory">Laboratory</option>
                    <option value="doctor_visit">Doctor Visit</option>
                    <option value="admission">Admission</option>
                    <option value="operation">Operation</option>
                    <option value="ambulance">Ambulance</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Amount (BDT)</label>
                  <input
                    type="number"
                    value={incomeForm.amount}
                    onChange={(e) => setIncomeForm({ ...incomeForm, amount: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Description</label>
                  <input
                    type="text"
                    value={incomeForm.description}
                    onChange={(e) => setIncomeForm({ ...incomeForm, description: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button
                  type="button"
                  onClick={() => setShowIncomeModal(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  Add Income
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showExpenseModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Add Expense</h2>
            <form onSubmit={handleAddExpense}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Date</label>
                  <input
                    type="date"
                    value={expenseForm.date}
                    onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Category</label>
                  <select
                    value={expenseForm.category}
                    onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"
                  >
                    <option value="SALARY">Staff Salary</option>
                    <option value="MEDICINE">Medicine Purchase</option>
                    <option value="RENT">Rent</option>
                    <option value="ELECTRICITY">Electricity</option>
                    <option value="WATER">Water Supply</option>
                    <option value="COMMUNICATION">Internet & Phone</option>
                    <option value="MAINTENANCE">Maintenance</option>
                    <option value="SUPPLIES">Medical Supplies</option>
                    <option value="MARKETING">Marketing</option>
                    <option value="BANK">Bank Charges</option>
                    <option value="MISC">Miscellaneous</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Amount (BDT)</label>
                  <input
                    type="number"
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Description</label>
                  <input
                    type="text"
                    value={expenseForm.description}
                    onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button
                  type="button"
                  onClick={() => setShowExpenseModal(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Add Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </DashboardLayout>
  );
}
