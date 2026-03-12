import { Link, useLocation } from 'react-router';
import {
  LayoutDashboard, Users, FlaskConical, Receipt, Pill,
  UserCog, PieChart, Settings, LogOut, Menu, X,
  Building2, Wallet, TrendingUp, TrendingDown, Repeat,
  BookOpen, FileText, Video, ChevronRight,
  BedDouble, Stethoscope, Calendar, Shield, ClipboardList,
} from 'lucide-react';
import { useState } from 'react';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

interface SidebarProps {
  role: string;
  onLogout: () => void;
}

const roleNavItems: Record<string, NavItem[]> = {
  super_admin: [
    { label: 'Dashboard',  path: '/super_admin/dashboard', icon: <LayoutDashboard className="w-4.5 h-4.5" /> },
    { label: 'Hospitals',  path: '/super_admin/hospitals', icon: <Building2 className="w-4.5 h-4.5" /> },
    { label: 'Settings',   path: '/super_admin/settings',  icon: <Settings className="w-4.5 h-4.5" /> },
  ],
  hospital_admin: [
    { label: 'Dashboard',     path: '/hospital_admin/dashboard',    icon: <LayoutDashboard className="w-4.5 h-4.5" /> },
    { label: 'Appointments',  path: '/hospital_admin/appointments', icon: <BookOpen        className="w-4.5 h-4.5" /> },
    { label: 'Patients',     path: '/hospital_admin/patients',     icon: <Users           className="w-4.5 h-4.5" /> },
    { label: 'Lab / Tests',  path: '/hospital_admin/tests',        icon: <FlaskConical    className="w-4.5 h-4.5" /> },
    { label: 'Billing',      path: '/hospital_admin/billing',      icon: <Receipt         className="w-4.5 h-4.5" /> },
    { label: 'Pharmacy',     path: '/hospital_admin/pharmacy',     icon: <Pill            className="w-4.5 h-4.5" /> },
    { label: 'Telemedicine', path: '/hospital_admin/telemedicine', icon: <Video           className="w-4.5 h-4.5" /> },
    { label: 'Accounting',   path: '/hospital_admin/accounting',   icon: <Wallet          className="w-4.5 h-4.5" /> },
    { label: 'Income',       path: '/hospital_admin/income',       icon: <TrendingUp      className="w-4.5 h-4.5" /> },
    { label: 'Expenses',     path: '/hospital_admin/expenses',     icon: <TrendingDown    className="w-4.5 h-4.5" /> },
    { label: 'Recurring',    path: '/hospital_admin/recurring',    icon: <Repeat          className="w-4.5 h-4.5" /> },
    { label: 'Accounts',     path: '/hospital_admin/accounts',     icon: <BookOpen        className="w-4.5 h-4.5" /> },
    { label: 'Staff',        path: '/hospital_admin/staff',        icon: <UserCog         className="w-4.5 h-4.5" /> },
    { label: 'Shareholders', path: '/hospital_admin/shareholders', icon: <Users           className="w-4.5 h-4.5" /> },
    { label: 'IPD / Admissions', path: '/hospital_admin/admissions', icon: <BedDouble      className="w-4.5 h-4.5" /> },
    { label: 'Beds',         path: '/hospital_admin/beds',         icon: <ClipboardList   className="w-4.5 h-4.5" /> },
    { label: 'Nurse Station', path: '/hospital_admin/nurse-station', icon: <Stethoscope   className="w-4.5 h-4.5" /> },
    { label: 'Doctor Schedule', path: '/hospital_admin/doctor-schedule', icon: <Calendar   className="w-4.5 h-4.5" /> },
    { label: 'Reports',      path: '/hospital_admin/reports',      icon: <PieChart        className="w-4.5 h-4.5" /> },
    { label: 'System Audit', path: '/hospital_admin/system-audit', icon: <Shield          className="w-4.5 h-4.5" /> },
    { label: 'Settings',     path: '/hospital_admin/settings',     icon: <Settings        className="w-4.5 h-4.5" /> },
  ],
  laboratory: [
    { label: 'Dashboard', path: '/laboratory/dashboard', icon: <LayoutDashboard className="w-4.5 h-4.5" /> },
    { label: 'Tests',     path: '/laboratory/tests',     icon: <FlaskConical    className="w-4.5 h-4.5" /> },
  ],
  reception: [
    { label: 'Dashboard',    path: '/reception/dashboard',     icon: <LayoutDashboard className="w-4.5 h-4.5" /> },
    { label: 'Appointments', path: '/reception/appointments',  icon: <BookOpen        className="w-4.5 h-4.5" /> },
    { label: 'Patients',     path: '/reception/patients',      icon: <Users           className="w-4.5 h-4.5" /> },
    { label: 'Billing',      path: '/reception/billing',       icon: <Receipt         className="w-4.5 h-4.5" /> },
  ],
  md: [
    { label: 'Dashboard',  path: '/md/dashboard',  icon: <LayoutDashboard className="w-4.5 h-4.5" /> },
    { label: 'Accounting', path: '/md/accounting', icon: <Wallet          className="w-4.5 h-4.5" /> },
    { label: 'Income',     path: '/md/income',     icon: <TrendingUp      className="w-4.5 h-4.5" /> },
    { label: 'Expenses',   path: '/md/expenses',   icon: <TrendingDown    className="w-4.5 h-4.5" /> },
    { label: 'Recurring',  path: '/md/recurring',  icon: <Repeat          className="w-4.5 h-4.5" /> },
    { label: 'Accounts',   path: '/md/accounts',   icon: <BookOpen        className="w-4.5 h-4.5" /> },
    { label: 'Reports',    path: '/md/reports',    icon: <PieChart        className="w-4.5 h-4.5" /> },
    { label: 'Audit',      path: '/md/audit',      icon: <FileText        className="w-4.5 h-4.5" /> },
    { label: 'Staff',      path: '/md/staff',      icon: <UserCog         className="w-4.5 h-4.5" /> },
    { label: 'Profit',     path: '/md/profit',     icon: <TrendingUp      className="w-4.5 h-4.5" /> },
  ],
  director: [
    { label: 'Dashboard',   path: '/director/dashboard',   icon: <LayoutDashboard className="w-4.5 h-4.5" /> },
    { label: 'Accounting',  path: '/director/accounting',  icon: <Wallet          className="w-4.5 h-4.5" /> },
    { label: 'Income',      path: '/director/income',      icon: <TrendingUp      className="w-4.5 h-4.5" /> },
    { label: 'Expenses',    path: '/director/expenses',    icon: <TrendingDown    className="w-4.5 h-4.5" /> },
    { label: 'Reports',     path: '/director/reports',     icon: <PieChart        className="w-4.5 h-4.5" /> },
    { label: 'Audit',       path: '/director/audit',       icon: <FileText        className="w-4.5 h-4.5" /> },
    { label: 'Shareholders',path: '/director/shareholders',icon: <Users           className="w-4.5 h-4.5" /> },
    { label: 'Profit',      path: '/director/profit',      icon: <TrendingUp      className="w-4.5 h-4.5" /> },
    { label: 'Settings',    path: '/director/settings',    icon: <Settings        className="w-4.5 h-4.5" /> },
  ],
  pharmacist: [
    { label: 'Dashboard', path: '/pharmacy/dashboard', icon: <LayoutDashboard className="w-4.5 h-4.5" /> },
    { label: 'Inventory',  path: '/pharmacy/inventory', icon: <Pill            className="w-4.5 h-4.5" /> },
  ],
};

const ROLE_LABELS: Record<string, string> = {
  hospital_admin: 'Admin',
  super_admin:    'Super Admin',
  laboratory:     'Lab',
  reception:      'Reception',
  md:             'MD',
  director:       'Director',
  pharmacist:     'Pharmacist',
};

export default function Sidebar({ role, onLogout }: SidebarProps) {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const navItems = roleNavItems[role] ?? roleNavItems.hospital_admin;

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
          <div className="min-w-0">
            <p className="text-sm font-bold text-[var(--color-primary-dark)] leading-none">HMS SaaS</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5 leading-none">{ROLE_LABELS[role] ?? role}</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto" aria-label="Main navigation">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
            return (
              <Link
                key={item.path}
                to={item.path}
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
                <span className="truncate">{item.label}</span>
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
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
