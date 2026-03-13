import { NavLink, Outlet, useNavigate } from 'react-router';
import { useAuth, logout } from '../hooks/useAuth';
import { useState, useEffect, createContext, useContext } from 'react';

// ─── Theme Context ─────────────────────────────────────────────────────
interface ThemeCtx {
  dark: boolean;
  toggleDark: () => void;
  fontSize: 'small' | 'medium' | 'large';
  cycleFontSize: () => void;
}

const ThemeContext = createContext<ThemeCtx>({
  dark: false, toggleDark: () => {}, fontSize: 'medium', cycleFontSize: () => {},
});

export const usePatientTheme = () => useContext(ThemeContext);

const fontSizes = { small: '13px', medium: '15px', large: '17px' } as const;
const fontSizeLabels = { small: 'A-', medium: 'A', large: 'A+' } as const;

const navItems = [
  { to: '/patient/dashboard', icon: '🏠', label: 'Home' },
  { to: '/patient/appointments', icon: '📅', label: 'Appts' },
  { to: '/patient/book-appointment', icon: '➕', label: 'Book' },
  { to: '/patient/messages', icon: '💬', label: 'Chat' },
  { to: '/patient/timeline', icon: '🕐', label: 'Timeline' },
  { to: '/patient/prescriptions', icon: '💊', label: 'Rx' },
];

export default function PatientPortalLayout() {
  useAuth();
  const navigate = useNavigate();

  const [dark, setDark] = useState(() => localStorage.getItem('pp-dark') === '1');
  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large'>(() => {
    const saved = localStorage.getItem('pp-fontsize');
    return (saved === 'small' || saved === 'large') ? saved : 'medium';
  });

  const toggleDark = () => {
    setDark((d) => {
      localStorage.setItem('pp-dark', d ? '0' : '1');
      return !d;
    });
  };

  const cycleFontSize = () => {
    setFontSize((s) => {
      const next = s === 'small' ? 'medium' : s === 'medium' ? 'large' : 'small';
      localStorage.setItem('pp-fontsize', next);
      return next;
    });
  };

  useEffect(() => {
    document.documentElement.style.fontSize = fontSizes[fontSize];
  }, [fontSize]);

  const handleLogout = () => {
    logout();
    navigate('/patient/login', { replace: true });
  };

  // Theme colors
  const bg = dark ? '#0f172a' : '#f8fafc';
  const navBg = dark ? '#1e293b' : '#fff';
  const navBorder = dark ? '#334155' : '#e2e8f0';
  const activeNavBg = dark ? '#164e63' : '#ecfeff';
  const inactiveColor = dark ? '#64748b' : '#94a3b8';
  const activeColor = dark ? '#22d3ee' : '#0891b2';

  return (
    <ThemeContext.Provider value={{ dark, toggleDark, fontSize, cycleFontSize }}>
      <div style={{
        minHeight: '100vh',
        background: bg,
        fontFamily: "'Inter', system-ui, sans-serif",
        display: 'flex',
        flexDirection: 'column',
        transition: 'background 0.3s, color 0.3s',
        color: dark ? '#e2e8f0' : '#0f172a',
      }}>
        {/* Top header */}
        <header style={{
          background: dark
            ? 'linear-gradient(135deg, #164e63, #065f46)'
            : 'linear-gradient(135deg, #0891b2, #059669)',
          color: '#fff',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '18px', fontWeight: 700,
            }}>🏥</div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 600 }}>Patient Portal</div>
              <div style={{ fontSize: '12px', opacity: 0.8 }}>Your health, your data</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* Font size toggle */}
            <button onClick={cycleFontSize} title={`Font: ${fontSize}`} style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
              padding: '5px 8px', borderRadius: '6px', cursor: 'pointer',
              fontSize: fontSize === 'small' ? '11px' : fontSize === 'large' ? '16px' : '13px',
              fontWeight: 700, lineHeight: 1,
            }}>{fontSizeLabels[fontSize]}</button>

            {/* Dark mode toggle */}
            <button onClick={toggleDark} title={dark ? 'Light mode' : 'Dark mode'} style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
              padding: '5px 8px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px',
            }}>{dark ? '☀️' : '🌙'}</button>

            <NavLink to="/patient/family" style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
              padding: '5px 8px', borderRadius: '6px', fontSize: '14px', textDecoration: 'none',
            }}>👨‍👩‍👧</NavLink>

            <NavLink to="/patient/profile" style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
              padding: '5px 8px', borderRadius: '6px', fontSize: '14px', textDecoration: 'none',
            }}>👤</NavLink>

            <button onClick={handleLogout} style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
              padding: '5px 8px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer',
            }}>Logout</button>
          </div>
        </header>

        {/* Main content */}
        <main style={{
          flex: 1, padding: '16px 16px 80px', maxWidth: '900px',
          width: '100%', margin: '0 auto', boxSizing: 'border-box',
        }}>
          <Outlet />
        </main>

        {/* Bottom navigation */}
        <nav style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: navBg, borderTop: `1px solid ${navBorder}`,
          display: 'flex', justifyContent: 'space-around',
          padding: '6px 0 env(safe-area-inset-bottom, 8px)',
          zIndex: 50, boxShadow: '0 -2px 10px rgba(0,0,0,0.05)',
          transition: 'background 0.3s',
        }}>
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to}
              style={({ isActive }) => ({
                display: 'flex', flexDirection: 'column' as const,
                alignItems: 'center', gap: '2px', padding: '6px 12px',
                fontSize: '10px', fontWeight: isActive ? 600 : 400,
                color: isActive ? activeColor : inactiveColor,
                textDecoration: 'none', transition: 'color 0.2s',
                borderRadius: '8px', background: isActive ? activeNavBg : 'transparent',
              })}
            >
              <span style={{ fontSize: '20px' }}>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </ThemeContext.Provider>
  );
}
