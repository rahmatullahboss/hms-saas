import { Bell, LogOut, User, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import ThemeToggle from './ThemeToggle';

interface HeaderProps {
  userName?: string;
  userEmail?: string;
  userRole?: string;
  onLogout: () => void;
}

export default function Header({
  userName  = 'User',
  userEmail,
  userRole  = '',
  onLogout,
}: HeaderProps) {
  const [showDropdown, setShowDropdown] = useState(false);

  // Grab hospital name from localStorage if set
  const tenant = (() => {
    try { return JSON.parse(localStorage.getItem('tenant') ?? '{}'); }
    catch { return {}; }
  })();
  const hospitalName = tenant?.name ?? 'HMS SaaS';

  return (
    <header className="h-16 bg-white dark:bg-slate-900 border-b border-[var(--color-border)] flex items-center justify-between px-6 shrink-0">

      {/* Left: Hospital Name */}
      <div className="flex items-center gap-3">
        {/* Mobile spacer for hamburger */}
        <div className="w-10 lg:hidden" />
        <span className="font-semibold text-[var(--color-primary-dark)] text-[15px] hidden sm:block">
          {hospitalName}
        </span>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-3">

        {/* Theme toggle */}
        <ThemeToggle />

        {/* Notification bell */}
        <button
          aria-label="Notifications"
          className="relative p-2 rounded-lg hover:bg-[var(--color-border-light)] transition-colors"
        >
          <Bell className="w-5 h-5 text-[var(--color-text-secondary)]" />
          {/* Badge – remove if no notifications logic */}
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white" />
        </button>

        {/* Divider */}
        <div className="w-px h-6 bg-[var(--color-border)]" />

        {/* User dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowDropdown(v => !v)}
            aria-haspopup="menu"
            aria-expanded={showDropdown}
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-[var(--color-border-light)] transition-colors"
          >
            {/* Avatar */}
            <div className="w-8 h-8 rounded-full bg-[var(--color-primary-light)] border border-[var(--color-primary)]/20 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-[var(--color-primary)]" />
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-sm font-medium text-[var(--color-text-primary)] leading-none">{userName}</p>
              {userEmail && (
                <p className="text-xs text-[var(--color-text-muted)] leading-none mt-0.5">{userEmail}</p>
              )}
            </div>
            <ChevronDown className={`w-4 h-4 text-[var(--color-text-muted)] transition-transform duration-150 ${showDropdown ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown menu */}
          {showDropdown && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowDropdown(false)} />
              <div className="absolute right-0 top-full mt-1.5 w-52 bg-white dark:bg-slate-800 border border-[var(--color-border)] rounded-xl shadow-modal z-20 overflow-hidden">
                <div className="px-4 py-3 border-b border-[var(--color-border)]">
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">{userName}</p>
                  {userEmail && <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{userEmail}</p>}
                  {userRole && (
                    <span className="badge badge-primary text-xs mt-1.5 capitalize">
                      {userRole.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
                <div className="p-1.5">
                  <button
                    onClick={() => { setShowDropdown(false); onLogout(); }}
                    className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
