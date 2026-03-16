import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

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
            {/* ── NEW ── */}
            <NavLink to="/account" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              My Account
            </NavLink>
            <span className="badge" style={{ background: 'var(--bg)', border: '1.5px solid var(--border)', fontSize: 13 }}>
              {user.name}
            </span>
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
