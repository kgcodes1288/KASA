import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect');

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
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

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">
          <h1>🧹 CleanStay</h1>
          <p style={{ marginTop: 6 }}>Airbnb cleaning, organised.</p>
        </div>
        {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
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