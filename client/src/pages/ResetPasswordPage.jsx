import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api';

export default function ResetPasswordPage() {
  const [searchParams]            = useSearchParams();
  const token                     = searchParams.get('token');
  const navigate                  = useNavigate();

  const [newPassword, setNew]     = useState('');
  const [confirm, setConfirm]     = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState(false);

  const mismatch = confirm.length > 0 && newPassword !== confirm;

  if (!token) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-logo"><h1>🧹 CleanStay</h1></div>
          <div className="alert alert-error">
            Invalid reset link. Please request a new one.
          </div>
          <div className="divider" />
          <p style={{ textAlign: 'center', fontSize: 14 }}>
            <Link to="/forgot-password">Request a new link</Link>
          </p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (mismatch) return;
    setError(''); setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword });
      setSuccess(true);
      setTimeout(() => navigate('/login?reset=1'), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Reset failed. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">
          <h1>🧹 CleanStay</h1>
          <p style={{ marginTop: 6 }}>Choose a new password</p>
        </div>

        {success ? (
          <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <p style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>Password reset!</p>
            <p style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.6, marginBottom: 24 }}>
              Your password has been updated. Redirecting you to sign in…
            </p>
            <Link to="/login" className="btn btn-primary" style={{ display: 'inline-block' }}>
              Sign in now
            </Link>
          </div>
        ) : (
          <>
            {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>New password</label>
                <input
                  className="input"
                  type="password"
                  placeholder="At least 6 characters"
                  value={newPassword}
                  onChange={(e) => setNew(e.target.value)}
                  minLength={6}
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Confirm new password</label>
                <input
                  className="input"
                  type="password"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  style={{
                    borderColor: mismatch ? '#ef4444' : '',
                    boxShadow: mismatch ? '0 0 0 3px rgba(239,68,68,0.15)' : '',
                  }}
                  required
                />
                {mismatch && <p className="field-error">Passwords do not match</p>}
              </div>
              <button
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
                disabled={loading || mismatch}
              >
                {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Set new password'}
              </button>
            </form>
            <div className="divider" />
            <p style={{ textAlign: 'center', fontSize: 14 }}>
              <Link to="/login">Back to sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
