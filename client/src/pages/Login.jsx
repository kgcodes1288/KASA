import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect');
  const googleError = searchParams.get('error') === 'google_failed';
  const googleMsg = searchParams.get('msg');

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(googleError ? (googleMsg ? `Google sign-in failed: ${googleMsg}` : 'Google sign-in failed. Please try again.') : '');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const user = await login(form.email, form.password);
      if (redirect) {
        navigate(redirect);
      } else {
        navigate(user.role === 'host' ? '/host' : '/cleaner');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = `${API_BASE}/auth/google`;
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">
          <h1>🧹 CleanStay</h1>
          <p style={{ marginTop: 6 }}>Airbnb cleaning, organised.</p>
        </div>
        {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

        {/* Google Sign-In */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: '10px 16px',
            border: '1.5px solid #dadce0',
            borderRadius: 8,
            background: '#fff',
            color: '#3c4043',
            fontSize: 15,
            fontWeight: 500,
            cursor: 'pointer',
            marginBottom: 16,
          }}
        >
          <GoogleIcon />
          Continue with Google
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <hr style={{ flex: 1, border: 'none', borderTop: '1px solid var(--border)' }} />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>or</span>
          <hr style={{ flex: 1, border: 'none', borderTop: '1px solid var(--border)' }} />
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input className="input" type="email" placeholder="you@example.com" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input className="input" type="password" placeholder="••••••••" value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </div>
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
            {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Sign in'}
          </button>
        </form>
        <div className="divider" />
        <p style={{ textAlign: 'center', fontSize: 14 }}>
          Don't have an account? <Link to="/register">Create one</Link>
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}
