import { useState, useEffect } from 'react';
import axios from 'axios';
import DashboardLayout from '../../components/DashboardLayout';

interface Income {
  id: number;
  date: string;
  source: string;
  amount: number;
  description: string;
  bill_id: number | null;
  created_by: number;
  created_at: string;
}

const sourceLabels: Record<string, string> = {
  pharmacy: 'Pharmacy',
  laboratory: 'Laboratory',
  doctor_visit: 'Doctor Visit',
  admission: 'Admission',
  operation: 'Operation',
  ambulance: 'Ambulance',
  other: 'Other',
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT', minimumFractionDigits: 0 }).format(amount);
};

export default function IncomeList({ role = 'md' }: { role?: string }) {
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ startDate: '', endDate: '', source: '' });
  const [showModal, setShowModal] = useState(false);
  const [editingIncome, setEditingIncome] = useState<Income | null>(null);
  const [formData, setFormData] = useState({ date: '', source: 'other', amount: '', description: '' });

  const fetchIncomes = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const params = new URLSearchParams();
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.source) params.append('source', filters.source);
      
      const res = await axios.get(`/api/income?${params}`, { headers });
      setIncomes(res.data.income || []);
    } catch (error) {
      console.error('Error fetching incomes:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncomes();
  }, [filters]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      if (editingIncome) {
        await axios.put(`/api/income/${editingIncome.id}`, formData, { headers });
      } else {
        await axios.post('/api/income', formData, { headers });
      }
      setShowModal(false);
      setEditingIncome(null);
      setFormData({ date: new Date().toISOString().split('T')[0], source: 'other', amount: '', description: '' });
      fetchIncomes();
    } catch (error) {
      console.error('Error saving income:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this income?')) return;
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      await axios.delete(`/api/income/${id}`, { headers });
      fetchIncomes();
    } catch (error) {
      console.error('Error deleting income:', error);
    }
  };

  const openEdit = (income: Income) => {
    setEditingIncome(income);
    setFormData({
      date: income.date,
      source: income.source,
      amount: income.amount.toString(),
      description: income.description || ''
    });
    setShowModal(true);
  };

  const totalAmount = incomes.reduce((sum, i) => sum + i.amount, 0);

  return (
    <DashboardLayout role={role}>
      <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Income Management</h1>
        <button onClick={() => { setEditingIncome(null); setFormData({ date: new Date().toISOString().split('T')[0], source: 'other', amount: '', description: '' }); setShowModal(true); }} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
          + Add Income
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <input type="date" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} className="border rounded-lg p-2" placeholder="Start Date" />
          <input type="date" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} className="border rounded-lg p-2" placeholder="End Date" />
          <select value={filters.source} onChange={(e) => setFilters({ ...filters, source: e.target.value })} className="border rounded-lg p-2">
            <option value="">All Sources</option>
            <option value="pharmacy">Pharmacy</option>
            <option value="laboratory">Laboratory</option>
            <option value="doctor_visit">Doctor Visit</option>
            <option value="admission">Admission</option>
            <option value="operation">Operation</option>
            <option value="ambulance">Ambulance</option>
            <option value="other">Other</option>
          </select>
          <button onClick={fetchIncomes} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Filter</button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan={5} className="px-6 py-4 text-center">Loading...</td></tr>
            ) : incomes.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-4 text-center text-gray-400">No income records found</td></tr>
            ) : (
              incomes.map((income) => (
                <tr key={income.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">{new Date(income.date).toLocaleDateString()}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      income.source === 'pharmacy' ? 'bg-blue-100 text-blue-800' :
                      income.source === 'laboratory' ? 'bg-green-100 text-green-800' :
                      income.source === 'doctor_visit' ? 'bg-purple-100 text-purple-800' :
                      income.source === 'admission' ? 'bg-yellow-100 text-yellow-800' :
                      income.source === 'operation' ? 'bg-pink-100 text-pink-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {sourceLabels[income.source] || income.source}
                    </span>
                    {income.bill_id && <span className="ml-2 text-xs text-gray-400">Auto-captured</span>}
                  </td>
                  <td className="px-6 py-4 font-medium text-green-600">{formatCurrency(income.amount)}</td>
                  <td className="px-6 py-4 text-gray-500">{income.description || '-'}</td>
                  <td className="px-6 py-4">
                    <button onClick={() => openEdit(income)} className="text-blue-600 hover:text-blue-800 mr-3">Edit</button>
                    <button onClick={() => handleDelete(income.id)} className="text-red-600 hover:text-red-800">Delete</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot className="bg-gray-50">
            <tr>
              <td colSpan={2} className="px-6 py-3 font-medium">Total</td>
              <td className="px-6 py-3 font-bold text-green-600">{formatCurrency(totalAmount)}</td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">{editingIncome ? 'Edit Income' : 'Add Income'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Date</label>
                  <input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="mt-1 block w-full border rounded-lg p-2" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Source</label>
                  <select value={formData.source} onChange={(e) => setFormData({ ...formData, source: e.target.value })} className="mt-1 block w-full border rounded-lg p-2">
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
                  <input type="number" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} className="mt-1 block w-full border rounded-lg p-2" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Description</label>
                  <input type="text" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="mt-1 block w-full border rounded-lg p-2" />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </DashboardLayout>
  );
}
