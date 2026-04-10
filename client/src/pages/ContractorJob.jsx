import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

const STATUS_LABEL = {
  pending:     '⏳ Pending',
  in_progress: '🧹 In progress',
  completed:   '✅ Done',
};

const BASE = import.meta.env.VITE_API_URL || '/api';

export default function ContractorJob() {
  const { token } = useParams();
  const [data, setData]                   = useState(null);
  const [error, setError]                 = useState('');
  const [loading, setLoading]             = useState(true);
  const [expandedRooms, setExpandedRooms] = useState({});
  const [togglingItem, setTogglingItem]   = useState(null);

  useEffect(() => {
    fetch(`${BASE}/public/job/${token}`)
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) setError(body.message || 'Something went wrong');
        else setData(body);
      })
      .catch(() => setError('Something went wrong'))
      .finally(() => setLoading(false));
  }, [token]);

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
          ? 'This job link has expired. Please contact the host for a new link.'
          : 'This link is invalid or has already been used. Please contact the host.'}
      </p>
    </div>
  );

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
            {data.listingName}
          </h1>
          <p style={{ fontSize: 14, color: '#64748b', marginBottom: 2 }}>
            📅 Checkout: {new Date(data.checkoutDate).toLocaleDateString('en-US', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
            })}
          </p>
          {data.listingAddress && (
            <p style={{ fontSize: 13, color: '#94a3b8' }}>📍 {data.listingAddress}</p>
          )}
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
