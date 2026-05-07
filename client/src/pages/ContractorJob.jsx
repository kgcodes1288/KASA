import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

const STATUS_LABEL = {
  pending:     '⏳ Pending',
  in_progress: '🧹 In progress',
  completed:   '✅ Done',
};

const _rawBase = (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '');
const BASE = _rawBase ? `${_rawBase}/api` : '/api';

export default function ContractorJob() {
  const { token } = useParams();
  const [data, setData]                   = useState(null);
  const [error, setError]                 = useState('');
  const [loading, setLoading]             = useState(true);
  const [expandedRooms, setExpandedRooms] = useState({});
  const [togglingItem, setTogglingItem]   = useState(null);
  const [accepted, setAccepted]           = useState(false);
  const [accepting, setAccepting]         = useState(false);

  useEffect(() => {
    fetch(`${BASE}/public/job/${token}`)
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) setError(body.message || 'Something went wrong');
        else {
          setData(body);
          // If already accepted, reflect that in state
          if (body.tokenStatus === 'ACCEPTED') setAccepted(true);
        }
      })
      .catch(() => setError('network_error'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleAccept = async () => {
    setAccepting(true);
    try {
      const res = await fetch(`${BASE}/public/job/${token}/accept`, { method: 'POST' });
      if (res.ok) setAccepted(true);
    } catch (err) {
      console.error('Failed to accept job', err);
    } finally {
      setAccepting(false);
    }
  };

  const toggleRoom = (jobId) =>
    setExpandedRooms((prev) => ({ ...prev, [jobId]: !prev[jobId] }));

  const handleToggle = async (jobId, itemId, currentCompleted) => {
    setTogglingItem(itemId);
    try {
      await fetch(`${BASE}/public/job/${token}/checklist/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !currentCompleted }),
      });

      setData((prev) => ({
        ...prev,
        rooms: prev.rooms.map((r) => {
          if (r.jobId !== jobId) return r;
          const updatedChecklist = r.checklist.map((ci) =>
            ci.id === itemId ? { ...ci, completed: !currentCompleted } : ci
          );
          const done   = updatedChecklist.filter((c) => c.completed).length;
          const total  = updatedChecklist.length;
          const status = done === total ? 'completed' : done > 0 ? 'in_progress' : 'pending';
          return { ...r, checklist: updatedChecklist, status };
        }),
      }));
    } catch (err) {
      console.error('Failed to toggle item', err);
    } finally {
      setTogglingItem(null);
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
  if (error) {
    const isExpired   = error === 'This link has expired';
    const isWithdrawn = error === 'This job assignment has been withdrawn';
    const isNetwork   = error === 'network_error';

    return (
      <div style={{
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        alignItems: 'center', minHeight: '100vh', background: '#f8fafc', padding: 24,
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>
          {isNetwork ? '📡' : isExpired ? '⏰' : isWithdrawn ? '🚫' : '🔗'}
        </div>
        <h2 style={{ marginBottom: 8, color: '#1e293b' }}>
          {isNetwork ? 'Connection Error' : isExpired ? 'Link Expired' : isWithdrawn ? 'Assignment Withdrawn' : 'Invalid Link'}
        </h2>
        <p style={{ color: '#64748b', textAlign: 'center', maxWidth: 320 }}>
          {isNetwork
            ? 'Could not reach the server. Please check your connection and try again.'
            : isExpired
            ? 'This job link has expired. Please contact the host for a new link.'
            : isWithdrawn
            ? 'This job assignment has been withdrawn by the host. Please contact them directly.'
            : 'This link is invalid or has already been used. Please contact the host.'}
        </p>
        {isNetwork && (
          <button
            className="btn btn-primary"
            style={{ marginTop: 20 }}
            onClick={() => window.location.reload()}
          >
            Try Again
          </button>
        )}
      </div>
    );
  }

  // ── Job Page ─────────────────────────────────────────────────────────────
  const allDone = data.rooms.every((r) => r.status === 'completed');

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '24px 16px' }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>

        {/* Header */}
        <div style={{
          background: '#fff', borderRadius: 16, padding: 24,
          border: '1px solid #e2e8f0', marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🧹</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>
            {data.listing?.name}
          </h1>
          <p style={{ fontSize: 14, color: '#64748b', marginBottom: 2 }}>
            📅 Checkout: {new Date(data.checkoutDate).toLocaleDateString('en-US', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
            })}
          </p>
          {data.listing?.address && (
            <p style={{ fontSize: 13, color: '#94a3b8' }}>📍 {data.listing.address}</p>
          )}

          {/* Accept banner — shown until contractor accepts */}
          {!accepted && (
            <div style={{
              marginTop: 16, padding: '14px 16px',
              background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#1d4ed8', marginBottom: 2 }}>
                  New job assigned to you
                </p>
                <p style={{ fontSize: 12, color: '#3b82f6' }}>
                  Tap Accept to confirm you'll take this job
                </p>
              </div>
              <button
                onClick={handleAccept}
                disabled={accepting}
                style={{
                  background: '#2563eb', color: '#fff', border: 'none',
                  borderRadius: 8, padding: '8px 16px', fontSize: 13,
                  fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >
                {accepting ? 'Accepting…' : '✓ Accept Job'}
              </button>
            </div>
          )}

          {/* Accepted confirmation */}
          {accepted && !allDone && (
            <div style={{
              marginTop: 14, padding: '10px 14px', background: '#d1fae5',
              border: '1px solid #6ee7b7', borderRadius: 10,
              fontSize: 13, fontWeight: 600, color: '#065f46',
            }}>
              ✅ Job accepted — check off tasks as you go
            </div>
          )}

          {/* All done */}
          {allDone && (
            <div style={{
              marginTop: 14, padding: '10px 14px', background: '#d1fae5',
              border: '1px solid #6ee7b7', borderRadius: 10,
              fontSize: 14, fontWeight: 600, color: '#065f46',
            }}>
              ✅ All rooms completed!
            </div>
          )}
        </div>

        {/* Rooms */}
        {data.rooms.map((room) => {
          const isOpen  = expandedRooms[room.jobId] !== false; // open by default
          const done    = room.checklist.filter((c) => c.completed).length;
          const total   = room.checklist.length;

          return (
            <div key={room.jobId} style={{
              background: '#fff', borderRadius: 14, marginBottom: 14,
              border: '1px solid #e2e8f0', overflow: 'hidden',
              boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
            }}>
              {/* Room header */}
              <button
                onClick={() => toggleRoom(room.jobId)}
                style={{
                  width: '100%', padding: '16px 18px', background: 'none',
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', marginBottom: 3 }}>
                    {room.roomName}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    {STATUS_LABEL[room.status]} · {done}/{total} tasks
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {/* Progress pill */}
                  <div style={{
                    width: 60, height: 6, borderRadius: 99,
                    background: '#e2e8f0', overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%', borderRadius: 99,
                      width: `${total > 0 ? (done / total) * 100 : 0}%`,
                      background: room.status === 'completed' ? '#10b981' : '#3b82f6',
                      transition: 'width 0.3s',
                    }} />
                  </div>
                  <span style={{ fontSize: 14, color: '#94a3b8' }}>{isOpen ? '▲' : '▼'}</span>
                </div>
              </button>

              {/* Checklist */}
              {isOpen && (
                <div style={{ borderTop: '1px solid #f1f5f9', padding: '8px 0' }}>
                  {room.checklist.length === 0 ? (
                    <p style={{ padding: '12px 18px', fontSize: 13, color: '#94a3b8' }}>
                      No checklist items for this room.
                    </p>
                  ) : (
                    room.checklist.map((item) => (
                      <label
                        key={item.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '11px 18px', cursor: 'pointer',
                          opacity: togglingItem === item.id ? 0.5 : 1,
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <input
                          type="checkbox"
                          checked={item.completed}
                          disabled={togglingItem === item.id}
                          onChange={() => handleToggle(room.jobId, item.id, item.completed)}
                          style={{ width: 18, height: 18, accentColor: '#10b981', cursor: 'pointer' }}
                        />
                        <span style={{
                          fontSize: 14,
                          color: item.completed ? '#94a3b8' : '#1e293b',
                          textDecoration: item.completed ? 'line-through' : 'none',
                          transition: 'color 0.15s',
                        }}>
                          {item.text}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}

        <p style={{ textAlign: 'center', fontSize: 12, color: '#cbd5e1', marginTop: 24 }}>
          Powered by CleanStay
        </p>
      </div>
    </div>
  );
}
