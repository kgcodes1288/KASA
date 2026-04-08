import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { unreadCount } = useNotifications();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="navbar-brand" style={{ textDecoration: 'none' }}>
          🧹 CleanStay<span className="dot">.</span>
        </Link>
        <div className="navbar-spacer" />
        {user && (
          <>
            {user.role === 'host' && (
              <NavLink to="/host" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                My Listings
              </NavLink>
            )}
            {user.role === 'cleaner' && (
              <NavLink to="/cleaner" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                My Jobs
              </NavLink>
            )}
            <Link
              to="/account"
              className="badge"
              style={{
                background: 'var(--bg)',
                border: '1.5px solid var(--border)',
                fontSize: 13,
                textDecoration: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              👤 {user.name}
              {unreadCount > 0 && (
                <span style={{
                  background: '#ef4444',
                  color: '#fff',
                  borderRadius: '50%',
                  fontSize: 11,
                  fontWeight: 700,
                  minWidth: 18,
                  height: 18,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 4px',
                }}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </Link>
            <span className={`badge badge-${user.role}`}>{user.role}</span>
            <button className="btn btn-secondary btn-sm" onClick={handleLogout}>
              Sign out
            </button>
          </>
        )}
      </div>
    </nav>
  );
}