import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';

export default function VerifyEmailPage() {
  const [searchParams]        = useSearchParams();
  const token                 = searchParams.get('token');
  const { updateUser, user }  = useAuth();

  const [status, setStatus]   = useState('loading'); // 'loading' | 'success' | 'error'
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('No verification token found in this link.');
      return;
    }
    api.get(`/auth/verify-email?token=${token}`)
      .then(() => {
        setStatus('success');
        // Refresh user data so the banner disappears if they're logged in
        if (user) {
          api.get('/auth/me').then(({ data }) => updateUser(data)).catch(() => {});
        }
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err.response?.data?.message || 'Verification failed. The link may have already been used or expired.');
      });
  }, [token]);

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">
          <h1>🧹 CleanStay</h1>
        </div>

        {status === 'loading' && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 12px' }} />
            <p style={{ color: 'var(--ink-soft)', fontSize: 14 }}>Verifying your email…</p>
          </div>
        )}

        {status === 'success' && (
          <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <p style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>Email verified!</p>
            <p style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.6, marginBottom: 24 }}>
              Your email address has been verified. You're all set.
            </p>
            {user ? (
              <Link to="/host" className="btn btn-primary" style={{ display: 'inline-block' }}>
                Go to dashboard
              </Link>
            ) : (
              <Link to="/login" className="btn btn-primary" style={{ display: 'inline-block' }}>
                Sign in
              </Link>
            )}
          </div>
        )}

        {status === 'error' && (
          <div style={{ padding: '8px 0 16px' }}>
            <div className="alert alert-error" style={{ marginBottom: 20 }}>{message}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {user && !user.emailVerified && (
                <ResendButton />
              )}
              <Link to="/login" className="btn btn-secondary" style={{ textAlign: 'center' }}>
                Back to sign in
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ResendButton() {
  const [sent, setSent]       = useState(false);
  const [loading, setLoading] = useState(false);

  const handleResend = async () => {
    setLoading(true);
    try {
      await api.post('/auth/resend-verification');
      setSent(true);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  return sent ? (
    <p style={{ fontSize: 14, color: '#059669', textAlign: 'center' }}>✓ Verification email sent</p>
  ) : (
    <button className="btn btn-primary" onClick={handleResend} disabled={loading}>
      {loading ? 'Sending…' : 'Resend verification email'}
    </button>
  );
}
