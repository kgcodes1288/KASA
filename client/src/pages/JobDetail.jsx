import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api';

const STATUS_LABEL = { pending: '⏳ Pending', in_progress: '🧹 In progress', completed: '✅ Completed' };

export default function JobDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState({});

  useEffect(() => {
    api.get(`/jobs/${id}`).then((r) => setJob(r.data)).finally(() => setLoading(false));
  }, [id]);

  const handleToggle = async (itemId, currentVal) => {
    setToggling((t) => ({ ...t, [itemId]: true }));
    try {
      const { data } = await api.patch(`/jobs/${id}/checklist/${itemId}`, { completed: !currentVal });
      setJob(data);
    } finally {
      setToggling((t) => ({ ...t, [itemId]: false }));
    }
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><div className="spinner" /></div>;
  if (!job) return <div className="page"><p>Job not found.</p></div>;

  const total = job.checklist.length;
  const done = job.checklist.filter((i) => i.completed).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const backLink = user?.role === 'host' ? `/listings/${job.listing?.id}` : '/cleaner';

  return (
    <div className="page" style={{ maxWidth: 640 }}>
      <div style={{ marginBottom: 20 }}>
        <Link to={backLink} style={{ fontSize: 13, color: 'var(--ink-ghost)' }}>← Back</Link>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <h2 style={{ marginBottom: 4 }}>{job.room?.name}</h2>
            <p style={{ fontSize: 14 }}>🏠 {job.listing?.name}</p>
            {job.listing?.address && <p style={{ fontSize: 13 }}>📍 {job.listing.address}</p>}
          </div>
          <span className={`badge badge-${job.status}`}>{STATUS_LABEL[job.status]}</span>
        </div>

        <div className="divider" />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13, marginBottom: 14 }}>
          <div>
            <span style={{ color: 'var(--ink-ghost)' }}>Guest</span>
            <p style={{ fontWeight: 500 }}>{job.guestName}</p>
          </div>
          <div>
            <span style={{ color: 'var(--ink-ghost)' }}>Checkout</span>
            <p style={{ fontWeight: 500 }}>{new Date(job.checkoutDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })}</p>
          </div>
          {job.checkinDate && (
            <div>
              <span style={{ color: 'var(--ink-ghost)' }}>Next check-in</span>
              <p style={{ fontWeight: 500 }}>{new Date(job.checkinDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })}</p>
            </div>
          )}
          {job.cleaner && (
            <div>
              <span style={{ color: 'var(--ink-ghost)' }}>Cleaner</span>
              <p style={{ fontWeight: 500 }}>{job.cleaner.name}</p>
            </div>
          )}
        </div>

        <div style={{ marginBottom: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6, color: 'var(--ink-soft)' }}>
            <span>{done} of {total} tasks completed</span>
            <span style={{ fontWeight: 600, color: pct === 100 ? 'var(--green)' : 'var(--teal)' }}>{pct}%</span>
          </div>
          <div className="progress-bar" style={{ height: 8 }}>
            <div className="progress-fill" style={{ width: `${pct}%`, background: pct === 100 ? 'var(--green)' : 'var(--teal)' }} />
          </div>
        </div>
      </div>

      {/* Checklist */}
      <div style={{ marginBottom: 12 }}>
        <h3 style={{ marginBottom: 14, fontFamily: 'var(--font-body)', fontWeight: 600 }}>
          Checklist
        </h3>
        {total === 0 ? (
          <div className="empty-state"><p>No checklist items for this room.</p></div>
        ) : (
          <div className="stack">
            {job.checklist.map((item) => (
              <div
                key={item.id}
                className={`checklist-item${item.completed ? ' done' : ''}`}
                onClick={() => !toggling[item.id] && handleToggle(item.id, item.completed)}
                style={{ cursor: 'pointer', userSelect: 'none' }}
              >
                {toggling[item.id]
                  ? <span className="spinner" style={{ width: 16, height: 16, flexShrink: 0 }} />
                  : <input type="checkbox" checked={item.completed} readOnly />
                }
                <span className="item-text">{item.text}</span>
                {item.completed && item.completedAt && (
                  <span style={{ fontSize: 11, color: 'var(--ink-ghost)', flexShrink: 0 }}>
                    {new Date(item.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {pct === 100 && (
        <div className="alert alert-success" style={{ textAlign: 'center', marginTop: 20, fontSize: 15 }}>
          🎉 All done! This room is clean and ready.
        </div>
      )}
    </div>
  );
}
