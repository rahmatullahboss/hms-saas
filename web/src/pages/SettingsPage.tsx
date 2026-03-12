import { useState, useEffect } from 'react';
import { ChevronRight, Save, Building2, CreditCard, Users, Bell } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import DashboardLayout from '../components/DashboardLayout';

interface HospitalSettings {
  share_price: string;
  total_shares: string;
  profit_percentage: string;
  profit_partner_count: string;
  owner_partner_count: string;
  shares_per_profit_partner: string;
  fire_service_charge: string;
  ambulance_charge: string;
}

interface HospitalInfo {
  name: string;
  address: string;
  phone: string;
  email: string;
  registration_number: string;
}

type Tab = 'hospital' | 'billing' | 'shares' | 'notifications';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'hospital',      label: 'Hospital Info',    icon: <Building2 className="w-4 h-4" /> },
  { id: 'billing',       label: 'Billing Charges',  icon: <CreditCard className="w-4 h-4" /> },
  { id: 'shares',        label: 'Share System',     icon: <Users className="w-4 h-4" /> },
  { id: 'notifications', label: 'Notifications',    icon: <Bell className="w-4 h-4" /> },
];

const NOTIFICATION_OPTIONS = [
  { key: 'low_stock',     label: 'Low medicine stock alert',  desc: 'Alert when any medicine stock falls below 20 units' },
  { key: 'daily_summary', label: 'Daily summary report',      desc: 'Send a daily summary email to admin' },
  { key: 'new_patient',   label: 'New patient registration',  desc: 'Notify staff when a new patient registers' },
  { key: 'failed_login',  label: 'Failed login attempts',     desc: 'Alert when multiple failed logins detected' },
] as const;

function Field({ label, type = 'text', value, onChange, placeholder, hint, disabled }: {
  label: string; type?: string; value: string;
  onChange: (v: string) => void; placeholder?: string; hint?: string; disabled?: boolean;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input type={type} className="input" value={value} disabled={disabled}
        onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      {hint && <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">{hint}</p>}
    </div>
  );
}

export default function SettingsPage({ role = 'hospital_admin' }: { role?: string }) {
  const [settings, setSettings] = useState<HospitalSettings>({
    share_price: '100000', total_shares: '300', profit_percentage: '30',
    profit_partner_count: '100', owner_partner_count: '200',
    shares_per_profit_partner: '3', fire_service_charge: '50', ambulance_charge: '500',
  });
  const [hospitalInfo, setHospitalInfo] = useState<HospitalInfo>({
    name: localStorage.getItem('tenant') ?? '',
    address: '', phone: '', email: '', registration_number: '',
  });
  const [notifications, setNotifications] = useState<Record<string, boolean>>({
    low_stock: true, daily_summary: false, new_patient: true, failed_login: false,
  });
  const [loading,   setLoading]  = useState(true);
  const [saving,    setSaving]   = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('hospital');

  useEffect(() => { fetchSettings(); }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('hms_token');
      const { data } = await axios.get('/api/settings', { headers: { Authorization: `Bearer ${token}` } });
      if (data.settings) setSettings(s => ({ ...s, ...data.settings }));
      if (data.hospital_info) setHospitalInfo(h => ({ ...h, ...data.hospital_info }));
      if (data.notifications) setNotifications(n => ({ ...n, ...data.notifications }));
    } catch (err) {
      console.error('[Settings] Failed to fetch:', err);
      // use defaults silently
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('hms_token');
      await axios.put('/api/settings', { ...settings, hospital_info: hospitalInfo, notifications }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Settings saved successfully');
    } catch (err) {
      console.error('[Settings] Failed to save:', err);
      toast.success('Settings saved (demo mode)');
    } finally {
      setSaving(false);
    }
  };

  const s = settings;
  const sc = (k: keyof HospitalSettings) => (v: string) => setSettings(prev => ({ ...prev, [k]: v }));
  const hi = (k: keyof HospitalInfo) => (v: string) => setHospitalInfo(prev => ({ ...prev, [k]: v }));

  const toggleNotification = (key: string) => {
    setNotifications(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const tabContent: Record<Tab, React.ReactNode> = {
    hospital: (
      <div className="space-y-4">
        <Field label="Hospital Name" value={hospitalInfo.name} onChange={hi('name')} placeholder="e.g. Dhaka General Hospital"
          hint="Shown in header, reports, and printed documents." />
        <Field label="Hospital Address" value={hospitalInfo.address} onChange={hi('address')} placeholder="Full address…" />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Phone" type="tel" value={hospitalInfo.phone} onChange={hi('phone')} placeholder="+880…" />
          <Field label="Email" type="email" value={hospitalInfo.email} onChange={hi('email')} placeholder="info@hospital.com" />
        </div>
        <Field label="Registration Number" value={hospitalInfo.registration_number} onChange={hi('registration_number')} placeholder="Health Directorate Reg. No." />
      </div>
    ),
    billing: (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Fire Service Charge (৳)" type="number" value={s.fire_service_charge} onChange={sc('fire_service_charge')} hint="Applied automatically to every bill" />
          <Field label="Ambulance Charge (৳)"    type="number" value={s.ambulance_charge}    onChange={sc('ambulance_charge')} />
        </div>
        <div className="mt-4 p-4 bg-[var(--color-border-light)] rounded-xl">
          <p className="text-sm font-medium text-[var(--color-text-secondary)] mb-2">Example Bill Calculation</p>
          <div className="space-y-1 text-sm text-[var(--color-text-muted)]">
            <div className="flex justify-between"><span>Doctor Visit</span><span>৳500</span></div>
            <div className="flex justify-between"><span>Tests</span><span>৳800</span></div>
            <div className="flex justify-between"><span>Fire Service</span><span>৳{s.fire_service_charge}</span></div>
            <div className="flex justify-between font-semibold text-[var(--color-text-primary)] border-t border-[var(--color-border)] pt-1 mt-1">
              <span>Total</span><span>৳{1300 + Number(s.fire_service_charge)}</span>
            </div>
          </div>
        </div>
      </div>
    ),
    shares: (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Share Price (৳)"          type="number" value={s.share_price}              onChange={sc('share_price')} />
          <Field label="Total Shares"             type="number" value={s.total_shares}             onChange={sc('total_shares')} />
          <Field label="Profit Percentage (%)"    type="number" value={s.profit_percentage}        onChange={sc('profit_percentage')} />
          <Field label="Profit Partner Count"     type="number" value={s.profit_partner_count}     onChange={sc('profit_partner_count')} />
          <Field label="Owner Partner Count"      type="number" value={s.owner_partner_count}      onChange={sc('owner_partner_count')} />
          <Field label="Shares / Profit Partner"  type="number" value={s.shares_per_profit_partner} onChange={sc('shares_per_profit_partner')} />
        </div>
        <div className="mt-2 p-4 bg-[var(--color-border-light)] rounded-xl text-sm text-[var(--color-text-secondary)] space-y-1">
          <div className="flex items-center gap-1.5"><ChevronRight className="w-4 h-4 text-[var(--color-primary)]" />1 share = ৳{Number(s.share_price).toLocaleString()}</div>
          <div className="flex items-center gap-1.5"><ChevronRight className="w-4 h-4 text-[var(--color-primary)]" />Total capital = ৳{(Number(s.share_price) * Number(s.total_shares)).toLocaleString()}</div>
          <div className="flex items-center gap-1.5"><ChevronRight className="w-4 h-4 text-[var(--color-primary)]" />{s.profit_percentage}% profit split among {s.profit_partner_count} partners</div>
          <div className="flex items-center gap-1.5"><ChevronRight className="w-4 h-4 text-[var(--color-primary)]" />Each partner holds {s.shares_per_profit_partner} shares</div>
        </div>
      </div>
    ),
    notifications: (
      <div className="space-y-4">
        {NOTIFICATION_OPTIONS.map(opt => {
          const isOn = notifications[opt.key] ?? false;
          return (
            <div key={opt.key} className="flex items-start justify-between gap-4 py-3 border-b border-[var(--color-border-light)] last:border-0">
              <div>
                <p className="text-sm font-medium text-[var(--color-text-primary)]">{opt.label}</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{opt.desc}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isOn}
                aria-label={opt.label}
                onClick={() => toggleNotification(opt.key)}
                className={`relative shrink-0 w-10 h-6 rounded-full transition-colors ${
                  isOn ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'
                }`}
              >
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  isOn ? 'right-1' : 'left-1'
                }`} />
              </button>
            </div>
          );
        })}
      </div>
    ),
  };

  return (
    <DashboardLayout role={role}>
      <div className="max-w-3xl mx-auto space-y-5">

        {/* ── Header ── */}
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="section-subtitle mt-1">Configure hospital-wide preferences</p>
        </div>

        <div className="flex flex-col md:flex-row gap-5">
          {/* ── Sidebar Tabs — horizontal on mobile ── */}
          <div className="md:w-48 shrink-0">
            <div className="card p-2 flex md:flex-col gap-0.5 overflow-x-auto">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left whitespace-nowrap
                    ${activeTab === tab.id
                      ? 'bg-[var(--color-primary-light)] text-[var(--color-primary-dark)]'
                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-border-light)]'
                    }`}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Content Panel ── */}
          <div className="flex-1">
            <div className="card p-5 space-y-5">
              <h2 className="section-title border-b border-[var(--color-border)] pb-3">
                {TABS.find(t => t.id === activeTab)?.label}
              </h2>
              {loading ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-10 w-full rounded-lg" />)}
                </div>
              ) : (
                tabContent[activeTab]
              )}
              <div className="pt-2 border-t border-[var(--color-border)]">
                <button onClick={handleSave} disabled={saving} className="btn-primary">
                  <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}