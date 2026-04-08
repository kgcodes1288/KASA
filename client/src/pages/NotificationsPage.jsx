import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../context/NotificationContext';
import api from '../api';

const TYPE_ICON = {
  COHOST_ACCEPTED:    '🤝',
  JOB_CREATED:        '📅',
  CONTRACTOR_ACCEPTED:'✅',
  CONTRACTOR_REJECTED:'❌',
  CONTRACTOR_STARTED: '🧹',
  JOB_COMPLETED:      '🏁',
  TASK_ASSIGNED:      '📋',
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const { refresh } = useNotifications();
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/notifications')
      .then(({ data }) => {
        setNotifications(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    api.patch('/notifications/read-all').then(() => refresh());
  }, []);

  return (
    <main style={{ maxWidth: 640, margin: '40px auto', padding: '0 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: 0, color: 'var(--ink)' }}
        >
          ←
        </button>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Notifications</h1>
      </div>

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <div className="spinner" />
        </div>
      )}

      {!loading && notifications.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          color: 'var(--ink-ghost)',
          fontSize: 15,
        }}>
          No notifications in the last 3 days
        </div>
      )}

      {!loading && notifications.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {notifications.map((n) => (
            <div
              key={n.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                padding: '14px 16px',
                borderRadius: 10,
                background: n.read ? 'var(--bg)' : '#eff6ff',
                border: `1px solid ${n.read ? 'var(--border)' : '#bfdbfe'}`,
              }}
            >
              <span style={{ fontSize: 22, flexShrink: 0, marginTop: 1 }}>
                {TYPE_ICON[n.type] || '🔔'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontWeight: n.read ? 500 : 700, fontSize: 14 }}>{n.title}</span>
                  <span style={{ fontSize: 12, color: 'var(--ink-ghost)', flexShrink: 0 }}>{timeAgo(n.createdAt)}</span>
                </div>
                <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--ink-secondary)', lineHeight: 1.4 }}>
                  {n.message}
                </p>
              </div>
              {!n.read && (
                <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#3b82f6',
                  flexShrink: 0,
                  marginTop: 6,
                }} />
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
