import { useState, useEffect } from 'react';
import {
  Globe, Save, Palette, Type, Eye, RefreshCw, Plus, Trash2, ChevronRight, ExternalLink,
} from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import DashboardLayout from '../components/DashboardLayout';

// ── Types ──
interface WebsiteConfig {
  is_enabled: number;
  theme: string;
  tagline: string;
  about_text: string;
  mission_text: string;
  founded_year: string;
  bed_count: string;
  operating_hours: string;
  google_maps_embed: string;
  whatsapp_number: string;
  facebook_url: string;
  seo_title: string;
  seo_description: string;
  seo_keywords: string;
  primary_color: string;
  secondary_color: string;
}

interface WebsiteService {
  id?: number;
  name: string;
  name_bn: string;
  description: string;
  icon: string;
  category: string;
  is_active: number;
  sort_order: number;
}

type Tab = 'general' | 'services' | 'seo' | 'appearance';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'general',    label: 'General',    icon: <Globe className="w-4 h-4" /> },
  { id: 'services',   label: 'Services',   icon: <Plus className="w-4 h-4" /> },
  { id: 'seo',        label: 'SEO',        icon: <Eye className="w-4 h-4" /> },
  { id: 'appearance', label: 'Appearance', icon: <Palette className="w-4 h-4" /> },
];

const THEMES = [
  { id: 'arogyaseva', name: 'ArogyaSeva', desc: 'Teal + White — Modern clinics', color: '#0891b2' },
  { id: 'medtrust',   name: 'MedTrust',   desc: 'Navy + Gold — Established hospitals', color: '#1e3a5f' },
  { id: 'carefirst',  name: 'CareFirst',  desc: 'Green + Warm — Community clinics', color: '#16a34a' },
];

const SERVICE_CATEGORIES = ['general', 'opd', 'ipd', 'lab', 'pharmacy', 'telemedicine', 'emergency'];

const DEFAULT_CONFIG: WebsiteConfig = {
  is_enabled: 1, theme: 'arogyaseva', tagline: '', about_text: '', mission_text: '',
  founded_year: '', bed_count: '', operating_hours: '', google_maps_embed: '',
  whatsapp_number: '', facebook_url: '', seo_title: '', seo_description: '',
  seo_keywords: '', primary_color: '#0891b2', secondary_color: '#059669',
};

function Field({ label, value, onChange, type = 'text', placeholder, hint, rows }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; hint?: string; rows?: number;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {rows ? (
        <textarea className="input" value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder} rows={rows} style={{ resize: 'vertical' }} />
      ) : (
        <input type={type} className="input" value={value}
          onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      )}
      {hint && <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">{hint}</p>}
    </div>
  );
}

export default function WebsiteSettings({ role = 'hospital_admin' }: { role?: string }) {
  const [config, setConfig] = useState<WebsiteConfig>(DEFAULT_CONFIG);
  const [services, setServices] = useState<WebsiteService[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [newService, setNewService] = useState<WebsiteService>({
    name: '', name_bn: '', description: '', icon: '🏥', category: 'general', is_active: 1, sort_order: 0,
  });

  const token = () => localStorage.getItem('hms_token');
  const headers = () => ({ Authorization: `Bearer ${token()}` });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [configRes, servicesRes] = await Promise.all([
        axios.get('/api/website/config', { headers: headers() }),
        axios.get('/api/website/services', { headers: headers() }),
      ]);
      if (configRes.data.data) {
        setConfig(c => ({ ...c, ...configRes.data.data }));
      }
      setServices(servicesRes.data.data || []);
    } catch (err) {
      console.error('[Website] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      // Parse numeric fields — input stores as strings, API expects numbers
      const payload: Record<string, any> = { ...config };
      if (payload.founded_year) payload.founded_year = Number(payload.founded_year) || null;
      else payload.founded_year = null;
      if (payload.bed_count) payload.bed_count = Number(payload.bed_count) || null;
      else payload.bed_count = null;
      // Remove empty strings for optional URL fields (Zod .url() rejects empty strings)
      if (!payload.google_maps_embed) delete payload.google_maps_embed;
      if (!payload.facebook_url) delete payload.facebook_url;
      await axios.put('/api/website/config', payload, { headers: headers() });
      toast.success('Website settings saved! Pages will refresh shortly.');
    } catch (err) {
      console.error('[Website] Save error:', err);
      toast.error('Failed to save website settings');
    } finally {
      setSaving(false);
    }
  };

  const handleAddService = async () => {
    if (!newService.name.trim()) { toast.error('Service name required'); return; }
    try {
      await axios.post('/api/website/services', newService, { headers: headers() });
      toast.success('Service added!');
      setNewService({ name: '', name_bn: '', description: '', icon: '🏥', category: 'general', is_active: 1, sort_order: 0 });
      fetchData();
    } catch (err) {
      toast.error('Failed to add service');
    }
  };

  const handleDeleteService = async (id: number) => {
    if (!confirm('Delete this service?')) return;
    try {
      await axios.delete(`/api/website/services/${id}`, { headers: headers() });
      toast.success('Service deleted');
      fetchData();
    } catch (err) {
      toast.error('Failed to delete');
    }
  };

  const handleTriggerRender = async () => {
    setRendering(true);
    try {
      await axios.post('/api/website/trigger-render', {}, { headers: headers() });
      toast.success('Website re-render triggered!');
    } catch (err) {
      toast.error('Failed to trigger re-render');
    } finally {
      setRendering(false);
    }
  };

  // Derive subdomain from current hostname for public URL
  const getPublicUrl = () => {
    const host = window.location.hostname;
    if (host.startsWith('hms-')) return `https://${host}/site`;
    return '/site';
  };

  const sc = (k: keyof WebsiteConfig) => (v: string) => setConfig(prev => ({ ...prev, [k]: v }));
  const ns = (k: keyof WebsiteService) => (v: string | number) => setNewService(prev => ({ ...prev, [k]: v }));

  const tabContent: Record<Tab, React.ReactNode> = {
    general: (
      <div className="space-y-4">
        {/* Enable/Disable Toggle */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--color-border-light)]">
          <div>
            <p className="text-sm font-medium text-[var(--color-text-primary)]">Website Enabled</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Toggle public website visibility
            </p>
          </div>
          <button type="button" role="switch" aria-checked={!!config.is_enabled}
            onClick={() => setConfig(c => ({ ...c, is_enabled: c.is_enabled ? 0 : 1 }))}
            className={`relative w-10 h-6 rounded-full transition-colors ${
              config.is_enabled ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'
            }`}>
            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
              config.is_enabled ? 'right-1' : 'left-1'
            }`} />
          </button>
        </div>

        <Field label="Hospital Tagline" value={config.tagline || ''} onChange={sc('tagline')}
          placeholder="আপনার স্বাস্থ্যসেবার বিশ্বস্ত সঙ্গী" hint="Shown on homepage hero section" />

        <div className="grid grid-cols-2 gap-4">
          <Field label="Founded Year" type="number" value={config.founded_year || ''} onChange={sc('founded_year')} placeholder="e.g. 2010" />
          <Field label="Total Beds" type="number" value={config.bed_count || ''} onChange={sc('bed_count')} placeholder="e.g. 50" />
        </div>

        <Field label="Operating Hours" value={config.operating_hours || ''} onChange={sc('operating_hours')}
          placeholder="Saturday - Thursday: 8AM - 10PM, Friday: 3PM - 10PM" />

        <div className="grid grid-cols-2 gap-4">
          <Field label="WhatsApp Number" value={config.whatsapp_number || ''} onChange={sc('whatsapp_number')}
            placeholder="+8801XXXXXXXXX" />
          <Field label="Facebook URL" value={config.facebook_url || ''} onChange={sc('facebook_url')}
            placeholder="https://facebook.com/yourhospital" />
        </div>

        <Field label="Google Maps Embed URL" value={config.google_maps_embed || ''} onChange={sc('google_maps_embed')}
          placeholder="https://www.google.com/maps/embed?pb=..."
          hint="Paste the src URL from Google Maps embed iframe" />

        {/* Content Section (merged from Content tab) */}
        <div className="pt-3 border-t border-[var(--color-border)]">
          <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-3">Website Content</p>
          <div className="space-y-4">
            <Field label="About Us" value={config.about_text || ''} onChange={sc('about_text')} rows={4}
              placeholder="Tell visitors about your hospital, its history, and mission..."
              hint="Shown on the About page." />
            <Field label="Our Mission" value={config.mission_text || ''} onChange={sc('mission_text')} rows={3}
              placeholder="Your hospital's mission statement..."
              hint="Highlighted in a special card on the About page." />
          </div>
        </div>

        {/* Preview Link */}
        <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-50 to-teal-50 dark:from-cyan-950/20 dark:to-teal-950/20 border border-cyan-200 dark:border-cyan-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[var(--color-primary)]">🌐 Live Website</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5 font-mono">{getPublicUrl()}</p>
            </div>
            <a href={getPublicUrl()} target="_blank" rel="noopener noreferrer"
              className="btn-secondary text-xs !py-1.5 !px-3 flex items-center gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" /> Open Website
            </a>
          </div>
        </div>
      </div>
    ),

    services: (
      <div className="space-y-4">
        {/* Existing Services */}
        {services.length > 0 ? (
          <div className="space-y-2">
            {services.map(svc => (
              <div key={svc.id} className="flex items-center justify-between p-3 rounded-lg bg-[var(--color-border-light)]">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{svc.icon}</span>
                  <div>
                    <p className="text-sm font-medium">{svc.name}</p>
                    {svc.name_bn && <p className="text-xs text-[var(--color-text-muted)]">{svc.name_bn}</p>}
                    <span className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] bg-[var(--color-border)] px-1.5 py-0.5 rounded">
                      {svc.category}
                    </span>
                  </div>
                </div>
                <button onClick={() => svc.id && handleDeleteService(svc.id)}
                  className="text-red-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-[var(--color-text-muted)]">
            <p className="text-sm">No services added yet</p>
          </div>
        )}

        {/* Add New Service */}
        <div className="p-4 rounded-xl border border-dashed border-[var(--color-border)] space-y-3">
          <p className="text-sm font-semibold text-[var(--color-text-primary)]">Add New Service</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name (English)" value={newService.name} onChange={v => ns('name')(v)} placeholder="e.g. OPD" />
            <Field label="Name (Bengali)" value={newService.name_bn} onChange={v => ns('name_bn')(v)} placeholder="e.g. বহির্বিভাগ" />
          </div>
          <Field label="Description" value={newService.description} onChange={v => ns('description')(v)}
            placeholder="Brief description of the service" rows={2} />
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Icon (Emoji)</label>
              <input className="input" value={newService.icon} onChange={e => ns('icon')(e.target.value)} placeholder="🏥" />
            </div>
            <div>
              <label className="label">Category</label>
              <select className="input" value={newService.category} onChange={e => ns('category')(e.target.value)}>
                {SERVICE_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat.toUpperCase()}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <button onClick={handleAddService} className="btn-primary w-full text-sm">
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>
          </div>
        </div>
      </div>
    ),

    seo: (
      <div className="space-y-4">
        <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 text-xs text-yellow-800 dark:text-yellow-200">
          💡 SEO settings improve how your hospital appears in Google search results.
        </div>

        <Field label="SEO Title" value={config.seo_title || ''} onChange={sc('seo_title')}
          placeholder="Dhaka General Hospital — Best Healthcare in Dhaka"
          hint={`${(config.seo_title || '').length}/120 characters`} />

        <Field label="Meta Description" value={config.seo_description || ''} onChange={sc('seo_description')} rows={2}
          placeholder="Leading hospital in Dhaka providing comprehensive healthcare services..."
          hint={`${(config.seo_description || '').length}/300 characters`} />

        <Field label="Keywords" value={config.seo_keywords || ''} onChange={sc('seo_keywords')}
          placeholder="hospital, dhaka, healthcare, doctor, emergency"
          hint="Comma-separated keywords" />

        {/* Preview */}
        <div className="p-4 rounded-xl bg-[var(--color-border-light)]">
          <p className="text-xs font-semibold text-[var(--color-text-muted)] mb-2 uppercase tracking-wide">Google Preview</p>
          <div className="space-y-0.5">
            <p className="text-blue-600 text-base font-medium">{config.seo_title || 'Your Hospital Name'}</p>
            <p className="text-green-700 text-xs">yourhospital.hms.ozzyl.com/site</p>
            <p className="text-sm text-[var(--color-text-muted)]">{config.seo_description || 'Your hospital description will appear here...'}</p>
          </div>
        </div>
      </div>
    ),

    appearance: (
      <div className="space-y-4">
        {/* Theme Selector */}
        <div>
          <label className="label">Theme</label>
          <div className="grid grid-cols-3 gap-3 mt-2">
            {THEMES.map(theme => (
              <button key={theme.id} onClick={() => setConfig(c => ({ ...c, theme: theme.id }))}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  config.theme === theme.id
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] shadow-md'
                    : 'border-[var(--color-border)] hover:border-[var(--color-primary)] hover:bg-[var(--color-border-light)]'
                }`}>
                <div className="w-8 h-8 rounded-full mb-2" style={{ background: theme.color }} />
                <p className="text-sm font-semibold">{theme.name}</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{theme.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Custom Colors */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Primary Color</label>
            <div className="flex items-center gap-3 mt-1">
              <input type="color" value={config.primary_color || '#0891b2'}
                onChange={e => setConfig(c => ({ ...c, primary_color: e.target.value }))}
                className="w-10 h-10 rounded-lg border border-[var(--color-border)] cursor-pointer" />
              <input className="input flex-1" value={config.primary_color || ''} onChange={e => sc('primary_color')(e.target.value)}
                placeholder="#0891b2" />
            </div>
          </div>
          <div>
            <label className="label">Secondary Color</label>
            <div className="flex items-center gap-3 mt-1">
              <input type="color" value={config.secondary_color || '#059669'}
                onChange={e => setConfig(c => ({ ...c, secondary_color: e.target.value }))}
                className="w-10 h-10 rounded-lg border border-[var(--color-border)] cursor-pointer" />
              <input className="input flex-1" value={config.secondary_color || ''} onChange={e => sc('secondary_color')(e.target.value)}
                placeholder="#059669" />
            </div>
          </div>
        </div>
      </div>
    ),
  };

  return (
    <DashboardLayout role={role}>
      <div className="max-w-3xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">🌐 Hospital Website</h1>
            <p className="section-subtitle mt-1">Manage your auto-generated public website</p>
          </div>
          <button onClick={handleTriggerRender} disabled={rendering}
            className="btn-secondary text-xs flex items-center gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${rendering ? 'animate-spin' : ''}`} />
            {rendering ? 'Rendering...' : 'Re-render'}
          </button>
        </div>

        <div className="flex flex-col md:flex-row gap-5">
          {/* Sidebar Tabs */}
          <div className="md:w-44 shrink-0">
            <div className="card p-2 flex md:flex-col gap-0.5 overflow-x-auto">
              {TABS.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left whitespace-nowrap
                    ${activeTab === tab.id
                      ? 'bg-[var(--color-primary-light)] text-[var(--color-primary-dark)]'
                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-border-light)]'
                    }`}>
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Content Panel */}
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
              {activeTab !== 'services' && (
                <div className="pt-2 border-t border-[var(--color-border)]">
                  <button onClick={handleSaveConfig} disabled={saving} className="btn-primary">
                    <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
