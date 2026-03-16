import { useEffect, useState } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function AcceptInvitePage() {
  const { token } = useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!user || status !== 'idle') return;

    const accept = async () => {
      setStatus('loading');
      try {
        const res = await fetch(`/api/cohosts/accept/${token}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        });

        const data = await res.json();

        if (!res.ok) {
          setStatus('error');
          setMessage(data.error || 'Something went wrong.');
          return;
        }

        setStatus('success');
        setMessage('Invite accepted! Redirecting to your dashboard...');
        setTimeout(() => navigate('/host'), 2000);
      } catch (err) {
        setStatus('error');
        setMessage('Network error. Please try again.');
      }
    };

    accept();
  }, [user, status, token, navigate]);

  // Still checking auth
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <div className="spinner" />
      </div>
    );
  }

  // Not logged in — send to login, come back after
  if (!user) {
    return <Navigate to={`/login?redirect=/accept-invite/${token}`} replace />;
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>
        <h2 style={styles.title}>Co-Host Invite</h2>

        {status === 'idle' || status === 'loading' ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
            <div className="spinner" />
          </div>
        ) : status === 'success' ? (
          <>
            <div style={styles.iconSuccess}>✓</div>
            <p style={styles.messageSuccess}>{message}</p>
          </>
        ) : (
          <>
            <div style={styles.iconError}>✕</div>
            <p style={styles.messageError}>{message}</p>
            <button style={styles.button} onClick={() => navigate('/host')}>
              Go to Dashboard
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: '48px 40px',
    width: '100%',
    maxWidth: 420,
    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
    textAlign: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    marginBottom: 24,
    color: '#111',
  },
  iconSuccess: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    backgroundColor: '#d1fae5',
    color: '#065f46',
    fontSize: 24,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px',
  },
  iconError: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    fontSize: 24,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px',
  },
  messageSuccess: {
    color: '#065f46',
    fontSize: 15,
    lineHeight: 1.5,
  },
  messageError: {
    color: '#991b1b',
    fontSize: 15,
    lineHeight: 1.5,
    marginBottom: 20,
  },
  button: {
    padding: '10px 24px',
    backgroundColor: '#4f46e5',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
};