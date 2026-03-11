import { useState, useEffect } from 'react';
import axios from 'axios';
import DashboardLayout from '../../components/DashboardLayout';

interface Expense {
  id: number;
  date: string;
  category: string;
  amount: number;
  description: string;
  status: 'pending' | 'approved' | 'rejected';
  approved_by: number | null;
  approved_at: string | null;
  created_by: number;
  created_at: string;
}

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

export default function ExpenseList({ role = 'md' }: { role?: string }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ startDate: '', endDate: '', category: '', status: '' });
  const [showModal, setShowModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [formData, setFormData] = useState({ date: '', category: 'MISC', amount: '', description: '' });
  const currentRole = role || 'md';

  const fetchExpenses = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const params = new URLSearchParams();
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.category) params.append('category', filters.category);
      if (filters.status) params.append('status', filters.status);
      
      const res = await axios.get(`/api/expenses?${params}`, { headers });
      setExpenses(res.data.expenses || []);
    } catch (error) {
      console.error('Error fetching expenses:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, [filters]);

  const handleSubmit = (e: React.FormEvent) => {
    if (editingExpense) {
      handleEdit(e);
    } else {
      handleAdd(e);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      await axios.post('/api/expenses', formData, { headers });
      setShowModal(false);
      setFormData({ date: new Date().toISOString().split('T')[0], category: 'MISC', amount: '', description: '' });
      fetchExpenses();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Error creating expense');
    }
  };

  const handleApprove = async (id: number) => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      await axios.post(`/api/expenses/${id}/approve`, {}, { headers });
      fetchExpenses();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Error approving expense');
    }
  };

  const handleReject = async (id: number) => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      await axios.post(`/api/expenses/${id}/reject`, {}, { headers });
      fetchExpenses();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Error rejecting expense');
    }
  };

  const openEdit = (expense: Expense) => {
    setEditingExpense(expense);
    setFormData({
      date: expense.date,
      category: expense.category,
      amount: expense.amount.toString(),
      description: expense.description || ''
    });
    setShowModal(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense) return;
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      await axios.put(`/api/expenses/${editingExpense.id}`, formData, { headers });
      setShowModal(false);
      setEditingExpense(null);
      setFormData({ date: new Date().toISOString().split('T')[0], category: 'MISC', amount: '', description: '' });
      fetchExpenses();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Error updating expense');
    }
  };

  const isDirector = currentRole === 'director';

  const totalAmount = expenses.filter(e => e.status === 'approved').reduce((sum, e) => sum + e.amount, 0);

  return (
    <DashboardLayout role={currentRole}>
      <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Expense Management</h1>
        <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
          + Add Expense
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <input type="date" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} className="border rounded-lg p-2" placeholder="Start Date" />
          <input type="date" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} className="border rounded-lg p-2" placeholder="End Date" />
          <select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })} className="border rounded-lg p-2">
            <option value="">All Categories</option>
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
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="border rounded-lg p-2">
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <button onClick={fetchExpenses} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Filter</button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan={6} className="px-6 py-4 text-center">Loading...</td></tr>
            ) : expenses.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-4 text-center text-gray-400">No expense records found</td></tr>
            ) : (
              expenses.map((expense) => (
                <tr key={expense.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">{new Date(expense.date).toLocaleDateString()}</td>
                  <td className="px-6 py-4">{categoryLabels[expense.category] || expense.category}</td>
                  <td className="px-6 py-4 font-medium text-red-600">{formatCurrency(expense.amount)}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      expense.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                      expense.status === 'approved' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {expense.status.charAt(0).toUpperCase() + expense.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-500">{expense.description || '-'}</td>
                  <td className="px-6 py-4">
                    {expense.status !== 'pending' && (
                      <button onClick={() => openEdit(expense)} className="text-blue-600 hover:text-blue-800 mr-3">Edit</button>
                    )}
                    {expense.status === 'pending' && isDirector && (
                      <>
                        <button onClick={() => handleApprove(expense.id)} className="text-green-600 hover:text-green-800 mr-2">Approve</button>
                        <button onClick={() => handleReject(expense.id)} className="text-red-600 hover:text-red-800">Reject</button>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot className="bg-gray-50">
            <tr>
              <td colSpan={2} className="px-6 py-3 font-medium">Total Approved</td>
              <td className="px-6 py-3 font-bold text-red-600">{formatCurrency(totalAmount)}</td>
              <td colSpan={3}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">{editingExpense ? 'Edit Expense' : 'Add Expense'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Date</label>
                  <input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="mt-1 block w-full border rounded-lg p-2" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Category</label>
                  <select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} className="mt-1 block w-full border rounded-lg p-2">
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
                  <input type="number" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} className="mt-1 block w-full border rounded-lg p-2" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Description</label>
                  <input type="text" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="mt-1 block w-full border rounded-lg p-2" />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </DashboardLayout>
  );
}
