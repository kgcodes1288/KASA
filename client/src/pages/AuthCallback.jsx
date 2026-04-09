import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { loginWithToken } = useAuth();
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    const error = searchParams.get('error');
    const msg = searchParams.get('msg');

    if (error) {
      setErrorMsg(msg ? `Google sign-in failed: ${msg}` : 'Google sign-in failed. Please try again.');
      return;
    }

    if (!token) {
      setErrorMsg('No token received from Google. Please try again.');
      return;
    }

    localStorage.setItem('token', token);
    api.get('/auth/me')
      .then(({ data }) => {
        loginWithToken(token, data);
        navigate(data.role === 'host' ? '/host' : '/cleaner');
      })
      .catch((err) => {
        localStorage.removeItem('token');
        const detail = err?.response?.data?.message || err?.message || 'Unknown error';
        setErrorMsg(`Sign-in failed: ${detail}`);
      });
  }, []);

  if (errorMsg) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f4f4f5' }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: '40px 32px', maxWidth: 420, width: '100%', textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <p style={{ color: '#991b1b', fontSize: 15, marginBottom: 20 }}>{errorMsg}</p>
          <button className="btn btn-primary" onClick={() => navigate('/login')}>
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 16px' }} />
        <p style={{ color: 'var(--text-secondary)' }}>Signing you in…</p>
      </div>
    </div>
  );
}
