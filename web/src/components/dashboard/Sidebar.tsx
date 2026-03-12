import { Link, useLocation, useParams } from 'react-router';
import {
  LayoutDashboard, Users, FlaskConical, Receipt, Pill,
  UserCog, PieChart, Settings, LogOut, Menu, X,
  Building2, Wallet, TrendingUp, TrendingDown, Repeat,
  BookOpen, FileText, Video, ChevronRight,
  BedDouble, Stethoscope, Calendar, Shield, ClipboardList,
  Globe,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface SidebarProps {
  role: string;
  onLogout: () => void;
}

/**
 * Sidebar nav items use paths RELATIVE to `/h/:slug/`.
 * The component reads `slug` from route params and prefixes every link.
 */
export default function Sidebar({ role, onLogout }: SidebarProps) {
  const location = useLocation();
  const { slug } = useParams<{ slug: string }>();
  const [isOpen, setIsOpen] = useState(false);
  const { t, i18n } = useTranslation('sidebar');

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'en' ? 'bn' : 'en');
  };

  const lang = i18n.language;
  const base = `/h/${slug}`;

  // Paths are RELATIVE — prefixed with `/h/:slug/` at render time
  const roleNavItems: Record<string, { labelKey: string; path: string; icon: React.ReactNode }[]> = {
    super_admin: [
      { labelKey: 'dashboard', path: '/super_admin/dashboard', icon: <LayoutDashboard className="w-4.5 h-4.5" /> },
      { labelKey: 'hospitals',  path: '/super_admin/hospitals', icon: <Building2 className="w-4.5 h-4.5" /> },
      { labelKey: 'settings',   path: '/super_admin/settings',  icon: <Settings className="w-4.5 h-4.5" /> },
    ],
    hospital_admin: [
      { labelKey: 'dashboard',     path: 'dashboard',         icon: <LayoutDashboard className="w-4.5 h-4.5" /> },
      { labelKey: 'appointments',  path: 'appointments',      icon: <BookOpen        className="w-4.5 h-4.5" /> },
      { labelKey: 'patients',      path: 'patients',          icon: <Users           className="w-4.5 h-4.5" /> },
      { labelKey: 'labTests',      path: 'tests',             icon: <FlaskConical    className="w-4.5 h-4.5" /> },
      { labelKey: 'billing',       path: 'billing',           icon: <Receipt         className="w-4.5 h-4.5" /> },
      { labelKey: 'pharmacy',      path: 'pharmacy',          icon: <Pill            className="w-4.5 h-4.5" /> },
      { labelKey: 'accounting',    path: 'accounting',        icon: <Wallet          className="w-4.5 h-4.5" /> },
      { labelKey: 'income',        path: 'income',            icon: <TrendingUp      className="w-4.5 h-4.5" /> },
      { labelKey: 'expenses',      path: 'expenses',          icon: <TrendingDown    className="w-4.5 h-4.5" /> },
      { labelKey: 'recurring',     path: 'recurring',         icon: <Repeat          className="w-4.5 h-4.5" /> },
      { labelKey: 'accounts',      path: 'accounts',          icon: <BookOpen        className="w-4.5 h-4.5" /> },
      { labelKey: 'staff',         path: 'staff',             icon: <UserCog         className="w-4.5 h-4.5" /> },
      { labelKey: 'shareholders',  path: 'shareholders',      icon: <Users           className="w-4.5 h-4.5" /> },
      { labelKey: 'ipdAdmissions', path: 'admissions',        icon: <BedDouble       className="w-4.5 h-4.5" /> },
      { labelKey: 'beds',          path: 'beds',              icon: <ClipboardList   className="w-4.5 h-4.5" /> },
      { labelKey: 'nurseStation',  path: 'nurse-station',     icon: <Stethoscope     className="w-4.5 h-4.5" /> },
      { labelKey: 'doctorSchedule', path: 'doctor-schedule',  icon: <Calendar        className="w-4.5 h-4.5" /> },
      { labelKey: 'reports',       path: 'reports',           icon: <PieChart        className="w-4.5 h-4.5" /> },
      { labelKey: 'systemAudit',   path: 'system-audit',      icon: <Shield          className="w-4.5 h-4.5" /> },
      { labelKey: 'insurance',     path: 'insurance-claims',  icon: <FileText        className="w-4.5 h-4.5" /> },
      { labelKey: 'telemedicine',  path: 'telemedicine',      icon: <Video           className="w-4.5 h-4.5" /> },
      { labelKey: 'multiBranch',   path: 'multi-branch',      icon: <Building2       className="w-4.5 h-4.5" /> },
      { labelKey: 'settings',      path: 'settings',          icon: <Settings        className="w-4.5 h-4.5" /> },
    ],
    laboratory: [
      { labelKey: 'dashboard', path: 'lab/dashboard', icon: <LayoutDashboard className="w-4.5 h-4.5" /> },
      { labelKey: 'tests',     path: 'lab/tests',     icon: <FlaskConical    className="w-4.5 h-4.5" /> },
    ],
    reception: [
      { labelKey: 'dashboard',    path: 'reception/dashboard',    icon: <LayoutDashboard className="w-4.5 h-4.5" /> },
      { labelKey: 'appointments', path: 'reception/appointments', icon: <BookOpen        className="w-4.5 h-4.5" /> },
      { labelKey: 'patients',     path: 'reception/patients',     icon: <Users           className="w-4.5 h-4.5" /> },
      { labelKey: 'billing',      path: 'reception/billing',      icon: <Receipt         className="w-4.5 h-4.5" /> },
    ],
    md: [
      { labelKey: 'dashboard',  path: 'md/dashboard',  icon: <LayoutDashboard className="w-4.5 h-4.5" /> },
      { labelKey: 'accounting', path: 'md/accounting', icon: <Wallet          className="w-4.5 h-4.5" /> },
      { labelKey: 'income',     path: 'md/income',     icon: <TrendingUp      className="w-4.5 h-4.5" /> },
      { labelKey: 'expenses',   path: 'md/expenses',   icon: <TrendingDown    className="w-4.5 h-4.5" /> },
      { labelKey: 'recurring',  path: 'md/recurring',  icon: <Repeat          className="w-4.5 h-4.5" /> },
      { labelKey: 'accounts',   path: 'md/accounts',   icon: <BookOpen        className="w-4.5 h-4.5" /> },
      { labelKey: 'reports',    path: 'md/reports',     icon: <PieChart        className="w-4.5 h-4.5" /> },
      { labelKey: 'audit',      path: 'md/audit',       icon: <FileText        className="w-4.5 h-4.5" /> },
      { labelKey: 'staff',      path: 'md/staff',       icon: <UserCog         className="w-4.5 h-4.5" /> },
      { labelKey: 'profit',     path: 'md/profit',      icon: <TrendingUp      className="w-4.5 h-4.5" /> },
    ],
    director: [
      { labelKey: 'dashboard',    path: 'director/dashboard',    icon: <LayoutDashboard className="w-4.5 h-4.5" /> },
      { labelKey: 'accounting',   path: 'director/accounting',   icon: <Wallet          className="w-4.5 h-4.5" /> },
      { labelKey: 'income',       path: 'director/income',       icon: <TrendingUp      className="w-4.5 h-4.5" /> },
      { labelKey: 'expenses',     path: 'director/expenses',     icon: <TrendingDown    className="w-4.5 h-4.5" /> },
      { labelKey: 'reports',      path: 'director/reports',      icon: <PieChart        className="w-4.5 h-4.5" /> },
      { labelKey: 'audit',        path: 'director/audit',        icon: <FileText        className="w-4.5 h-4.5" /> },
      { labelKey: 'shareholders', path: 'director/shareholders', icon: <Users           className="w-4.5 h-4.5" /> },
      { labelKey: 'profit',       path: 'director/profit',       icon: <TrendingUp      className="w-4.5 h-4.5" /> },
      { labelKey: 'settings',     path: 'director/settings',     icon: <Settings        className="w-4.5 h-4.5" /> },
    ],
    pharmacist: [
      { labelKey: 'dashboard', path: 'pharmacy/dashboard', icon: <LayoutDashboard className="w-4.5 h-4.5" /> },
      { labelKey: 'inventory',  path: 'pharmacy/inventory', icon: <Pill            className="w-4.5 h-4.5" /> },
    ],
  };

  const navItems = roleNavItems[role] ?? roleNavItems.hospital_admin;
  const roleLabel = t(`roleLabels.${role}`, { defaultValue: role });

  // Resolve full path: for super_admin keep absolute, for others prefix with /h/:slug/
  const resolvePath = (path: string) =>
    path.startsWith('/') ? path : `${base}/${path}`;

  return (
    <>
      {/* ── Mobile hamburger ── */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle sidebar"
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-white border border-[var(--color-border)] shadow-card"
      >
        {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* ── Mobile backdrop ── */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 z-30 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-40
        w-64 bg-white dark:bg-slate-900
        border-r border-[var(--color-border)]
        flex flex-col
        transform transition-transform duration-200 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>

        {/* Logo & Brand */}
        <div className="h-16 flex items-center gap-3 px-5 border-b border-[var(--color-border)] shrink-0">
          {/* Teal cross icon */}
          <div className="w-8 h-8 rounded-lg bg-[var(--color-primary)] flex items-center justify-center shrink-0">
            <svg viewBox="0 0 20 20" fill="white" className="w-4 h-4">
              <rect x="8" y="2" width="4" height="16" rx="1"/>
              <rect x="2" y="8" width="16" height="4" rx="1"/>
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[var(--color-primary-dark)] leading-none">HMS SaaS</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5 leading-none">{roleLabel}</p>
          </div>
          {/* Language Toggle */}
          <button
            onClick={toggleLanguage}
            title={lang === 'en' ? 'Switch to Bangla' : 'Switch to English'}
            className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold border border-[var(--color-border)] hover:bg-[var(--color-primary-light)] hover:text-[var(--color-primary-dark)] transition-colors"
          >
            <Globe className="w-3.5 h-3.5" />
            {lang === 'en' ? 'বাং' : 'EN'}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto" aria-label="Main navigation">
          {navItems.map((item) => {
            const fullPath = resolvePath(item.path);
            const isActive = location.pathname === fullPath || location.pathname.startsWith(fullPath + '/');
            return (
              <Link
                key={item.path}
                to={fullPath}
                onClick={() => setIsOpen(false)}
                aria-current={isActive ? 'page' : undefined}
                className={`
                  group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                  transition-colors duration-150 cursor-pointer
                  ${isActive
                    ? 'bg-[var(--color-primary)] text-white shadow-sm'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-primary-light)] hover:text-[var(--color-primary-dark)]'
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
        </nav>

        {/* Logout */}
        <div className="px-3 py-3 border-t border-[var(--color-border)] shrink-0">
          <button
            onClick={onLogout}
            className="btn-danger w-full justify-start text-sm"
          >
            <LogOut className="w-4 h-4" />
            <span>{t('signOut', { ns: 'common' })}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
