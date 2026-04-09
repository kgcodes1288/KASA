import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api';

export default function AdminPage() {
  const { user } = useAuth();
  if (!user?.isAdmin) return <Navigate to="/" replace />;
  return <AdminDashboard />;
}

function AdminDashboard() {
  const [tab, setTab]       = useState('overview');
  const [stats, setStats]   = useState(null);
  const [users, setUsers]   = useState([]);
  const [listings, setListings] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/admin/stats'),
      api.get('/admin/users'),
      api.get('/admin/listings'),
    ]).then(([s, u, l]) => {
      setStats(s.data);
      setUsers(u.data);
      setListings(l.data);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
      <div className="spinner" />
    </div>
  );

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 20px' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Admin Dashboard</h1>
        <p style={{ fontSize: 14, color: 'var(--ink-soft)', marginTop: 4 }}>Platform-wide usage overview</p>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 14, marginBottom: 32 }}>
        <StatCard label="Total Users"      value={stats.users.total}        sub={`+${stats.users.newThisMonth} this month`} color="#6366f1" />
        <StatCard label="Hosts"            value={stats.users.hosts}        sub={`${stats.users.cleaners} cleaners`} color="#0d9488" />
        <StatCard label="Total Listings"   value={stats.listings.total}     color="#f59e0b" />
        <StatCard label="Total Jobs"       value={stats.jobs.total}         sub={jobStatusSub(stats.jobs.byStatus)} color="#3b82f6" />
        <StatCard label="Tasks"            value={stats.tasks.total}        sub={taskTypeSub(stats.tasks.byType)} color="#8b5cf6" />
        <StatCard label="Contractors"      value={stats.contractors.total}  color="#ec4899" />
        <StatCard label="Active Co-hosts"  value={stats.coHosts.total}      color="#14b8a6" />
      </div>

      {/* Job & Task Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>
        <BreakdownCard title="Jobs by Status" items={stats.jobs.byStatus.map(j => ({
          label: j.status, value: j._count._all,
          color: j.status === 'completed' ? '#10b981' : j.status === 'in_progress' ? '#f59e0b' : '#94a3b8',
        }))} />
        <BreakdownCard title="Tasks by Type" items={stats.tasks.byType.map(t => ({
          label: t.taskType.replace('_', ' '), value: t._count._all,
          color: t.taskType === 'PAYMENT_REQUEST' ? '#ec4899' : t.taskType === 'ACTION' ? '#f59e0b' : '#6366f1',
        }))} />
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: '2px solid var(--border)', marginBottom: 20, display: 'flex', gap: 4 }}>
        {['users', 'listings'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 18px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 14, fontWeight: 600, borderBottom: tab === t ? '2px solid #6366f1' : '2px solid transparent',
            color: tab === t ? '#6366f1' : 'var(--ink-soft)', marginBottom: -2, textTransform: 'capitalize',
          }}>{t}</button>
        ))}
      </div>

      {tab === 'users'    && <UsersTable users={users} />}
      {tab === 'listings' && <ListingsTable listings={listings} />}
    </div>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
      <p style={{ fontSize: 28, fontWeight: 700, margin: 0, color }}>{value}</p>
      {sub && <p style={{ fontSize: 12, color: 'var(--ink-ghost)', margin: '4px 0 0' }}>{sub}</p>}
    </div>
  );
}

function BreakdownCard({ title, items }) {
  const total = items.reduce((s, i) => s + i.value, 0);
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
      <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 14px' }}>{title}</p>
      {items.length === 0 && <p style={{ fontSize: 13, color: 'var(--ink-ghost)' }}>No data yet</p>}
      {items.map(item => (
        <div key={item.label} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
            <span style={{ textTransform: 'capitalize' }}>{item.label.toLowerCase()}</span>
            <span style={{ fontWeight: 600 }}>{item.value}</span>
          </div>
          <div style={{ background: '#f1f5f9', borderRadius: 4, height: 6, overflow: 'hidden' }}>
            <div style={{ width: total ? `${(item.value / total) * 100}%` : '0%', height: '100%', background: item.color, borderRadius: 4, transition: 'width 0.4s' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function UsersTable({ users }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)' }}>
            {['Name', 'Email', 'Role', 'Auth', 'Listings', 'Contractors', 'Co-hosts', 'Joined'].map(h => (
              <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '10px 12px', fontWeight: 500 }}>{u.name}</td>
              <td style={{ padding: '10px 12px', color: 'var(--ink-soft)' }}>{u.email}</td>
              <td style={{ padding: '10px 12px' }}>
                <span style={{ background: u.role === 'host' ? '#ede9fe' : '#e0f2fe', color: u.role === 'host' ? '#6d28d9' : '#0369a1', padding: '2px 8px', borderRadius: 99, fontSize: 12, fontWeight: 600 }}>
                  {u.role}
                </span>
              </td>
              <td style={{ padding: '10px 12px' }}>
                <span style={{ fontSize: 12 }}>
                  {u.hasGoogle && <span title="Google" style={{ marginRight: 4 }}>🔵</span>}
                  {u.hasPassword && <span title="Password">🔑</span>}
                </span>
              </td>
              <td style={{ padding: '10px 12px', textAlign: 'center' }}>{u.listings}</td>
              <td style={{ padding: '10px 12px', textAlign: 'center' }}>{u.contractors}</td>
              <td style={{ padding: '10px 12px', textAlign: 'center' }}>{u.coHosting}</td>
              <td style={{ padding: '10px 12px', color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>{new Date(u.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {users.length === 0 && <p style={{ textAlign: 'center', padding: 32, color: 'var(--ink-ghost)' }}>No users yet</p>}
    </div>
  );
}

function ListingsTable({ listings }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)' }}>
            {['Listing', 'Host', 'Rooms', 'Jobs', 'Tasks', 'Co-hosts', 'Last Synced', 'Created'].map(h => (
              <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {listings.map(l => (
            <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '10px 12px', fontWeight: 500 }}>{l.name}</td>
              <td style={{ padding: '10px 12px' }}>
                <div style={{ fontWeight: 500 }}>{l.host.name}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{l.host.email}</div>
              </td>
              <td style={{ padding: '10px 12px', textAlign: 'center' }}>{l.rooms}</td>
              <td style={{ padding: '10px 12px', textAlign: 'center' }}>{l.jobs}</td>
              <td style={{ padding: '10px 12px', textAlign: 'center' }}>{l.tasks}</td>
              <td style={{ padding: '10px 12px', textAlign: 'center' }}>{l.coHosts}</td>
              <td style={{ padding: '10px 12px', color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>
                {l.lastSynced ? new Date(l.lastSynced).toLocaleDateString() : '—'}
              </td>
              <td style={{ padding: '10px 12px', color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>{new Date(l.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {listings.length === 0 && <p style={{ textAlign: 'center', padding: 32, color: 'var(--ink-ghost)' }}>No listings yet</p>}
    </div>
  );
}

// Helpers
function jobStatusSub(byStatus) {
  const done = byStatus.find(j => j.status === 'completed')?._count._all || 0;
  return `${done} completed`;
}

function taskTypeSub(byType) {
  const pay = byType.find(t => t.taskType === 'PAYMENT_REQUEST')?._count._all || 0;
  return pay ? `${pay} payment requests` : '';
}
