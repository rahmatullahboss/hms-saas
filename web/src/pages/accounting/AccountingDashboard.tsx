import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import DashboardLayout from '../../components/DashboardLayout';
import { useTranslation } from 'react-i18next';

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

export default function AccountingDashboard({ role = 'md' }: { role?: string }) {
  const { t } = useTranslation(['accounting', 'common']);
  const [data, setData] = useState<DashboardData | null>(null);
  const [incomeBreakdown, setIncomeBreakdown] = useState<IncomeBreakdown[]>([]);
  const [expenseBreakdown, setExpenseBreakdown] = useState<ExpenseBreakdown[]>([]);
  const [trends, setTrends] = useState<Trend[]>([]);
  const [loading, setLoading] = useState(true);
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [incomeForm, setIncomeForm] = useState({ date: new Date().toISOString().split('T')[0], source: 'other', amount: '', description: '' });
  const [expenseForm, setExpenseForm] = useState({ date: new Date().toISOString().split('T')[0], category: 'MISC', amount: '', description: '' });

  const sourceLabels: Record<string, string> = {
    pharmacy: t('sourcePharmacy'),
    laboratory: t('sourceLaboratory'),
    doctor_visit: t('sourceDoctorVisit'),
    admission: t('sourceAdmission'),
    operation: t('sourceOperation'),
    ambulance: t('sourceAmbulance'),
    other: t('sourceOther'),
  };

  const categoryLabels: Record<string, string> = {
    SALARY: t('catSalary'),
    MEDICINE: t('catMedicine'),
    RENT: t('catRent'),
    ELECTRICITY: t('catElectricity'),
    WATER: t('catWater'),
    COMMUNICATION: t('catCommunication'),
    MAINTENANCE: t('catMaintenance'),
    SUPPLIES: t('catSupplies'),
    MARKETING: t('catMarketing'),
    BANK: t('catBank'),
    MISC: t('catMisc'),
  };

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
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);



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
          <h1 className="text-2xl font-bold text-gray-800">{t('dashboardTitle')}</h1>
          <p className="text-sm text-gray-500">
            {t('lastUpdated')}: {data?.lastUpdated ? new Date(data.lastUpdated).toLocaleString() : 'N/A'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowIncomeModal(true)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            + {t('addIncome')}
          </button>
          <button
            onClick={() => setShowExpenseModal(true)}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            + {t('addExpense')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-green-500">
          <h3 className="text-gray-500 text-sm font-medium">{t('todaysIncome')}</h3>
          <p className="text-3xl font-bold text-green-600">{formatCurrency(data?.today.income || 0)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-red-500">
          <h3 className="text-gray-500 text-sm font-medium">{t('todaysExpense')}</h3>
          <p className="text-3xl font-bold text-red-600">{formatCurrency(data?.today.expense || 0)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-blue-500">
          <h3 className="text-gray-500 text-sm font-medium">{t('todaysProfit')}</h3>
          <p className={`text-3xl font-bold ${(data?.today.profit || 0) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
            {formatCurrency(data?.today.profit || 0)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-gray-500 text-sm font-medium mb-2">{t('mtdIncome')}</h3>
          <p className="text-2xl font-bold text-gray-800">{formatCurrency(data?.mtd.income || 0)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-gray-500 text-sm font-medium mb-2">{t('mtdExpense')}</h3>
          <p className="text-2xl font-bold text-gray-800">{formatCurrency(data?.mtd.expense || 0)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-gray-500 text-sm font-medium mb-2">{t('mtdProfit')}</h3>
          <p className={`text-2xl font-bold ${(data?.mtd.profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(data?.mtd.profit || 0)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">{t('incomeBySource')}</h3>
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
            <p className="text-gray-400 text-center py-4">{t('noIncomeData')}</p>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">{t('expenseByCategory')}</h3>
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
            <p className="text-gray-400 text-center py-4">{t('noExpenseData')}</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">{t('profitTrend')}</h3>
        {trends.length > 0 ? (
          <div className="h-64 flex items-end gap-4">
            {trends.map((trend, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center">
                <div className="w-full flex gap-1 h-48 items-end">
                  <div
                    className="flex-1 bg-green-500 rounded-t"
                    style={{ height: `${Math.max(5, (trend.income / Math.max(...trends.map(t => Math.max(t.income, t.expense)))) * 100)}%` }}
                    title={`${t('income')}: ${formatCurrency(trend.income)}`}
                  ></div>
                  <div
                    className="flex-1 bg-red-400 rounded-t"
                    style={{ height: `${Math.max(5, (trend.expense / Math.max(...trends.map(t => Math.max(t.income, t.expense)))) * 100)}%` }}
                    title={`${t('expenses')}: ${formatCurrency(trend.expense)}`}
                  ></div>
                </div>
                <span className="text-xs text-gray-500 mt-2">{trend.month}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-400 text-center py-8">{t('noTrendData')}</p>
        )}
      </div>

      {showIncomeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">{t('addIncome')}</h2>
            <form onSubmit={handleAddIncome}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('common:date')}</label>
                  <input
                    type="date"
                    value={incomeForm.date}
                    onChange={(e) => setIncomeForm({ ...incomeForm, date: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('source')}</label>
                  <select
                    value={incomeForm.source}
                    onChange={(e) => setIncomeForm({ ...incomeForm, source: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"
                  >
                    <option value="pharmacy">{t('sourcePharmacy')}</option>
                    <option value="laboratory">{t('sourceLaboratory')}</option>
                    <option value="doctor_visit">{t('sourceDoctorVisit')}</option>
                    <option value="admission">{t('sourceAdmission')}</option>
                    <option value="operation">{t('sourceOperation')}</option>
                    <option value="ambulance">{t('sourceAmbulance')}</option>
                    <option value="other">{t('sourceOther')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('amountBDT')}</label>
                  <input
                    type="number"
                    value={incomeForm.amount}
                    onChange={(e) => setIncomeForm({ ...incomeForm, amount: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('description')}</label>
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
                  {t('common:cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  {t('addIncome')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showExpenseModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">{t('addExpense')}</h2>
            <form onSubmit={handleAddExpense}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('common:date')}</label>
                  <input
                    type="date"
                    value={expenseForm.date}
                    onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('category')}</label>
                  <select
                    value={expenseForm.category}
                    onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"
                  >
                    <option value="SALARY">{t('catSalary')}</option>
                    <option value="MEDICINE">{t('catMedicine')}</option>
                    <option value="RENT">{t('catRent')}</option>
                    <option value="ELECTRICITY">{t('catElectricity')}</option>
                    <option value="WATER">{t('catWater')}</option>
                    <option value="COMMUNICATION">{t('catCommunication')}</option>
                    <option value="MAINTENANCE">{t('catMaintenance')}</option>
                    <option value="SUPPLIES">{t('catSupplies')}</option>
                    <option value="MARKETING">{t('catMarketing')}</option>
                    <option value="BANK">{t('catBank')}</option>
                    <option value="MISC">{t('catMisc')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('amountBDT')}</label>
                  <input
                    type="number"
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('description')}</label>
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
                  {t('common:cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  {t('addExpense')}
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
