import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import DashboardLayout from '../components/DashboardLayout';

interface Staff {
  id: number;
  name: string;
  address: string;
  position: string;
  salary: number;
  bank_account: string;
  mobile: string;
  joining_date: string;
  status: string;
}

export default function StaffPage({ role = 'md' }: { role?: string }) {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchStaff = async () => {
    try {
      const token = localStorage.getItem('hms_token');
      const res = await axios.get('/api/staff', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStaff(res.data.staff || []);
    } catch (error) {
      toast.error('Failed to fetch staff');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  const filteredStaff = staff.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.position.toLowerCase().includes(search.toLowerCase()) ||
    s.mobile.includes(search)
  );

  const totalSalary = staff.reduce((sum, s) => sum + (s.salary || 0), 0);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT', minimumFractionDigits: 0 }).format(amount);
  };

  return (
    <DashboardLayout role={role}>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Staff Management</h1>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow">
            <p className="text-sm text-gray-500">Total Staff</p>
            <p className="text-2xl font-bold">{staff.length}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <p className="text-sm text-gray-500">Monthly Salary</p>
            <p className="text-2xl font-bold">{formatCurrency(totalSalary)}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <p className="text-sm text-gray-500">Active Staff</p>
            <p className="text-2xl font-bold">{staff.filter(s => s.status === 'active').length}</p>
          </div>
        </div>

        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search by name, position, or mobile..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full md:w-96 px-4 py-2 border rounded-lg"
          />
        </div>

        {/* Staff Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Name</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Position</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Mobile</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Bank Account</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Salary</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Joined</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">Loading...</td>
                </tr>
              ) : filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">No staff found</td>
                </tr>
              ) : (
                filteredStaff.map((member) => (
                  <tr key={member.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{member.name}</td>
                    <td className="px-4 py-3">{member.position}</td>
                    <td className="px-4 py-3">{member.mobile}</td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-sm">{member.bank_account || '-'}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(member.salary || 0)}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {member.joining_date ? new Date(member.joining_date).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        member.status === 'active' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {member.status || 'active'}
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
