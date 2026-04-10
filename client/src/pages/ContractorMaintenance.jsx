import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

const BASE = import.meta.env.VITE_API_URL || '/api';

export default function ContractorMaintenance() {
  const { token } = useParams();
  const [data, setData]         = useState(null);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(true);
  const [completing, setCompleting] = useState(false);
  const [done, setDone]         = useState(false);

  useEffect(() => {
    fetch(`${BASE}/public/maintenance/${token}`)
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) setError(body.message || 'Something went wrong');
        else {
          setData(body);
          if (body.status === 'COMPLETED') setDone(true);
        }
      })
      .catch(() => setError('Something went wrong'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleComplete = async () => {
    setCompleting(true);
    try {
      const res = await fetch(`${BASE}/public/maintenance/${token}/complete`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        setDone(true);
      } else {
        const body = await res.json();
        setError(body.message || 'Failed to mark complete');
      }
    } catch {
      setError('Something went wrong');
    } finally {
      setCompleting(false);
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      minHeight: '100vh', background: '#f8fafc',
    }}>
      <div className="spinner" />
    </div>
  );

  // ── Error ────────────────────────────────────────────────────────────────
  if (error) return (
    <div style={{
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      alignItems: 'center', minHeight: '100vh', background: '#f8fafc', padding: 24,
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
      <h2 style={{ marginBottom: 8, color: '#1e293b' }}>
        {error === 'This link has expired' ? 'Link Expired' : 'Invalid Link'}
      </h2>
      <p style={{ color: '#64748b', textAlign: 'center', maxWidth: 320 }}>
        {error === 'This link has expired'
          ? 'This maintenance link has expired. Please contact the host for a new one.'
          : 'This link is invalid. Please contact the host.'}
      </p>
    </div>
  );

  // ── Task Page ─────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '24px 16px' }}>
      <div style={{ maxWidth: 540, margin: '0 auto' }}>

        {/* Header card */}
        <div style={{
          background: '#fff', borderRadius: 16, padding: 24,
          border: '1px solid #e2e8f0', marginBottom: 16,
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🔧</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>
            {data.title}
          </h1>
          <p style={{ fontSize: 14, color: '#64748b', marginBottom: 2 }}>
            🏠 {data.listingName}
          </p>
          {data.listingAddress && (
            <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 2 }}>
              📍 {data.listingAddress}
            </p>
          )}
          {data.roomName && (
            <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 2 }}>
              🛏 {data.roomName}
            </p>
          )}
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 8 }}>
            📅 Due: {new Date(data.nextDueAt).toLocaleDateString('en-US', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
            })}
          </p>
        </div>

        {/* Notes card */}
        {data.notes && (
          <div style={{
            background: '#fffbeb', borderRadius: 12, padding: '14px 18px',
            border: '1px solid #fde68a', marginBottom: 16,
          }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#92400e', marginBottom: 4 }}>
              📋 Notes
            </p>
            <p style={{ fontSize: 14, color: '#78350f', lineHeight: 1.6 }}>
              {data.notes}
            </p>
          </div>
        )}

        {/* Complete button / done state */}
        {done ? (
          <div style={{
            background: '#d1fae5', borderRadius: 12, padding: '20px 24px',
            border: '1px solid #6ee7b7', textAlign: 'center',
          }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#065f46', marginBottom: 4 }}>
              Task Completed!
            </p>
            <p style={{ fontSize: 13, color: '#047857' }}>
              The host has been notified. Thank you!
            </p>
          </div>
        ) : (
          <button
            onClick={handleComplete}
            disabled={completing}
            style={{
              width: '100%',
              padding: '16px',
              background: completing ? '#94a3b8' : '#0d9488',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              fontSize: 16,
              fontWeight: 700,
              cursor: completing ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {completing ? 'Marking complete…' : '✅ Mark as Complete'}
          </button>
        )}

        <p style={{ textAlign: 'center', fontSize: 12, color: '#cbd5e1', marginTop: 24 }}>
          Powered by CleanStay
        </p>
      </div>
    </div>
  );
}
