import { LogOut, User } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

interface HeaderProps {
  userName?: string;
  userEmail?: string;
  onLogout: () => void;
}

export default function Header({ userName = 'User', userEmail, onLogout }: HeaderProps) {
  return (
    <header className="h-16 bg-[var(--color-bg-card)] border-b border-[var(--color-border)] flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        {/* Mobile spacer */}
        <div className="w-10 lg:hidden"></div>
      </div>

      <div className="flex items-center gap-4">
        <ThemeToggle />
        
        <div className="flex items-center gap-3 pl-4 border-l border-[var(--color-border)]">
          <div className="hidden sm:block text-right">
            <p className="text-sm font-medium text-[var(--color-text-primary)]">{userName}</p>
            {userEmail && (
              <p className="text-xs text-[var(--color-text-muted)]">{userEmail}</p>
            )}
          </div>
          <div className="w-10 h-10 rounded-full bg-[var(--color-primary-light)] flex items-center justify-center">
            <User className="w-5 h-5 text-[var(--color-primary)]" />
          </div>
          <button
            onClick={onLogout}
            className="p-2 rounded-lg hover:bg-[var(--color-border-light)] text-[var(--color-text-muted)] hover:text-red-500 transition-colors"
            title="Logout"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
