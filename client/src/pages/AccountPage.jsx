import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api';
import './AccountPage.css';

// ── Co-host Access Section ───────────────────────────────────────────────────
function CoHostSection() {
  const { user } = useAuth();

  // Listings I own — with their co-hosts
  const [myListings, setMyListings]       = useState([]);
  const [coHostedListings, setCoHostedListings] = useState([]);
  const [loading, setLoading]             = useState(true);

  // Invite form state per listing
  const [inviteForm, setInviteForm]       = useState({});  // { [listingId]: { phone, role, loading, msg } }
  const [expandedListing, setExpandedListing] = useState(null);
  const [inviteLinks, setInviteLinks]     = useState({});  // { [listingId]: url }

  const load = async () => {
    setLoading(true);
    try {
      const [lRes, cRes] = await Promise.all([
        api.get('/listings'),
        api.get('/cohosts/my-listings'),
      ]);
      // For each owned listing, also fetch its co-hosts
      const withCoHosts = await Promise.all(
        lRes.data.map(async (l) => {
          const chRes = await api.get(`/listings/${l.id}/cohosts`);
          return { ...l, coHosts: chRes.data };
        })
      );
      setMyListings(withCoHosts);
      setCoHostedListings(cRes.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleListing = (id) =>
    setExpandedListing((prev) => (prev === id ? null : id));

  const setField = (listingId, field, value) =>
    setInviteForm((prev) => ({
      ...prev,
      [listingId]: { ...prev[listingId], [field]: value },
    }));

  const handleInvite = async (listingId) => {
    const form = inviteForm[listingId] || {};
    if (!form.phone || !form.role) return;

    setField(listingId, 'loading', true);
    setField(listingId, 'msg', null);
    setInviteLinks((prev) => ({ ...prev, [listingId]: null }));

    try {
      const { data } = await api.post(`/listings/${listingId}/cohosts/invite`, {
        phone: form.phone,
        role: form.role,
      });

      if (!data.smsSent && data.inviteUrl) {
        setInviteLinks((prev) => ({ ...prev, [listingId]: data.inviteUrl }));
      }

      setField(listingId, 'msg', { type: 'success', text: data.message });
      setField(listingId, 'phone', '');
      setField(listingId, 'role', '');
      load();
    } catch (err) {
      setField(listingId, 'msg', {
        type: 'error',
        text: err.response?.data?.error || 'Invite failed',
      });
    } finally {
      setField(listingId, 'loading', false);
    }
  };

  const handleRemove = async (listingId, targetUserId) => {
    if (!window.confirm('Remove this co-host?')) return;
    await api.delete(`/listings/${listingId}/cohosts/${targetUserId}`);
    load();
  };

  const handleLeave = async (listingId) => {
    if (!window.confirm('Leave this listing?')) return;
    await api.delete(`/listings/${listingId}/cohosts/${user.id}`);
    load();
  };

  if (loading) return <div style={{ padding: 24, textAlign: 'center' }}><div className="spinner" /></div>;

  return (
    <section className="account-section">
      <h2>Co-host Access</h2>

      {/* ── Listings I Share ── */}
      {myListings.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-soft)', marginBottom: 12 }}>
            Listings I Share
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {myListings.map((l) => {
              const form = inviteForm[l.id] || {};
              const isOpen = expandedListing === l.id;

              return (
                <div key={l.id} style={styles.listingBlock}>
                  <div
                    style={styles.listingHeader}
                    onClick={() => toggleListing(l.id)}
                  >
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{l.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--ink-ghost)' }}>
                      {l.coHosts.length} co-host{l.coHosts.length !== 1 ? 's' : ''} {isOpen ? '▲' : '▼'}
                    </span>
                  </div>

                  {isOpen && (
                    <div style={{ padding: '12px 16px' }}>

                      {/* Current co-hosts */}
                      {l.coHosts.length === 0 ? (
                        <p style={styles.emptyText}>No co-hosts yet.</p>
                      ) : (
                        <div style={{ marginBottom: 16 }}>
                          {l.coHosts.map((ch) => (
                            <div key={ch.id} style={styles.coHostRow}>
                              <div>
                                <span style={{ fontSize: 14, fontWeight: 500 }}>
                                  {ch.user?.name || ch.invitePhone}
                                </span>
                                <span style={styles.statusBadge(ch.status)}>
                                  {ch.status}
                                </span>
                                <span style={styles.roleBadge(ch.role)}>
                                  {ch.role === 'COHOST' ? 'Co-host' : 'View Only'}
                                </span>
                              </div>
                              {ch.userId && (
                                <button
                                  className="btn btn-danger btn-sm"
                                  onClick={() => handleRemove(l.id, ch.userId)}
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Invite form */}
                      <div style={styles.inviteForm}>
                        <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Invite a co-host</p>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <input
                            className="input"
                            placeholder="+1 555 000 0000"
                            value={form.phone || ''}
                            onChange={(e) => setField(l.id, 'phone', e.target.value)}
                            style={{ flex: 1, minWidth: 160 }}
                          />
                          <select
                            className="input"
                            value={form.role || ''}
                            onChange={(e) => setField(l.id, 'role', e.target.value)}
                            style={{ flex: 1, minWidth: 130 }}
                          >
                            <option value="">Select role…</option>
                            <option value="COHOST">Co-host</option>
                            <option value="VIEW_ONLY">View Only</option>
                          </select>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleInvite(l.id)}
                            disabled={form.loading || !form.phone || !form.role}
                          >
                            {form.loading ? 'Sending…' : 'Send Invite'}
                          </button>
                        </div>

                        {form.msg && (
                          <p className={`form-msg ${form.msg.type}`} style={{ marginTop: 8 }}>
                            {form.msg.text}
                          </p>
                        )}

                        {/* Manual invite link fallback */}
                        {inviteLinks[l.id] && (
                          <div style={styles.inviteLinkBox}>
                            <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                              No account found — share this link manually:
                            </p>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <input
                                className="input"
                                readOnly
                                value={inviteLinks[l.id]}
                                style={{ fontSize: 12, flex: 1 }}
                              />
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => navigator.clipboard.writeText(inviteLinks[l.id])}
                              >
                                Copy
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Listings Shared With Me ── */}
      {coHostedListings.length > 0 && (
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-soft)', marginBottom: 12 }}>
            Shared With Me
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {coHostedListings.map((l) => (
              <div key={l.id} style={styles.coHostedRow}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{l.name}</span>
                  <span style={{ fontSize: 12, color: 'var(--ink-ghost)', marginLeft: 8 }}>
                    by {l.host?.name}
                  </span>
                  <span style={styles.roleBadge(l.coHostRole)}>
                    {l.coHostRole === 'COHOST' ? 'Co-host' : 'View Only'}
                  </span>
                </div>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => handleLeave(l.id)}
                >
                  Leave
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {myListings.length === 0 && coHostedListings.length === 0 && (
        <p style={styles.emptyText}>No co-host activity yet.</p>
      )}
    </section>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  listingBlock: {
    border: '1px solid var(--border)',
    borderRadius: 10,
    overflow: 'hidden',
  },
  listingHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    cursor: 'pointer',
    backgroundColor: 'var(--bg)',
  },
  coHostRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid var(--border)',
  },
  coHostedRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    border: '1px solid var(--border)',
    borderRadius: 10,
    backgroundColor: 'var(--bg)',
  },
  inviteForm: {
    backgroundColor: 'var(--bg)',
    borderRadius: 8,
    padding: '12px',
    border: '1px solid var(--border)',
  },
  inviteLinkBox: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#fefce8',
    border: '1px solid #fde68a',
    borderRadius: 8,
  },
  emptyText: {
    fontSize: 13,
    color: 'var(--ink-ghost)',
    marginBottom: 12,
  },
  statusBadge: (status) => ({
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 6px',
    borderRadius: 20,
    marginLeft: 8,
    backgroundColor: status === 'ACCEPTED' ? '#d1fae5' : status === 'PENDING' ? '#fef3c7' : '#fee2e2',
    color: status === 'ACCEPTED' ? '#065f46' : status === 'PENDING' ? '#92400e' : '#991b1b',
  }),
  roleBadge: (role) => ({
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 6px',
    borderRadius: 20,
    marginLeft: 6,
    backgroundColor: role === 'COHOST' ? '#ede9fe' : '#f0fdf4',
    color: role === 'COHOST' ? '#6d28d9' : '#15803d',
    border: `1px solid ${role === 'COHOST' ? '#c4b5fd' : '#86efac'}`,
  }),
};

// ── Main Account Page ────────────────────────────────────────────────────────
export default function AccountPage() {
  const { user, updateUser } = useAuth();

  // ── Profile form ──
  const [profile, setProfile] = useState({
    name:  user?.name  || '',
    email: user?.email || '',
    phone: user?.phone || '',
  });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileMsg, setProfileMsg]         = useState(null);

  // ── Password form ──
  const [passwords, setPasswords] = useState({
    currentPassword:  '',
    newPassword:      '',
    confirmPassword:  '',
  });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg]         = useState(null);

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileMsg(null);
    setProfileLoading(true);
    try {
      const { data } = await api.put('/auth/profile', profile);
      updateUser(data);
      setProfileMsg({ type: 'success', text: 'Profile updated successfully!' });
    } catch (err) {
      setProfileMsg({ type: 'error', text: err.response?.data?.message || 'Update failed' });
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPwMsg(null);
    if (passwords.newPassword !== passwords.confirmPassword) {
      setPwMsg({ type: 'error', text: 'New passwords do not match' });
      return;
    }
    setPwLoading(true);
    try {
      const { data } = await api.put('/auth/password', {
        currentPassword: passwords.currentPassword,
        newPassword:     passwords.newPassword,
      });
      setPwMsg({ type: 'success', text: data.message });
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setPwMsg({ type: 'error', text: err.response?.data?.message || 'Password change failed' });
    } finally {
      setPwLoading(false);
    }
  };

  const passwordMismatch =
    passwords.confirmPassword.length > 0 &&
    passwords.newPassword !== passwords.confirmPassword;

  return (
    <div className="account-page">
      <div className="account-container">

        <div className="account-header">
          <div className="account-avatar">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1>{user?.name}</h1>
            <span className={`role-badge role-${user?.role}`}>{user?.role}</span>
          </div>
        </div>

        {/* ── Profile Section ── */}
        <section className="account-section">
          <h2>Profile Details</h2>
          <form onSubmit={handleProfileSubmit} className="account-form">
            <div className="form-group">
              <label htmlFor="name">Full Name</label>
              <input
                id="name" type="text" value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                id="email" type="email" value={profile.email}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="phone">Phone Number</label>
              <input
                id="phone" type="tel" value={profile.phone || ''}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                placeholder="+1 555 000 0000"
              />
            </div>
            {profileMsg && (
              <p className={`form-msg ${profileMsg.type}`}>{profileMsg.text}</p>
            )}
            <button type="submit" className="btn-primary" disabled={profileLoading}>
              {profileLoading ? 'Saving…' : 'Save Changes'}
            </button>
          </form>
        </section>

        {/* ── Password Section ── */}
        <section className="account-section">
          <h2>Change Password</h2>
          <form onSubmit={handlePasswordSubmit} className="account-form">
            <div className="form-group">
              <label htmlFor="currentPassword">Current Password</label>
              <input
                id="currentPassword" type="password" value={passwords.currentPassword}
                onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="newPassword">New Password</label>
              <input
                id="newPassword" type="password" value={passwords.newPassword}
                onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
                minLength={6} required
              />
            </div>
            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm New Password</label>
              <input
                id="confirmPassword" type="password" value={passwords.confirmPassword}
                onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })}
                style={{
                  borderColor: passwordMismatch ? '#ef4444' : '',
                  boxShadow: passwordMismatch ? '0 0 0 3px rgba(239,68,68,0.15)' : '',
                }}
                required
              />
              {passwordMismatch && (
                <p className="field-error">Passwords do not match</p>
              )}
            </div>
            {pwMsg && (
              <p className={`form-msg ${pwMsg.type}`}>{pwMsg.text}</p>
            )}
            <button type="submit" className="btn-primary" disabled={pwLoading || passwordMismatch}>
              {pwLoading ? 'Updating…' : 'Update Password'}
            </button>
          </form>
        </section>

        {/* ── Co-host Access Section (hosts only) ── */}
        {user?.role === 'host' && <CoHostSection />}

      </div>
    </div>
  );
}