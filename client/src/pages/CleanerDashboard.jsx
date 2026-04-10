import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

const STATUS_LABEL = { pending: '⏳ Pending', in_progress: '🧹 In progress', completed: '✅ Done' };
const TABS = ['all', 'pending', 'in_progress', 'completed'];

export default function CleanerDashboard() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');

  useEffect(() => {
    api.get('/jobs').then((r) => setJobs(r.data)).finally(() => setLoading(false));
  }, []);

  const filtered = tab === 'all' ? jobs : jobs.filter((j) => j.status === tab);

  const now = new Date();
  const upcoming = filtered.filter((j) => new Date(j.checkoutDate) >= now);
  const past = filtered.filter((j) => new Date(j.checkoutDate) < now);

  const renderJob = (j) => {
    const total = j.checklist?.length || 0;
    const done = j.checklist?.filter((i) => i.completed).length || 0;
    const pct = total ? Math.round((done / total) * 100) : 0;

    return (
      <Link to={`/jobs/${j._id}`} key={j._id} style={{ textDecoration: 'none' }}>
        <div className="card card-hover">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <div>
              <h3 style={{ marginBottom: 2 }}>{j.listing?.name}</h3>
              <p style={{ fontSize: 13 }}>🛏 {j.room?.name}</p>
            </div>
            <span className={`badge badge-${j.status}`}>{STATUS_LABEL[j.status]}</span>
          </div>

          <p style={{ fontSize: 13, marginBottom: 10 }}>
            📅 Checkout: <strong>{new Date(j.checkoutDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}</strong>
            {j.checkinDate && ` → Check-in: ${new Date(j.checkinDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`}
          </p>

          {total > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4, color: 'var(--ink-soft)' }}>
                <span>{done}/{total} tasks</span>
                <span>{pct}%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}
        </div>
      </Link>
    );
  };

  return (
    <div className="page">
      <div className="section-header">
        <div>
          <h1>My Jobs</h1>
          <p>Cleaning assignments for your listings</p>
        </div>
      </div>

      <div className="cluster" style={{ marginBottom: 24 }}>
        {TABS.map((t) => (
          <button key={t} className={`btn ${tab === t ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab(t)} style={{ textTransform: 'capitalize' }}>
            {t === 'all' ? `All (${jobs.length})` : t === 'in_progress' ? `In Progress` : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><div style={{ fontSize: 40 }}>🧹</div><h3>No jobs here</h3><p>You're all caught up!</p></div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <section style={{ marginBottom: 32 }}>
              <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--ink-ghost)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                Upcoming
              </h2>
              <div className="grid-2">{upcoming.map(renderJob)}</div>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--ink-ghost)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                Past
              </h2>
              <div className="grid-2">{past.map(renderJob)}</div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
