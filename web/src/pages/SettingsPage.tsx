import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import DashboardLayout from '../components/DashboardLayout';

interface Settings {
  share_price: string;
  total_shares: string;
  profit_percentage: string;
  profit_partner_count: string;
  owner_partner_count: string;
  shares_per_profit_partner: string;
  fire_service_charge: string;
  ambulance_charge: string;
}

export default function SettingsPage({ role = 'director' }: { role?: string }) {
  const [settings, setSettings] = useState<Settings>({
    share_price: '100000',
    total_shares: '300',
    profit_percentage: '30',
    profit_partner_count: '100',
    owner_partner_count: '200',
    shares_per_profit_partner: '3',
    fire_service_charge: '50',
    ambulance_charge: '500',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.get('/api/settings', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSettings({ ...settings, ...data.settings });
    } catch (error) {
      toast.error('Failed to fetch settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      await axios.put('/api/settings', settings, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Settings saved');
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (key: keyof Settings, value: string) => {
    setSettings({ ...settings, [key]: value });
  };

  return (
    <DashboardLayout role={role}>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">System Settings</h1>

        {loading ? (
          <div className="text-center py-8">Loading...</div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Share System Configuration</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Share Price (Taka)</label>
                  <input
                    type="number"
                    value={settings.share_price}
                    onChange={(e) => handleChange('share_price', e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Total Shares</label>
                  <input
                    type="number"
                    value={settings.total_shares}
                    onChange={(e) => handleChange('total_shares', e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Profit Percentage (%)</label>
                  <input
                    type="number"
                    value={settings.profit_percentage}
                    onChange={(e) => handleChange('profit_percentage', e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Profit Partner Count</label>
                  <input
                    type="number"
                    value={settings.profit_partner_count}
                    onChange={(e) => handleChange('profit_partner_count', e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Owner Partner Count</label>
                  <input
                    type="number"
                    value={settings.owner_partner_count}
                    onChange={(e) => handleChange('owner_partner_count', e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Shares Per Profit Partner</label>
                  <input
                    type="number"
                    value={settings.shares_per_profit_partner}
                    onChange={(e) => handleChange('shares_per_profit_partner', e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Billing Charges</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fire Service Charge (Taka)</label>
                  <input
                    type="number"
                    value={settings.fire_service_charge}
                    onChange={(e) => handleChange('fire_service_charge', e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ambulance Charge (Taka)</label>
                  <input
                    type="number"
                    value={settings.ambulance_charge}
                    onChange={(e) => handleChange('ambulance_charge', e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                </div>
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600 mb-4">
                <strong>Current Configuration Summary:</strong>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>1 share = {settings.share_price} Taka</li>
                  <li>Total shares available: {settings.total_shares}</li>
                  <li>{settings.profit_percentage}% profit distributed to {settings.profit_partner_count} profit partners</li>
                  <li>Each profit partner gets {settings.shares_per_profit_partner} shares</li>
                </ul>
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-primary-600 text-white py-3 rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}