import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { loginWithToken } = useAuth();

  useEffect(() => {
    const token = searchParams.get('token');
    const error = searchParams.get('error');

    if (error || !token) {
      navigate('/login?error=google_failed');
      return;
    }

    // Store token and fetch user profile
    localStorage.setItem('token', token);
    api.get('/auth/me')
      .then(({ data }) => {
        loginWithToken(token, data);
        navigate(data.role === 'host' ? '/host' : '/cleaner');
      })
      .catch(() => {
        localStorage.removeItem('token');
        navigate('/login?error=google_failed');
      });
  }, []);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 16px' }} />
        <p style={{ color: 'var(--text-secondary)' }}>Signing you in…</p>
      </div>
    </div>
  );
}
