import { Link, useLocation, useParams } from 'react-router';
import {
  LayoutDashboard, Users, FlaskConical, Receipt, Pill, Package,
  UserCog, PieChart, Settings, LogOut, Menu, X,
  Building2, Wallet, TrendingUp, TrendingDown, Repeat,
  BookOpen, FileText, Video, ChevronRight,
  BedDouble, Stethoscope, Calendar, Shield, ClipboardList,
  Globe, Siren, Scissors, Heart, ShieldAlert, ArrowRightLeft, HeartPulse,
  XCircle, Handshake, CreditCard, Layers, Beaker, BarChart3, MessageSquare, HelpCircle, Briefcase, Brain, Scan, ShoppingCart, AlertTriangle, RefreshCw,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface SidebarProps {
  role: string;
  permissions: string[];
  onLogout: () => void;
}

/** Nav item definition */
interface NavItem {
  labelKey: string;
  path: string;
  icon: React.ReactNode;
  /** Permission string required to see this item (e.g. 'patients:read'). If omitted, always visible. */
  requiredPermission?: string;
}

/** Group of nav items with an optional section label */
interface NavGroup {
  groupKey?: string; // i18n key for the section label (optional)
  items: NavItem[];
}

/**
 * Sidebar nav items use paths RELATIVE to `/h/:slug/`.
 * The component reads `slug` from route params and prefixes every link.
 */
export default function Sidebar({ role, permissions, onLogout }: SidebarProps) {
  const location = useLocation();
  const { slug } = useParams<{ slug: string }>();
  const [isOpen, setIsOpen] = useState(false);
  const { t, i18n } = useTranslation('sidebar');

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'en' ? 'bn' : 'en');
  };

  const lang = i18n.language;
  const base = `/h/${slug}`;

  /** Check if user has required permission */
  const hasPermission = (perm?: string): boolean => {
    if (!perm) return true; // no permission required → always visible
    if (permissions.includes('*')) return true; // wildcard → full access
    return permissions.includes(perm);
  };

  // ── Role-based grouped nav ────────────────────────────────────────────────
  const roleNavGroups: Record<string, NavGroup[]> = {
    super_admin: [
      {
        groupKey: 'groupPlatform',
        items: [
          { labelKey: 'dashboard',      path: '/super-admin/dashboard',  icon: <LayoutDashboard className="w-4.5 h-4.5" /> },
          { labelKey: 'platformHealth', path: '/super-admin/health',     icon: <Heart className="w-4.5 h-4.5" /> },
        ],
      },
      {
        groupKey: 'groupHospitals',
        items: [
          { labelKey: 'hospitals',       path: '/super-admin/hospitals',  icon: <Building2 className="w-4.5 h-4.5" />, requiredPermission: 'hospitals:read' },
          { labelKey: 'onboardingQueue', path: '/super-admin/onboarding', icon: <ClipboardList className="w-4.5 h-4.5" />, requiredPermission: 'hospitals:read' },
        ],
      },
      {
        groupKey: 'groupSystem',
        items: [
          { labelKey: 'auditLog',  path: '/super-admin/audit-log', icon: <Shield className="w-4.5 h-4.5" />, requiredPermission: 'audit:read' },
          { labelKey: 'settings',  path: '/super-admin/settings',  icon: <Settings className="w-4.5 h-4.5" />, requiredPermission: 'settings:read' },
        ],
      },
    ],
    hospital_admin: [
      {
        groupKey: 'groupOperations',
        items: [
          { labelKey: 'dashboard',     path: 'dashboard',         icon: <LayoutDashboard className="w-4.5 h-4.5" /> },
          { labelKey: 'appointments',  path: 'appointments',      icon: <Calendar        className="w-4.5 h-4.5" />, requiredPermission: 'appointments:read' },
          { labelKey: 'patients',      path: 'patients',          icon: <Users           className="w-4.5 h-4.5" />, requiredPermission: 'patients:read' },
          { labelKey: 'emergency',     path: 'emergency',         icon: <Siren           className="w-4.5 h-4.5" />, requiredPermission: 'emergency:read' },
          { labelKey: 'ot',            path: 'ot',                icon: <Scissors        className="w-4.5 h-4.5" />, requiredPermission: 'ot:read' },
          { labelKey: 'ipdAdmissions', path: 'admissions',        icon: <BedDouble       className="w-4.5 h-4.5" />, requiredPermission: 'admissions:read' },
          { labelKey: 'beds',          path: 'beds',              icon: <ClipboardList   className="w-4.5 h-4.5" />, requiredPermission: 'beds:read' },
          { labelKey: 'nurseStation',  path: 'nurse-station',     icon: <Stethoscope     className="w-4.5 h-4.5" />, requiredPermission: 'nursing:read' },
          { labelKey: 'nursing',       path: 'nursing',           icon: <HeartPulse     className="w-4.5 h-4.5" />, requiredPermission: 'nursing:read' },
          { labelKey: 'doctorSchedule', path: 'doctor-schedule',  icon: <BookOpen        className="w-4.5 h-4.5" />, requiredPermission: 'schedule:read' },
          { labelKey: 'telemedicine',  path: 'telemedicine',      icon: <Video           className="w-4.5 h-4.5" />, requiredPermission: 'telemedicine:read' },
        ],
      },
      {
        groupKey: 'groupClinical',
        items: [
          { labelKey: 'labTests',      path: 'tests',             icon: <FlaskConical    className="w-4.5 h-4.5" />, requiredPermission: 'tests:read' },
          { labelKey: 'pharmacy',      path: 'pharmacy',          icon: <Pill            className="w-4.5 h-4.5" />, requiredPermission: 'pharmacy:read' },
          { labelKey: 'inventory',     path: 'inventory',         icon: <Package         className="w-4.5 h-4.5" />, requiredPermission: 'inventory:read' },
          { labelKey: 'vitals',        path: 'vitals',            icon: <Heart           className="w-4.5 h-4.5" />, requiredPermission: 'vitals:read' },
          { labelKey: 'allergies',     path: 'allergies',         icon: <ShieldAlert     className="w-4.5 h-4.5" />, requiredPermission: 'allergies:read' },
          { labelKey: 'clinicalAssessments', path: 'clinical', icon: <Brain className="w-4.5 h-4.5" />, requiredPermission: 'clinical:read' },
          { labelKey: 'ePrescribing',    path: 'e-prescribing',    icon: <Shield       className="w-4.5 h-4.5" />, requiredPermission: 'eprescribing:read' },
          { labelKey: 'medicalRecords',   path: 'medical-records',  icon: <FileText     className="w-4.5 h-4.5" />, requiredPermission: 'medicalrecords:read' },
          { labelKey: 'radiology',        path: 'radiology',        icon: <Scan         className="w-4.5 h-4.5" />, requiredPermission: 'radiology:read' },
          { labelKey: 'labSettings',   path: 'lab-settings',      icon: <Beaker          className="w-4.5 h-4.5" />, requiredPermission: 'lab-settings:read' },
        ],
      },
      {
        groupKey: 'groupFinance',
        items: [
          { labelKey: 'billing',            path: 'billing',             icon: <Receipt         className="w-4.5 h-4.5" />, requiredPermission: 'billing:read' },
          { labelKey: 'billingMaster',      path: 'billing-master',      icon: <Layers          className="w-4.5 h-4.5" />, requiredPermission: 'billing-master:read' },
          { labelKey: 'provisionalBilling', path: 'provisional-billing', icon: <FileText        className="w-4.5 h-4.5" />, requiredPermission: 'provisional-billing:read' },
          { labelKey: 'deposits',           path: 'deposits',            icon: <CreditCard      className="w-4.5 h-4.5" />, requiredPermission: 'deposits:read' },
          { labelKey: 'creditNotes',        path: 'credit-notes',        icon: <FileText        className="w-4.5 h-4.5" />, requiredPermission: 'credit-notes:read' },
          { labelKey: 'billHandover',       path: 'billing-handover',    icon: <ArrowRightLeft  className="w-4.5 h-4.5" />, requiredPermission: 'handover:read' },
          { labelKey: 'billCancellation',   path: 'billing-cancellation', icon: <XCircle        className="w-4.5 h-4.5" />, requiredPermission: 'cancellation:read' },
          { labelKey: 'settlements',        path: 'settlements',         icon: <Handshake       className="w-4.5 h-4.5" />, requiredPermission: 'settlements:read' },
          { labelKey: 'accounting',         path: 'accounting',          icon: <Wallet          className="w-4.5 h-4.5" />, requiredPermission: 'accounting:read' },
          { labelKey: 'income',             path: 'income',              icon: <TrendingUp      className="w-4.5 h-4.5" />, requiredPermission: 'income:read' },
          { labelKey: 'expenses',           path: 'expenses',            icon: <TrendingDown    className="w-4.5 h-4.5" />, requiredPermission: 'expenses:read' },
          { labelKey: 'recurring',          path: 'recurring',           icon: <Repeat          className="w-4.5 h-4.5" />, requiredPermission: 'expenses:read' },
          { labelKey: 'accounts',           path: 'accounts',            icon: <BookOpen        className="w-4.5 h-4.5" />, requiredPermission: 'accounting:read' },
          { labelKey: 'insurance',          path: 'insurance-claims',    icon: <FileText        className="w-4.5 h-4.5" />, requiredPermission: 'insurance:read' },
          { labelKey: 'insuranceBilling',   path: 'insurance-billing',   icon: <Shield          className="w-4.5 h-4.5" />, requiredPermission: 'insurance:read' },
          { labelKey: 'ipBilling',          path: 'ip-billing',          icon: <BedDouble       className="w-4.5 h-4.5" />, requiredPermission: 'ip-billing:read' },
          { labelKey: 'payments',           path: 'payments',            icon: <CreditCard      className="w-4.5 h-4.5" />, requiredPermission: 'payments:read' },
        ],
      },
      {
        groupKey: 'groupAdmin',
        items: [
          { labelKey: 'inbox',              path: 'inbox',               icon: <MessageSquare   className="w-4.5 h-4.5" />, requiredPermission: 'inbox:read' },
          { labelKey: 'staff',              path: 'staff',               icon: <UserCog         className="w-4.5 h-4.5" />, requiredPermission: 'staff:read' },
          { labelKey: 'hrPayroll',           path: 'hr',                  icon: <Briefcase        className="w-4.5 h-4.5" />, requiredPermission: 'hr:read' },
          { labelKey: 'shareholders',       path: 'shareholders',        icon: <Users           className="w-4.5 h-4.5" />, requiredPermission: 'shareholders:read' },
          { labelKey: 'multiBranch',        path: 'multi-branch',        icon: <Building2       className="w-4.5 h-4.5" />, requiredPermission: 'multi-branch:read' },
          { labelKey: 'reports',            path: 'reports',             icon: <PieChart        className="w-4.5 h-4.5" />, requiredPermission: 'reports:read' },
          { labelKey: 'labReports',         path: 'reports/lab',         icon: <BarChart3       className="w-4.5 h-4.5" />, requiredPermission: 'reports:read' },
          { labelKey: 'pharmacyReports',    path: 'reports/pharmacy',    icon: <BarChart3       className="w-4.5 h-4.5" />, requiredPermission: 'reports:read' },
          { labelKey: 'appointmentReports', path: 'reports/appointments', icon: <BarChart3      className="w-4.5 h-4.5" />, requiredPermission: 'reports:read' },
          { labelKey: 'systemAudit',        path: 'system-audit',        icon: <Shield          className="w-4.5 h-4.5" />, requiredPermission: 'audit:read' },
          { labelKey: 'website',            path: 'website',             icon: <Globe           className="w-4.5 h-4.5" />, requiredPermission: 'website:read' },
          { labelKey: 'settings',           path: 'settings',            icon: <Settings        className="w-4.5 h-4.5" />, requiredPermission: 'settings:read' },
          { labelKey: 'helpCenter',         path: 'help',                icon: <HelpCircle      className="w-4.5 h-4.5" /> },
        ],
      },
    ],
    laboratory: [
      {
        items: [
          { labelKey: 'dashboard', path: 'lab/dashboard', icon: <LayoutDashboard className="w-4.5 h-4.5" /> },
          { labelKey: 'tests',     path: 'lab/tests',     icon: <FlaskConical    className="w-4.5 h-4.5" />, requiredPermission: 'tests:read' },
        ],
      },
    ],
    reception: [
      {
        items: [
          { labelKey: 'dashboard',    path: 'reception/dashboard',    icon: <LayoutDashboard className="w-4.5 h-4.5" /> },
          { labelKey: 'appointments', path: 'reception/appointments', icon: <Calendar        className="w-4.5 h-4.5" />, requiredPermission: 'appointments:read' },
          { labelKey: 'patients',     path: 'reception/patients',     icon: <Users           className="w-4.5 h-4.5" />, requiredPermission: 'patients:read' },
          { labelKey: 'billing',      path: 'reception/billing',      icon: <Receipt         className="w-4.5 h-4.5" />, requiredPermission: 'billing:read' },
          { labelKey: 'helpCenter',   path: 'reception/help',         icon: <HelpCircle      className="w-4.5 h-4.5" /> },
        ],
      },
    ],
    md: [
      {
        items: [
          { labelKey: 'dashboard',  path: 'md/dashboard',  icon: <LayoutDashboard className="w-4.5 h-4.5" /> },
          { labelKey: 'accounting', path: 'md/accounting', icon: <Wallet          className="w-4.5 h-4.5" />, requiredPermission: 'accounting:read' },
          { labelKey: 'income',     path: 'md/income',     icon: <TrendingUp      className="w-4.5 h-4.5" />, requiredPermission: 'income:read' },
          { labelKey: 'expenses',   path: 'md/expenses',   icon: <TrendingDown    className="w-4.5 h-4.5" />, requiredPermission: 'expenses:read' },
          { labelKey: 'recurring',  path: 'md/recurring',  icon: <Repeat          className="w-4.5 h-4.5" />, requiredPermission: 'expenses:read' },
          { labelKey: 'accounts',   path: 'md/accounts',   icon: <BookOpen        className="w-4.5 h-4.5" />, requiredPermission: 'accounting:read' },
          { labelKey: 'reports',    path: 'md/reports',     icon: <PieChart        className="w-4.5 h-4.5" />, requiredPermission: 'reports:read' },
          { labelKey: 'audit',      path: 'md/audit',       icon: <FileText        className="w-4.5 h-4.5" />, requiredPermission: 'audit:read' },
          { labelKey: 'staff',      path: 'md/staff',       icon: <UserCog         className="w-4.5 h-4.5" />, requiredPermission: 'staff:read' },
          { labelKey: 'hrPayroll',  path: 'md/hr',          icon: <Briefcase        className="w-4.5 h-4.5" />, requiredPermission: 'hr:read' },
          { labelKey: 'profit',     path: 'md/profit',      icon: <TrendingUp      className="w-4.5 h-4.5" />, requiredPermission: 'profit:calculate' },
          { labelKey: 'helpCenter', path: 'md/help',        icon: <HelpCircle      className="w-4.5 h-4.5" /> },
        ],
      },
    ],
    director: [
      {
        items: [
          { labelKey: 'dashboard',    path: 'director/dashboard',    icon: <LayoutDashboard className="w-4.5 h-4.5" /> },
          { labelKey: 'accounting',   path: 'director/accounting',   icon: <Wallet          className="w-4.5 h-4.5" />, requiredPermission: 'accounting:read' },
          { labelKey: 'income',       path: 'director/income',       icon: <TrendingUp      className="w-4.5 h-4.5" />, requiredPermission: 'income:read' },
          { labelKey: 'expenses',     path: 'director/expenses',     icon: <TrendingDown    className="w-4.5 h-4.5" />, requiredPermission: 'expenses:read' },
          { labelKey: 'reports',      path: 'director/reports',      icon: <PieChart        className="w-4.5 h-4.5" />, requiredPermission: 'reports:read' },
          { labelKey: 'audit',        path: 'director/audit',        icon: <FileText        className="w-4.5 h-4.5" />, requiredPermission: 'audit:read' },
          { labelKey: 'shareholders', path: 'director/shareholders', icon: <Users           className="w-4.5 h-4.5" />, requiredPermission: 'shareholders:read' },
          { labelKey: 'profit',       path: 'director/profit',       icon: <TrendingUp      className="w-4.5 h-4.5" />, requiredPermission: 'profit:calculate' },
          { labelKey: 'settings',     path: 'director/settings',     icon: <Settings        className="w-4.5 h-4.5" />, requiredPermission: 'settings:read' },
          { labelKey: 'helpCenter',   path: 'director/help',         icon: <HelpCircle      className="w-4.5 h-4.5" /> },
        ],
      },
    ],
    pharmacist: [
      {
        groupKey: 'Pharmacy',
        items: [
          { labelKey: 'dashboard',       path: 'pharmacy/dashboard',   icon: <LayoutDashboard className="w-4.5 h-4.5" /> },
          { labelKey: 'invoices',        path: 'pharmacy/invoices',    icon: <Receipt          className="w-4.5 h-4.5" />, requiredPermission: 'pharmacy:read' },
          { labelKey: 'prescriptions',   path: 'pharmacy/prescriptions', icon: <ClipboardList  className="w-4.5 h-4.5" />, requiredPermission: 'pharmacy:read' },
        ],
      },
      {
        groupKey: 'Procurement',
        items: [
          { labelKey: 'purchaseOrders',  path: 'pharmacy/po',          icon: <ShoppingCart     className="w-4.5 h-4.5" />, requiredPermission: 'pharmacy:write' },
          { labelKey: 'goodsReceipts',   path: 'pharmacy/grn',         icon: <Package          className="w-4.5 h-4.5" />, requiredPermission: 'pharmacy:write' },
          { labelKey: 'suppliers',       path: 'pharmacy/suppliers',   icon: <Handshake        className="w-4.5 h-4.5" />, requiredPermission: 'pharmacy:read' },
        ],
      },
      {
        groupKey: 'Inventory',
        items: [
          { labelKey: 'stock',           path: 'pharmacy/stock',       icon: <Layers           className="w-4.5 h-4.5" />, requiredPermission: 'pharmacy:read' },
          { labelKey: 'items',           path: 'pharmacy/items',       icon: <Pill             className="w-4.5 h-4.5" />, requiredPermission: 'pharmacy:read' },
          { labelKey: 'writeOffs',       path: 'pharmacy/write-offs',  icon: <XCircle          className="w-4.5 h-4.5" />, requiredPermission: 'pharmacy:write' },
          { labelKey: 'dispatches',      path: 'pharmacy/dispatches',  icon: <ArrowRightLeft   className="w-4.5 h-4.5" />, requiredPermission: 'pharmacy:write' },
          { labelKey: 'narcoticRegister', path: 'pharmacy/narcotics',  icon: <ShieldAlert      className="w-4.5 h-4.5" />, requiredPermission: 'pharmacy:read' },
        ],
      },
      {
        groupKey: 'Finance',
        items: [
          { labelKey: 'deposits',        path: 'pharmacy/deposits',    icon: <Wallet           className="w-4.5 h-4.5" />, requiredPermission: 'pharmacy:read' },
          { labelKey: 'settlements',     path: 'pharmacy/settlements', icon: <CreditCard       className="w-4.5 h-4.5" />, requiredPermission: 'pharmacy:read' },
          { labelKey: 'helpCenter',      path: 'pharmacy/help',        icon: <HelpCircle       className="w-4.5 h-4.5" /> },
        ],
      },
    ],
  };

  const allNavGroups: NavGroup[] = roleNavGroups[role] ?? roleNavGroups.hospital_admin;

  // Filter nav items by permission, and filter out empty groups
  const navGroups: NavGroup[] = allNavGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => hasPermission(item.requiredPermission)),
    }))
    .filter((group) => group.items.length > 0);
  const roleLabel = t(`roleLabels.${role}`, { defaultValue: role });

  // Resolve full path: for super_admin keep absolute, for others prefix with /h/:slug/
  const resolvePath = (path: string) =>
    path.startsWith('/') ? path : `${base}/${path}`;

  // Get default group label translations
  const groupLabels: Record<string, string> = {
    groupPlatform:   t('groupPlatform',   { defaultValue: 'Platform' }),
    groupHospitals:  t('groupHospitals',  { defaultValue: 'Hospitals' }),
    groupSystem:     t('groupSystem',     { defaultValue: 'System' }),
    groupOperations: t('groupOperations', { defaultValue: 'Operations' }),
    groupClinical:   t('groupClinical',   { defaultValue: 'Clinical' }),
    groupFinance:    t('groupFinance',    { defaultValue: 'Finance' }),
    groupAdmin:      t('groupAdmin',      { defaultValue: 'Administration' }),
  };

  return (
    <>
      {/* ── Mobile hamburger ── */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? "Close sidebar" : "Open sidebar"}
        aria-expanded={isOpen}
        aria-controls="mobile-sidebar"
        className="no-print lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-white border border-[var(--color-border)] shadow-card cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
      >
        {isOpen ? <X className="w-5 h-5" aria-hidden="true" /> : <Menu className="w-5 h-5" aria-hidden="true" />}
      </button>

      {/* ── Mobile backdrop ── */}
      {isOpen && (
        <div
          className="no-print lg:hidden fixed inset-0 bg-black/40 z-30 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        id="mobile-sidebar"
        className={`
        no-print
        fixed lg:static inset-y-0 left-0 z-40
        w-64 bg-white dark:bg-slate-900
        border-r border-[var(--color-border)]
        flex flex-col
        transform transition-transform duration-200 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>

        {/* Logo & Brand — with gradient strip */}
        <div className="h-16 flex items-center gap-3 px-5 border-b border-[var(--color-border)] shrink-0
          bg-gradient-to-r from-cyan-50/60 to-transparent dark:from-cyan-950/20 dark:to-transparent">
          {/* Gradient cross icon */}
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--color-primary)] to-cyan-400 flex items-center justify-center shrink-0 shadow-md shadow-cyan-500/20">
            <svg viewBox="0 0 20 20" fill="white" className="w-4 h-4">
              <rect x="8" y="2" width="4" height="16" rx="1"/>
              <rect x="2" y="8" width="16" height="4" rx="1"/>
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold gradient-text leading-none">Ozzyl HMS</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5 leading-none capitalize">
              {roleLabel.replace(/_/g, ' ')}
            </p>
          </div>
          {/* Language Toggle */}
          <button
            onClick={toggleLanguage}
            title={lang === 'en' ? 'Switch to Bangla' : 'Switch to English'}
            className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold border border-[var(--color-border)] hover:bg-[var(--color-primary-light)] hover:text-[var(--color-primary-dark)] transition-colors cursor-pointer"
          >
            <Globe className="w-3.5 h-3.5" />
            {lang === 'en' ? 'বাং' : 'EN'}
          </button>
        </div>

        {/* Navigation with groups */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto" aria-label="Main navigation">
          {navGroups.map((group, groupIdx) => (
            <div key={groupIdx} className={groupIdx > 0 ? 'mt-4' : ''}>
              {/* Group label */}
              {group.groupKey && (
                <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
                  {groupLabels[group.groupKey] ?? group.groupKey}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const fullPath = resolvePath(item.path);
                  const isActive = location.pathname === fullPath || location.pathname.startsWith(fullPath + '/');
                  return (
                    <Link
                      key={item.path}
                      to={fullPath}
                      preventScrollReset
                      onClick={() => setIsOpen(false)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`
                        group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                        transition-all duration-150 cursor-pointer
                        ${isActive
                          ? 'bg-gradient-to-r from-[var(--color-primary)] to-cyan-400 text-white shadow-sm shadow-cyan-500/20'
                          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-primary-light)] hover:text-[var(--color-primary-dark)] hover:translate-x-0.5'
                        }
                      `}
                    >
                      <span className={`shrink-0 ${isActive ? 'text-white' : 'text-[var(--color-text-muted)] group-hover:text-[var(--color-primary)]'}`}>
                        {item.icon}
                      </span>
                      <span className="truncate">{t(item.labelKey)}</span>
                      {isActive && <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-70" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer: sign out */}
        <div className="px-3 py-3 border-t border-[var(--color-border)] shrink-0">
          <button
            onClick={onLogout}
            className="btn-danger w-full justify-start text-sm cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>{t('signOut', { ns: 'common' })}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
