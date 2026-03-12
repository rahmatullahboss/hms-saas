import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import DashboardLayout from '../components/DashboardLayout';
import { useTranslation } from 'react-i18next';

interface Shareholder {
  id: number;
  name: string;
  phone: string;
  share_count: number;
  type: 'profit' | 'owner';
  investment: number;
}

interface ProfitCalculation {
  month: string;
  totalIncome: number;
  totalExpenses: number;
  profit: number;
  profitPercentage: number;
  distributableProfit: number;
  profitPartnerCount: number;
  profitPerPartner: string;
}

export default function DirectorDashboard({ role = 'director' }: { role?: string }) {
  const { t } = useTranslation('common');
  const [shareholders, setShareholders] = useState<Shareholder[]>([]);
  const [profitCalc, setProfitCalc] = useState<ProfitCalculation | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddShareholder, setShowAddShareholder] = useState(false);
  const [newShareholder, setNewShareholder] = useState({
    name: '',
    address: '',
    phone: '',
    shareCount: 0,
    type: 'profit' as 'profit' | 'owner',
    investment: 0,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('hms_token');
      const headers = { Authorization: `Bearer ${token}` };
      
      const [shRes, calcRes] = await Promise.all([
        axios.get('/api/shareholders', { headers }),
        axios.get('/api/shareholders/calculate', { headers }),
      ]);
      
      setShareholders(shRes.data.shareholders || []);
      setProfitCalc(calcRes.data);
    } catch (error) {
      toast.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const handleAddShareholder = async () => {
    try {
      const token = localStorage.getItem('hms_token');
      await axios.post('/api/shareholders', newShareholder, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Shareholder added');
      setShowAddShareholder(false);
      setNewShareholder({ name: '', address: '', phone: '', shareCount: 0, type: 'profit', investment: 0 });
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to add shareholder');
    }
  };

  const handleApproveProfit = async () => {
    try {
      const token = localStorage.getItem('hms_token');
      await axios.post('/api/shareholders/approve', { month: profitCalc?.month }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Profit distribution approved');
    } catch (error) {
      toast.error('Failed to approve');
    }
  };

  const profitPartners = shareholders.filter(s => s.type === 'profit');
  const ownerPartners = shareholders.filter(s => s.type === 'owner');
  const totalShares = shareholders.reduce((sum, s) => sum + s.share_count, 0);

  return (
    <DashboardLayout role={role}>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">{t('directorDashboard', { defaultValue: 'Director Dashboard' })}</h1>
          <button
            onClick={() => setShowAddShareholder(true)}
            className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700"
          >
            + {t('addShareholder', { defaultValue: 'Add Shareholder' })}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">{t('totalShares', { defaultValue: 'Total Shares' })}</div>
            <div className="text-2xl font-bold text-primary-600">{totalShares}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">{t('profitPartners', { defaultValue: 'Profit Partners' })}</div>
            <div className="text-2xl font-bold text-green-600">{profitPartners.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">{t('ownerPartners', { defaultValue: 'Owner Partners' })}</div>
            <div className="text-2xl font-bold text-blue-600">{ownerPartners.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">{t('totalInvestment', { defaultValue: 'Total Investment' })}</div>
            <div className="text-2xl font-bold text-gray-600">
              {shareholders.reduce((sum, s) => sum + s.investment, 0).toFixed(0)} Taka
            </div>
          </div>
        </div>

        {profitCalc && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-bold mb-4">Monthly Profit Distribution - {profitCalc.month}</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div>
                <div className="text-sm text-gray-500">Total Income</div>
                <div className="text-xl font-bold text-green-600">{(profitCalc.totalIncome ?? 0).toFixed(0)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Total Expenses</div>
                <div className="text-xl font-bold text-red-600">{(profitCalc.totalExpenses ?? 0).toFixed(0)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Net Profit</div>
                <div className="text-xl font-bold text-primary-600">{(profitCalc.profit ?? 0).toFixed(0)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Distributable ({profitCalc.profitPercentage}%)</div>
                <div className="text-xl font-bold text-green-600">{(profitCalc.distributableProfit ?? 0).toFixed(0)}</div>
              </div>
            </div>
            
            <div className="bg-gray-50 p-4 rounded-lg mb-4">
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-sm text-gray-500">Each profit partner receives:</div>
                  <div className="text-2xl font-bold text-green-600">{profitCalc.profitPerPartner} Taka</div>
                </div>
                <button
                  onClick={handleApproveProfit}
                  className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700"
                >
                  Approve & Distribute
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h2 className="font-semibold">{t('shareholders', { defaultValue: 'Shareholders' })}</h2>
          </div>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Shares</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Investment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-4 text-center">Loading...</td></tr>
              ) : shareholders.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-4 text-center">No shareholders found</td></tr>
              ) : (
                shareholders.map((sh) => (
                  <tr key={sh.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium">{sh.name}</td>
                    <td className="px-6 py-4 text-sm">{sh.phone}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        sh.type === 'profit' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {sh.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">{sh.share_count}</td>
                    <td className="px-6 py-4 text-sm">{(sh.investment ?? 0).toFixed(0)} Taka</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {showAddShareholder && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow p-6 max-w-lg w-full">
              <h3 className="text-lg font-bold mb-4">{t('addNewShareholder', { defaultValue: 'Add New Shareholder' })}</h3>
              
              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="Name"
                  value={newShareholder.name}
                  onChange={(e) => setNewShareholder({ ...newShareholder, name: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg"
                />
                <input
                  type="text"
                  placeholder="Address"
                  value={newShareholder.address}
                  onChange={(e) => setNewShareholder({ ...newShareholder, address: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg"
                />
                <input
                  type="text"
                  placeholder="Phone"
                  value={newShareholder.phone}
                  onChange={(e) => setNewShareholder({ ...newShareholder, phone: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg"
                />
                <div className="grid grid-cols-2 gap-4">
                  <input
                    type="number"
                    placeholder="Share Count"
                    value={newShareholder.shareCount}
                    onChange={(e) => setNewShareholder({ ...newShareholder, shareCount: Number(e.target.value) })}
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                  <input
                    type="number"
                    placeholder="Investment"
                    value={newShareholder.investment}
                    onChange={(e) => setNewShareholder({ ...newShareholder, investment: Number(e.target.value) })}
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                </div>
                <select
                  value={newShareholder.type}
                  onChange={(e) => setNewShareholder({ ...newShareholder, type: e.target.value as 'profit' | 'owner' })}
                  className="w-full px-4 py-2 border rounded-lg"
                >
                  <option value="profit">Profit Partner</option>
                  <option value="owner">Owner Partner</option>
                </select>
              </div>

              <div className="flex gap-4 mt-6">
                <button
                  onClick={handleAddShareholder}
                  className="flex-1 bg-primary-600 text-white py-2 rounded-lg hover:bg-primary-700"
                >
                  {t('addShareholder', { defaultValue: 'Add Shareholder' })}
                </button>
                <button
                  onClick={() => setShowAddShareholder(false)}
                  className="px-6 py-2 border rounded-lg hover:bg-gray-50"
                >
                  {t('cancel')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}