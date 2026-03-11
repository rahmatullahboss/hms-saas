import { useState, useEffect, ReactNode } from 'react';
import { useNavigate } from 'react-router';
import toast from 'react-hot-toast';
import Sidebar from './dashboard/Sidebar';
import Header from './dashboard/Header';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  tenantId?: string;
}

interface DashboardLayoutProps {
  children: ReactNode;
  role: string;
}

export default function DashboardLayout({ children, role }: DashboardLayoutProps) {
  const [user, setUser] = useState<User | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const token   = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (!token) { navigate('/login'); return; }
    if (userStr) {
      try { setUser(JSON.parse(userStr)); }
      catch { setUser({ id: '1', name: 'User', email: 'user@hms.com', role }); }
    } else {
      setUser({ id: '1', name: 'User', email: 'user@hms.com', role });
    }
  }, [navigate, role]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('tenant');
    toast.success('Signed out');
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <div className="flex h-screen overflow-hidden">
        <Sidebar role={role} onLogout={handleLogout} />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Header
            userName={user?.name ?? 'User'}
            userEmail={user?.email}
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
