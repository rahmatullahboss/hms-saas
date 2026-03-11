import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import DashboardLayout from '../components/DashboardLayout';

interface Medicine {
  id: number;
  name: string;
  company: string;
  unit_price: number;
  quantity: number;
  created_at: string;
  updated_at: string;
}

export default function PharmacyDashboard({ role = 'hospital_admin' }: { role?: string }) {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingMedicine, setEditingMedicine] = useState<Medicine | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    unitPrice: '',
    quantity: '',
  });

  const fetchMedicines = async () => {
    try {
      const token = localStorage.getItem('token');
      const params = search ? { search } : {};
      const res = await axios.get('/api/pharmacy/medicines', {
        params,
        headers: { Authorization: `Bearer ${token}` }
      });
      setMedicines(res.data.medicines || []);
    } catch (error) {
      toast.error('Failed to fetch medicines');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMedicines();
  }, [search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const payload = {
        name: formData.name,
        company: formData.company,
        unitPrice: parseFloat(formData.unitPrice),
        quantity: parseInt(formData.quantity) || 0,
      };

      if (editingMedicine) {
        await axios.put(`/api/pharmacy/medicines/${editingMedicine.id}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success('Medicine updated');
      } else {
        await axios.post('/api/pharmacy/medicines', payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success('Medicine added');
      }

      setShowModal(false);
      setEditingMedicine(null);
      setFormData({ name: '', company: '', unitPrice: '', quantity: '' });
      fetchMedicines();
    } catch (error) {
      toast.error('Failed to save medicine');
    }
  };

  const handleStockUpdate = async (id: number, newQuantity: number) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`/api/pharmacy/medicines/${id}/stock`, 
        { quantity: newQuantity },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Stock updated');
      fetchMedicines();
    } catch (error) {
      toast.error('Failed to update stock');
    }
  };

  const openEdit = (medicine: Medicine) => {
    setEditingMedicine(medicine);
    setFormData({
      name: medicine.name,
      company: medicine.company || '',
      unitPrice: medicine.unit_price.toString(),
      quantity: medicine.quantity.toString(),
    });
    setShowModal(true);
  };

  const lowStockMedicines = medicines.filter(m => m.quantity < 10);
  const totalValue = medicines.reduce((sum, m) => sum + (m.unit_price * m.quantity), 0);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT', minimumFractionDigits: 0 }).format(amount);
  };

  return (
    <DashboardLayout role={role}>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Pharmacy Management</h1>
          <button
            onClick={() => {
              setEditingMedicine(null);
              setFormData({ name: '', company: '', unitPrice: '', quantity: '' });
              setShowModal(true);
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            + Add Medicine
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow">
            <p className="text-sm text-gray-500">Total Medicines</p>
            <p className="text-2xl font-bold">{medicines.length}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <p className="text-sm text-gray-500">Total Stock Value</p>
            <p className="text-2xl font-bold">{formatCurrency(totalValue)}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <p className="text-sm text-gray-500">Low Stock Items</p>
            <p className={`text-2xl font-bold ${lowStockMedicines.length > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {lowStockMedicines.length}
            </p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <p className="text-sm text-gray-500">Total Units</p>
            <p className="text-2xl font-bold">
              {medicines.reduce((sum, m) => sum + m.quantity, 0).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Low Stock Alert */}
        {lowStockMedicines.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-red-800 mb-2">Low Stock Alert</h3>
            <div className="flex flex-wrap gap-2">
              {lowStockMedicines.map(m => (
                <span key={m.id} className="bg-red-100 text-red-800 px-2 py-1 rounded text-sm">
                  {m.name}: {m.quantity} units
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search medicines..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full md:w-96 px-4 py-2 border rounded-lg"
          />
        </div>

        {/* Medicine Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Name</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Company</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Unit Price</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Quantity</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Value</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">Loading...</td>
                </tr>
              ) : medicines.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">No medicines found</td>
                </tr>
              ) : (
                medicines.map((medicine) => (
                  <tr key={medicine.id} className={`hover:bg-gray-50 ${medicine.quantity < 10 ? 'bg-red-50' : ''}`}>
                    <td className="px-4 py-3 font-medium">{medicine.name}</td>
                    <td className="px-4 py-3 text-gray-600">{medicine.company || '-'}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(medicine.unit_price)}</td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        value={medicine.quantity}
                        onChange={(e) => handleStockUpdate(medicine.id, parseInt(e.target.value) || 0)}
                        className="w-20 px-2 py-1 border rounded text-right"
                        min="0"
                      />
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {formatCurrency(medicine.unit_price * medicine.quantity)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => openEdit(medicine)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Add/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h2 className="text-xl font-bold mb-4">
                {editingMedicine ? 'Edit Medicine' : 'Add New Medicine'}
              </h2>
              <form onSubmit={handleSubmit}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Medicine Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
                  <input
                    type="text"
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit Price (BDT) *</label>
                  <input
                    type="number"
                    value={formData.unitPrice}
                    onChange={(e) => setFormData({ ...formData, unitPrice: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    required
                    min="0"
                    step="0.01"
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Initial Quantity</label>
                  <input
                    type="number"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    min="0"
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    {editingMedicine ? 'Update' : 'Add Medicine'}
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
