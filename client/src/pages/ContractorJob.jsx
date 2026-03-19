import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

const STATUS_LABEL = {
  pending:     '⏳ Pending',
  in_progress: '🧹 In progress',
  completed:   '✅ Done',
};

export default function ContractorJob() {
  const { token } = useParams();
  const [data, setData]                   = useState(null);
  const [error, setError]                 = useState('');
  const [loading, setLoading]             = useState(true);
  const [expandedRooms, setExpandedRooms] = useState({});
  const [togglingItem, setTogglingItem]   = useState(null);

  const apiBase = import.meta.env.VITE_API_URL || '/api';

  useEffect(() => {
    fetch(`${apiBase}/public/job/${token}`)
      .then((res) => res.json().then((d) => ({ ok: res.ok, data: d })))
      .then(({ ok, data }) => {
        if (!ok) setError(data.message || 'Something went wrong');
        else setData(data);
      })
      .catch(() => setError('Something went wrong'))
      .finally(() => setLoading(false));
  }, [token]);

  const toggleRoom = (jobId) =>
    setExpandedRooms((prev) => ({ ...prev, [jobId]: !prev[jobId] }));

  const handleToggle = async (jobId, itemId, currentCompleted) => {
    setTogglingItem(itemId);
    try {
      const res = await fetch(`${apiBase}/public/job/${token}/checklist/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !currentCompleted }),
      });
      if (!res.ok) throw new Error('Failed to update');

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

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center',
      minHeight: '100vh', background: '#f8fafc' }}>
      <div className="spinner" />
    </div>
  );

  if (error) return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center',
      alignItems: 'center', minHeight: '100vh', background: '#f8fafc', padding: 24 }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
      <h2 style={{ marginBottom: 8, color: '#1e293b' }}>
        {error === 'This link has expired' ? 'Link Expired' : 'Invalid Link'}
      </h2>
      <p style={{ color: '#64748b', textAlign: 'center' }}>
        {error === 'This link has expired'
          ? 'This job link has expired. Please contact the host for a new one.'
          : 'This link is invalid or has been removed.'}
      </p>
    </div>
  );

  const { listing, checkoutDate, rooms } = data;
  const allDone    = rooms.every((r) => r.status === 'completed');
  const totalTasks = rooms.reduce((acc, r) => acc + r.checklist.length, 0);
  const doneTasks  = rooms.reduce((acc, r) => acc + r.checklist.filter((c) => c.completed).length, 0);

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '24px 16px' }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ background: '#fff', borderRadius: 14, padding: '20px 24px',
          marginBottom: 16, border: '1px solid #e2e8f0',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 22 }}>🧹</span>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>
              Cleaning Job
            </h1>
          </div>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#334155', marginBottom: 2 }}>
            {listing.name}
          </p>
          {listing.address && (
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 6 }}>
              📍 {listing.address}
            </p>
          )}
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
            📅 Checkout: {new Date(checkoutDate).toLocaleDateString(undefined, {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            })}
          </p>

          {/* Progress bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              {doneTasks} of {totalTasks} tasks completed
            </span>
            <span style={{ fontSize: 12, fontWeight: 600,
              color: allDone ? '#15803d' : '#0369a1' }}>
              {allDone ? '✅ All done!' : `${Math.round((doneTasks / totalTasks) * 100) || 0}%`}
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 99, background: '#e2e8f0', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              borderRadius: 99,
              background: allDone ? '#22c55e' : '#3b82f6',
              width: `${totalTasks ? (doneTasks / totalTasks) * 100 : 0}%`,
              transition: 'width 0.3s ease',
            }} />
          </div>
        </div>

        {/* Room list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rooms.map((r) => {
            const isOpen    = !!expandedRooms[r.jobId];
            const roomDone  = r.status === 'completed';
            const doneCount = r.checklist.filter((c) => c.completed).length;

            return (
              <div key={r.jobId} style={{ background: '#fff', borderRadius: 12,
                border: roomDone ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>

                {/* Room header */}
                <div
                  onClick={() => toggleRoom(r.jobId)}
                  style={{ display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', padding: '14px 18px',
                    background: roomDone ? '#f0fdf4' : '#fff',
                    cursor: 'pointer', userSelect: 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 18 }}>🛏</span>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 600,
                        color: roomDone ? '#15803d' : '#1e293b', margin: 0 }}>
                        {r.roomName}
                      </p>
                      <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
                        {doneCount}/{r.checklist.length} tasks done
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99,
                      fontWeight: 600,
                      background: roomDone ? '#dcfce7' : '#eff6ff',
                      color: roomDone ? '#15803d' : '#1d4ed8' }}>
                      {STATUS_LABEL[r.status]}
                    </span>
                    <span style={{ fontSize: 13, color: '#94a3b8' }}>
                      {isOpen ? '▲' : '▼'}
                    </span>
                  </div>
                </div>

                {/* Expanded checklist */}
                {isOpen && (
                  <div style={{ padding: '12px 18px', borderTop: '1px solid #f1f5f9' }}>
                    {r.checklist.length === 0 ? (
                      <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
                        No tasks for this room.
                      </p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {r.checklist.map((ci) => (
                          <label key={ci.id}
                            style={{ display: 'flex', alignItems: 'center', gap: 12,
                              cursor: togglingItem === ci.id ? 'wait' : 'pointer',
                              opacity: togglingItem === ci.id ? 0.5 : 1 }}>
                            <input
                              type="checkbox"
                              checked={!!ci.completed}
                              disabled={togglingItem === ci.id}
                              onChange={() => handleToggle(r.jobId, ci.id, ci.completed)}
                              style={{ width: 18, height: 18, cursor: 'pointer',
                                flexShrink: 0, accentColor: '#22c55e' }}
                            />
                            <span style={{ fontSize: 14, color: '#334155',
                              textDecoration: ci.completed ? 'line-through' : 'none',
                              opacity: ci.completed ? 0.45 : 1 }}>
                              {ci.text}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* All done banner */}
        {allDone && (
          <div style={{ marginTop: 20, padding: '18px 24px', borderRadius: 12,
            background: '#f0fdf4', border: '1px solid #bbf7d0', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 6 }}>🎉</div>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#15803d', margin: 0 }}>
              All rooms cleaned!
            </p>
            <p style={{ fontSize: 13, color: '#16a34a', marginTop: 4 }}>
              Great work — the host has been notified.
            </p>
          </div>
        )}

        <p style={{ textAlign: 'center', fontSize: 11, color: '#cbd5e1', marginTop: 24 }}>
          Powered by CleanStay
        </p>
      </div>
    </div>
  );
}
