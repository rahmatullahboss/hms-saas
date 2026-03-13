import { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import toast from 'react-hot-toast';
import { useAuth, logout } from '../hooks/useAuth';
import Sidebar from './dashboard/Sidebar';
import Header from './dashboard/Header';
import SyncStatusBar from './SyncStatusBar';

interface DashboardLayoutProps {
  children: ReactNode;
  role: string;
}

/**
 * DashboardLayout — shell for every authenticated dashboard page.
 *
 * Auth is already enforced by ProtectedRoute (wrapper route element).
 * This layout reads user info from the JWT via useAuth() — no separate
 * localStorage check needed, no redundant redirect.
 */
export default function DashboardLayout({ children, role }: DashboardLayoutProps) {
  const { user } = useAuth();
  const navigate = useNavigate();

  // We intentionally do NOT auto-scroll `<main>` to top on every pathname
  // change. React Router's `preventScrollReset` on sidebar `<Link>` already
  // keeps window scroll stable. If specific pages need to scroll to top on
  // mount, they can call `window.scrollTo(0, 0)` themselves.

  const handleLogout = () => {
    logout();
    toast.success('Signed out');
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <div className="flex h-screen overflow-hidden">
        <Sidebar role={role} onLogout={handleLogout} />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Header
            userName={user?.userId ?? 'User'}
            userEmail=""
            userRole={user?.role ?? role}
            onLogout={handleLogout}
          />
          <main className="flex-1 overflow-y-auto p-6">
            {/* Offline / sync indicator — only visible when there's something to report */}
            <div className="mb-4">
              <SyncStatusBar />
            </div>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

