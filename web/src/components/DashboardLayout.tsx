import { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import toast from 'react-hot-toast';
import { useAuth, logout } from '../hooks/useAuth';
import Sidebar from './dashboard/Sidebar';
import Header from './dashboard/Header';

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
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
