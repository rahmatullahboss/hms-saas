import { Link, useLocation } from 'react-router';
import { 
  LayoutDashboard, Users, FlaskConical, Receipt, Pill, 
  UserCog, PieChart, Settings, LogOut, Menu, X,
  Building2, Wallet, TrendingUp, TrendingDown, Repeat, BookOpen, FileText,
  Bed, RefreshCcw, FileX, ShieldPlus, ArrowLeftRight, HandCoins,
  PiggyBank, Activity, AlertTriangle, ChevronDown, ChevronRight
} from 'lucide-react';
import { useState } from 'react';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

interface NavGroup {
  label: string;
  icon: React.ReactNode;
  items: NavItem[];
  /** If provided, clicking the group header also navigates here */
  headerPath?: string;
}

type NavEntry = NavItem | NavGroup;

function isGroup(e: NavEntry): e is NavGroup {
  return 'items' in e;
}

interface SidebarProps {
  role: string;
  onLogout: () => void;
}

// ─── Billing sub-items (reused across roles) ──────────────────────────────────
const billingSubItems = (prefix: string): NavItem[] => [
  { label: 'General Billing', path: `/${prefix}/billing`,           icon: <Receipt className="w-4 h-4" /> },
  { label: 'IP Billing',      path: `/${prefix}/billing/ip`,        icon: <Bed className="w-4 h-4" /> },
  { label: 'Settlements',     path: `/${prefix}/billing/settlements`, icon: <ArrowLeftRight className="w-4 h-4" /> },
  { label: 'Credit Notes',    path: `/${prefix}/billing/credit-notes`, icon: <RefreshCcw className="w-4 h-4" /> },
  { label: 'Insurance',       path: `/${prefix}/billing/insurance`, icon: <ShieldPlus className="w-4 h-4" /> },
  { label: 'Cash Handover',   path: `/${prefix}/billing/handover`,  icon: <HandCoins className="w-4 h-4" /> },
  { label: 'Cancellation',    path: `/${prefix}/billing/cancellation`, icon: <FileX className="w-4 h-4" /> },
  { label: 'Deposits',        path: `/${prefix}/billing/deposits`,  icon: <PiggyBank className="w-4 h-4" /> },
];

const clinicalSubItems = (prefix: string): NavItem[] => [
  { label: 'Vitals',    path: `/${prefix}/clinical/vitals`,    icon: <Activity className="w-4 h-4" /> },
  { label: 'Allergies', path: `/${prefix}/clinical/allergies`, icon: <AlertTriangle className="w-4 h-4" /> },
];

// ─── Role nav definitions ──────────────────────────────────────────────────────
const roleNavEntries: Record<string, NavEntry[]> = {
  super_admin: [
    { label: 'Dashboard', path: '/super_admin/dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
    { label: 'Hospitals',  path: '/super_admin/hospitals',  icon: <Building2 className="w-5 h-5" /> },
    { label: 'Settings',   path: '/super_admin/settings',   icon: <Settings className="w-5 h-5" /> },
  ],

  hospital_admin: [
    { label: 'Dashboard', path: '/hospital_admin/dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
    { label: 'Patients',  path: '/hospital_admin/patients',  icon: <Users className="w-5 h-5" /> },
    { label: 'Tests/Lab', path: '/hospital_admin/tests',     icon: <FlaskConical className="w-5 h-5" /> },
    // Billing group
    {
      label: 'Billing', icon: <Receipt className="w-5 h-5" />,
      items: billingSubItems('hospital_admin'),
    },
    // Clinical group
    {
      label: 'Clinical', icon: <Activity className="w-5 h-5" />,
      items: clinicalSubItems('hospital_admin'),
    },
    { label: 'Pharmacy',    path: '/hospital_admin/pharmacy',    icon: <Pill className="w-5 h-5" /> },
    { label: 'Accounting',  path: '/hospital_admin/accounting',  icon: <Wallet className="w-5 h-5" /> },
    { label: 'Income',      path: '/hospital_admin/income',      icon: <TrendingUp className="w-5 h-5" /> },
    { label: 'Expenses',    path: '/hospital_admin/expenses',    icon: <TrendingDown className="w-5 h-5" /> },
    { label: 'Recurring',   path: '/hospital_admin/recurring',   icon: <Repeat className="w-5 h-5" /> },
    { label: 'Accounts',    path: '/hospital_admin/accounts',    icon: <BookOpen className="w-5 h-5" /> },
    { label: 'Staff',       path: '/hospital_admin/staff',       icon: <UserCog className="w-5 h-5" /> },
    { label: 'Shareholders', path: '/hospital_admin/shareholders', icon: <Wallet className="w-5 h-5" /> },
    { label: 'Reports',     path: '/hospital_admin/reports',     icon: <PieChart className="w-5 h-5" /> },
    { label: 'Audit',       path: '/hospital_admin/audit',       icon: <FileText className="w-5 h-5" /> },
    { label: 'Settings',    path: '/hospital_admin/settings',    icon: <Settings className="w-5 h-5" /> },
  ],

  laboratory: [
    { label: 'Dashboard', path: '/laboratory/dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
    { label: 'Tests',     path: '/laboratory/tests',     icon: <FlaskConical className="w-5 h-5" /> },
  ],

  reception: [
    { label: 'Dashboard', path: '/reception/dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
    { label: 'Patients',  path: '/reception/patients',  icon: <Users className="w-5 h-5" /> },
    {
      label: 'Billing', icon: <Receipt className="w-5 h-5" />,
      items: billingSubItems('reception'),
    },
    {
      label: 'Clinical', icon: <Activity className="w-5 h-5" />,
      items: clinicalSubItems('reception'),
    },
  ],

  md: [
    { label: 'Dashboard',  path: '/md/dashboard',  icon: <LayoutDashboard className="w-5 h-5" /> },
    {
      label: 'Billing', icon: <Receipt className="w-5 h-5" />,
      items: [
        { label: 'IP Billing',  path: '/md/billing/ip',          icon: <Bed className="w-4 h-4" /> },
        { label: 'Settlements', path: '/md/billing/settlements',  icon: <ArrowLeftRight className="w-4 h-4" /> },
        { label: 'Insurance',   path: '/md/billing/insurance',    icon: <ShieldPlus className="w-4 h-4" /> },
        { label: 'Handover',    path: '/md/billing/handover',     icon: <HandCoins className="w-4 h-4" /> },
      ],
    },
    { label: 'Accounting', path: '/md/accounting', icon: <Wallet className="w-5 h-5" /> },
    { label: 'Income',     path: '/md/income',     icon: <TrendingUp className="w-5 h-5" /> },
    { label: 'Expenses',   path: '/md/expenses',   icon: <TrendingDown className="w-5 h-5" /> },
    { label: 'Recurring',  path: '/md/recurring',  icon: <Repeat className="w-5 h-5" /> },
    { label: 'Accounts',   path: '/md/accounts',   icon: <BookOpen className="w-5 h-5" /> },
    { label: 'Reports',    path: '/md/reports',    icon: <PieChart className="w-5 h-5" /> },
    { label: 'Audit',      path: '/md/audit',      icon: <FileText className="w-5 h-5" /> },
    { label: 'Staff',      path: '/md/staff',      icon: <UserCog className="w-5 h-5" /> },
    { label: 'Profit',     path: '/md/profit',     icon: <TrendingUp className="w-5 h-5" /> },
  ],

  director: [
    { label: 'Dashboard',    path: '/director/dashboard',    icon: <LayoutDashboard className="w-5 h-5" /> },
    { label: 'Accounting',   path: '/director/accounting',   icon: <Wallet className="w-5 h-5" /> },
    { label: 'Income',       path: '/director/income',       icon: <TrendingUp className="w-5 h-5" /> },
    { label: 'Expenses',     path: '/director/expenses',     icon: <TrendingDown className="w-5 h-5" /> },
    { label: 'Recurring',    path: '/director/recurring',    icon: <Repeat className="w-5 h-5" /> },
    { label: 'Accounts',     path: '/director/accounts',     icon: <BookOpen className="w-5 h-5" /> },
    { label: 'Reports',      path: '/director/reports',      icon: <PieChart className="w-5 h-5" /> },
    { label: 'Audit',        path: '/director/audit',        icon: <FileText className="w-5 h-5" /> },
    { label: 'Shareholders', path: '/director/shareholders', icon: <Wallet className="w-5 h-5" /> },
    { label: 'Profit',       path: '/director/profit',       icon: <TrendingUp className="w-5 h-5" /> },
    { label: 'Settings',     path: '/director/settings',     icon: <Settings className="w-5 h-5" /> },
  ],
};

// ─── NavGroup component ────────────────────────────────────────────────────────
function NavGroupItem({ group }: { group: NavGroup }) {
  const location = useLocation();
  const isAnyChildActive = group.items.some(item => location.pathname === item.path || location.pathname.startsWith(item.path + '/'));
  const [open, setOpen] = useState(isAnyChildActive);

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className={`
          flex items-center gap-3 px-3 py-2.5 w-full rounded-lg transition-colors text-left
          ${isAnyChildActive
            ? 'text-[var(--color-primary)] bg-[var(--color-primary-light,rgba(13,148,136,0.1))]'
            : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-border-light)] hover:text-[var(--color-text-primary)]'}
        `}
      >
        {group.icon}
        <span className="font-medium flex-1">{group.label}</span>
        {open
          ? <ChevronDown className="w-4 h-4 opacity-60" />
          : <ChevronRight className="w-4 h-4 opacity-60" />}
      </button>
      {open && (
        <div className="ml-4 pl-3 mt-0.5 space-y-0.5 border-l-2 border-[var(--color-border)]">
          {group.items.map(item => {
            const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`
                  flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors text-sm
                  ${isActive
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-border-light)] hover:text-[var(--color-text-primary)]'}
                `}
              >
                {item.icon}
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Sidebar ──────────────────────────────────────────────────────────────
export default function Sidebar({ role, onLogout }: SidebarProps) {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);

  const navEntries = roleNavEntries[role] || roleNavEntries.hospital_admin;

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-[var(--color-bg-card)] shadow-lg"
      >
        {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* Backdrop */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-40
        w-64 bg-[var(--color-bg-card)] border-r border-[var(--color-border)]
        transform transition-transform duration-200 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        flex flex-col
      `}>
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-[var(--color-border)]">
          <h1 className="text-xl font-bold text-[var(--color-primary)]">HMS</h1>
          <span className="ml-2 text-xs text-[var(--color-text-muted)] capitalize">
            {role.replace(/_/g, ' ')}
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navEntries.map((entry, idx) => {
            if (isGroup(entry)) {
              return <NavGroupItem key={idx} group={entry} />;
            }
            const isActive = location.pathname === entry.path || location.pathname.startsWith(entry.path + '/');
            return (
              <Link
                key={entry.path}
                to={entry.path}
                onClick={() => setIsOpen(false)}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors
                  ${isActive
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-border-light)] hover:text-[var(--color-text-primary)]'}
                `}
              >
                {entry.icon}
                <span className="font-medium">{entry.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="px-3 py-4 border-t border-[var(--color-border)]">
          <button
            onClick={onLogout}
            className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}
