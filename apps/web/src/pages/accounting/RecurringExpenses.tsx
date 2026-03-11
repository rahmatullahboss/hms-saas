import { useState, useEffect } from 'react';
import axios from 'axios';
import DashboardLayout from '../../components/DashboardLayout';

interface RecurringExpense {
  id: number;
  category_id: number;
  category_name: string;
  category_code: string;
  amount: number;
  description: string | null;
  frequency: 'daily' | 'weekly' | 'monthly';
  next_run_date: string;
  end_date: string | null;
  is_active: number;
  created_by: number;
  created_at: string;
}

const frequencyLabels: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
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

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT', minimumFractionDigits: 0 }).format(amount);
};

export default function RecurringExpenses({ role = 'md' }: { role?: string }) {
  const [expenses, setExpenses] = useState<RecurringExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    category_id: '',
    amount: '',
    description: '',
    frequency: 'monthly',
    next_run_date: new Date().toISOString().split('T')[0],
    end_date: ''
  });

  const fetchExpenses = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get('/api/recurring', { headers });
      setExpenses(res.data.recurringExpenses || []);
    } catch (error) {
      console.error('Error fetching recurring expenses:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      await axios.post('/api/recurring', formData, { headers });
      setShowModal(false);
      setFormData({
        category_id: '',
        amount: '',
        description: '',
        frequency: 'monthly',
        next_run_date: new Date().toISOString().split('T')[0],
        end_date: ''
      });
      fetchExpenses();
    } catch (error) {
      console.error('Error creating recurring expense:', error);
    }
  };

  const handleToggle = async (id: number, currentStatus: number) => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      if (currentStatus === 1) {
        await axios.delete(`/api/recurring/${id}`, { headers });
      } else {
        await axios.put(`/api/recurring/${id}`, { is_active: 1 }, { headers });
      }
      fetchExpenses();
    } catch (error) {
      console.error('Error toggling recurring expense:', error);
    }
  };

  const handleRun = async (id: number) => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      await axios.post(`/api/recurring/${id}/run`, {}, { headers });
      alert('Expense executed successfully!');
      fetchExpenses();
    } catch (error) {
      console.error('Error running recurring expense:', error);
    }
  };

  return (
    <DashboardLayout role={role}>
      <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Recurring Expenses</h1>
        <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          + Add Recurring Expense
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Frequency</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Next Run</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan={6} className="px-6 py-4 text-center">Loading...</td></tr>
            ) : expenses.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-4 text-center text-gray-400">No recurring expenses found</td></tr>
            ) : (
              expenses.map((expense) => (
                <tr key={expense.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">{categoryLabels[expense.category_code] || expense.category_name}</td>
                  <td className="px-6 py-4 font-medium text-red-600">{formatCurrency(expense.amount)}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs">
                      {frequencyLabels[expense.frequency]}
                    </span>
                  </td>
                  <td className="px-6 py-4">{new Date(expense.next_run_date).toLocaleDateString()}</td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleToggle(expense.id, expense.is_active)}
                      className={`px-2 py-1 rounded-full text-xs ${expense.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}
                    >
                      {expense.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <button onClick={() => handleRun(expense.id)} className="text-blue-600 hover:text-blue-800 mr-3">Run Now</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Add Recurring Expense</h2>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Category</label>
                  <select value={formData.category_id} onChange={(e) => setFormData({ ...formData, category_id: e.target.value })} className="mt-1 block w-full border rounded-lg p-2" required>
                    <option value="">Select Category</option>
                    <option value="1">Staff Salary</option>
                    <option value="2">Medicine Purchase</option>
                    <option value="3">Rent</option>
                    <option value="4">Electricity</option>
                    <option value="5">Water Supply</option>
                    <option value="6">Internet & Phone</option>
                    <option value="10">Miscellaneous</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Amount (BDT)</label>
                  <input type="number" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} className="mt-1 block w-full border rounded-lg p-2" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Frequency</label>
                  <select value={formData.frequency} onChange={(e) => setFormData({ ...formData, frequency: e.target.value })} className="mt-1 block w-full border rounded-lg p-2">
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Start Date</label>
                  <input type="date" value={formData.next_run_date} onChange={(e) => setFormData({ ...formData, next_run_date: e.target.value })} className="mt-1 block w-full border rounded-lg p-2" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">End Date (Optional)</label>
                  <input type="date" value={formData.end_date} onChange={(e) => setFormData({ ...formData, end_date: e.target.value })} className="mt-1 block w-full border rounded-lg p-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Description</label>
                  <input type="text" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="mt-1 block w-full border rounded-lg p-2" />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </DashboardLayout>
  );
}
