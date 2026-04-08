import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import HowToUseSection from '../components/HowToUseSection';
import api from '../api';
import './AccountPage.css';

// ── Pending Invites Notification ─────────────────────────────────────────────
function PendingInvites() {
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/cohosts/pending');
      setInvites(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAccept = async (id) => {
    try {
      await api.post(`/cohosts/${id}/accept`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to accept invite');
    }
  };

  const handleDecline = async (id) => {
    if (!window.confirm('Decline this invite?')) return;
    try {
      await api.post(`/cohosts/${id}/decline`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to decline invite');
    }
  };

  if (loading || invites.length === 0) return null;

  return (
    <div style={{
      marginBottom: 20,
      borderRadius: 12,
      overflow: 'hidden',
      border: '1px solid #c4b5fd',
      backgroundColor: '#faf5ff',
    }}>
      <div style={{
        padding: '10px 16px',
        backgroundColor: '#ede9fe',
        fontSize: 13,
        fontWeight: 600,
        color: '#6d28d9',
        borderBottom: '1px solid #c4b5fd',
      }}>
        🔔 You have {invites.length} pending co-host invite{invites.length !== 1 ? 's' : ''}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {invites.map((inv, i) => (
          <div
            key={inv.id}
            style={{
              padding: '14px 16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: i < invites.length - 1 ? '1px solid #ede9fe' : 'none',
            }}
          >
            <div>
              <p style={{ fontSize: 14, fontWeight: 500, color: '#111', marginBottom: 2 }}>
                <strong>{inv.listing?.host?.name}</strong> invited you to co-host{' '}
                <strong>{inv.listing?.name}</strong>
              </p>
              <p style={{ fontSize: 12, color: '#6d28d9' }}>
                Role: {inv.role === 'COHOST' ? 'Co-host' : 'View Only'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: 12 }}>
              <button className="btn btn-primary btn-sm" onClick={() => handleAccept(inv.id)}>Accept</button>
              <button className="btn btn-secondary btn-sm" onClick={() => handleDecline(inv.id)}>Decline</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Contractors Section ───────────────────────────────────────────────────────
function ContractorsSection() {
  const [contractors, setContractors] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showForm, setShowForm]       = useState(false);
  const [editingId, setEditingId]     = useState(null);
  const [formError, setFormError]     = useState('');
  const [saving, setSaving]           = useState(false);

  const emptyForm = { name: '', phone: '', trade: '', notes: '', smsConsent: false };
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/contractors');
      setContractors(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (c) => {
    setEditingId(c.id);
    setForm({ name: c.name, phone: c.phone, trade: c.trade || '', notes: c.notes || '', smsConsent: false });
    setFormError('');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setFormError('');
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError('Name is required'); return; }
    if (!form.phone.trim()) { setFormError('Phone is required'); return; }
    setSaving(true);
    setFormError('');
    try {
      if (editingId) {
        await api.put(`/contractors/${editingId}`, {
          name: form.name,
          phone: form.phone,
          trade: form.trade,
          notes: form.notes,
        });
      } else {
        await api.post('/contractors', {
          name: form.name,
          phone: form.phone,
          trade: form.trade,
          notes: form.notes,
          smsConsent: form.smsConsent,
        });
      }
      closeForm();
      load();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to save contractor');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this contractor?')) return;
    try {
      await api.delete(`/contractors/${id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete contractor');
    }
  };

  const TRADES = [
    'General Cleaning',
    'Plumber',
    'Electrician',
    'HVAC',
    'Landscaping',
    'Painter',
    'Handyman',
    'Pool Service',
    'Pest Control',
    'Other',
  ];

  if (loading) return <div style={{ padding: 24, textAlign: 'center' }}><div className="spinner" /></div>;

  return (
    <section className="account-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Contractors</h2>
        <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Add Contractor</button>
      </div>

      {/* ── Add / Edit Form ── */}
      {showForm && (
        <div style={styles.formCard}>
          <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>
            {editingId ? 'Edit Contractor' : 'New Contractor'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label style={styles.label}>Name *</label>
                <input
                  className="input"
                  placeholder="Jane Smith"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label style={styles.label}>Phone *</label>
                <input
                  className="input"
                  placeholder="+1 555 000 0000"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label style={styles.label}>Trade / Specialty</label>
                <select
                  className="input"
                  value={form.trade}
                  onChange={(e) => setForm({ ...form, trade: e.target.value })}
                >
                  <option value="">Select trade…</option>
                  {TRADES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label style={styles.label}>Notes</label>
                <input
                  className="input"
                  placeholder="e.g. available weekends"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>

            {/* SMS Consent — only shown when adding, not editing */}
            {!editingId && (
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
                padding: '10px 12px', borderRadius: 8, background: '#f0fdf4',
                border: '1px solid #86efac', marginTop: 4 }}>
                <input
                  type="checkbox"
                  checked={form.smsConsent}
                  onChange={(e) => setForm({ ...form, smsConsent: e.target.checked })}
                  style={{ marginTop: 2, width: 15, height: 15, flexShrink: 0, cursor: 'pointer' }}
                />
                <span style={{ fontSize: 13, color: '#166534', lineHeight: 1.4 }}>
                  I confirm this person has agreed to receive SMS messages from CleanStay regarding job assignments.
                </span>
              </label>
            )}
          </div>

          {formError && <p className="form-msg error" style={{ marginTop: 10 }}>{formError}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleSave}
              disabled={saving || (!editingId && !form.smsConsent)}
            >
              {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Contractor'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={closeForm} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Contractor List ── */}
      {contractors.length === 0 && !showForm ? (
        <p style={styles.emptyText}>No contractors yet. Add one to use them when assigning jobs.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: showForm ? 16 : 0 }}>
          {contractors.map((c) => (
            <div key={c.id} style={styles.contractorRow}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</span>
                  {c.trade && (
                    <span style={styles.tradeBadge}>{c.trade}</span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 3 }}>
                  📞 {c.phone}
                  {c.notes && <span style={{ marginLeft: 12, color: 'var(--ink-ghost)' }}>· {c.notes}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => openEdit(c)}>Edit</button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(c.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Co-host Access Section ───────────────────────────────────────────────────
function CoHostSection() {
  const { user } = useAuth();

  const [myListings, setMyListings]             = useState([]);
  const [coHostedListings, setCoHostedListings] = useState([]);
  const [loading, setLoading]                   = useState(true);
  const [inviteForm, setInviteForm]             = useState({});
  const [expandedListing, setExpandedListing]   = useState(null);
  const [inviteLinks, setInviteLinks]           = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const [lRes, cRes] = await Promise.all([
        api.get('/listings'),
        api.get('/cohosts/my-listings'),
      ]);
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
        smsConsent: form.smsConsent === true,
      });
      setField(listingId, 'msg', { type: 'success', text: data.message });
      setField(listingId, 'phone', '');
      setField(listingId, 'role', '');
      setField(listingId, 'smsConsent', false);
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

  const handleWithdraw = async (listingId, coHostId) => {
    if (!window.confirm('Withdraw this invite?')) return;
    try {
      await api.delete(`/listings/${listingId}/cohosts/invite/${coHostId}`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to withdraw invite');
    }
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
                  <div style={styles.listingHeader} onClick={() => toggleListing(l.id)}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{l.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--ink-ghost)' }}>
                      {l.coHosts.length} co-host{l.coHosts.length !== 1 ? 's' : ''} {isOpen ? '▲' : '▼'}
                    </span>
                  </div>
                  {isOpen && (
                    <div style={{ padding: '12px 16px' }}>
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
                                {ch.invitePhone && (
                                  <span style={{ fontSize: 12, color: 'var(--ink-ghost)', marginLeft: 6 }}>
                                    {ch.invitePhone}
                                  </span>
                                )}
                                <span style={styles.statusBadge(ch.status)}>{ch.status}</span>
                                <span style={styles.roleBadge(ch.role)}>
                                  {ch.role === 'COHOST' ? 'Co-host' : 'View Only'}
                                </span>
                              </div>
                              <div style={{ display: 'flex', gap: 6 }}>
                                {ch.status === 'PENDING' && (
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => handleWithdraw(l.id, ch.id)}
                                  >
                                    Withdraw
                                  </button>
                                )}
                                {ch.status === 'ACCEPTED' && ch.userId && (
                                  <button
                                    className="btn btn-danger btn-sm"
                                    onClick={() => handleRemove(l.id, ch.userId)}
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
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
                            disabled={form.loading || !form.phone || !form.role || !form.smsConsent}
                          >
                            {form.loading ? 'Sending…' : 'Send Invite'}
                          </button>
                        </div>

                        {/* SMS Consent checkbox */}
                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10,
                          cursor: 'pointer', padding: '10px 12px', borderRadius: 8,
                          background: '#f0fdf4', border: '1px solid #86efac', marginTop: 10 }}>
                          <input
                            type="checkbox"
                            checked={form.smsConsent || false}
                            onChange={(e) => setField(l.id, 'smsConsent', e.target.checked)}
                            style={{ marginTop: 2, width: 15, height: 15, flexShrink: 0, cursor: 'pointer' }}
                          />
                          <span style={{ fontSize: 13, color: '#166534', lineHeight: 1.4 }}>
                            I confirm this person has agreed to receive SMS messages from CleanStay.
                          </span>
                        </label>

                        {form.msg && (
                          <p className={`form-msg ${form.msg.type}`} style={{ marginTop: 8 }}>
                            {form.msg.text}
                          </p>
                        )}
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
                <button className="btn btn-danger btn-sm" onClick={() => handleLeave(l.id)}>Leave</button>
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

// ── Delete Account Section ───────────────────────────────────────────────────
function DeleteAccountSection() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword]     = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [confirming, setConfirming] = useState(false);

  const handleDelete = async () => {
    if (!password) return;
    setLoading(true);
    setError('');
    try {
      await api.delete('/auth/account', { data: { password } });
      logout();
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="account-section" style={{ borderTop: '2px solid #fee2e2' }}>
      <h2 style={{ color: '#991b1b' }}>Delete Account</h2>
      {!confirming ? (
        <div>
          <p style={{ fontSize: 14, color: 'var(--ink-soft)', marginBottom: 16 }}>
            Permanently deletes your account, all listings, rooms, jobs, and cleaning history. This cannot be undone.
          </p>
          <button className="btn btn-danger" onClick={() => setConfirming(true)}>
            Delete my account
          </button>
        </div>
      ) : (
        <div>
          <p style={{ fontSize: 14, color: '#991b1b', marginBottom: 16, fontWeight: 500 }}>
            Enter your password to confirm. This action is permanent and cannot be undone.
          </p>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label htmlFor="deletePassword">Your password</label>
            <input
              id="deletePassword"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                width: '100%',
                padding: '0.6rem 0.75rem',
                border: '1px solid #fca5a5',
                borderRadius: 8,
                fontSize: '0.95rem',
                boxSizing: 'border-box',
              }}
            />
          </div>
          {error && <p className="form-msg error" style={{ marginBottom: 12 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-secondary"
              onClick={() => { setConfirming(false); setPassword(''); setError(''); }}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              className="btn btn-danger"
              onClick={handleDelete}
              disabled={loading || !password}
            >
              {loading ? 'Deleting…' : 'Confirm Delete'}
            </button>
          </div>
        </div>
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
  contractorRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    border: '1px solid var(--border)',
    borderRadius: 10,
    backgroundColor: 'var(--bg)',
  },
  formCard: {
    backgroundColor: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '16px',
    marginBottom: 4,
  },
  label: {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--ink-soft)',
    marginBottom: 5,
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
  tradeBadge: {
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 7px',
    borderRadius: 20,
    backgroundColor: '#e0f2fe',
    color: '#0369a1',
    border: '1px solid #bae6fd',
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

// ── Tab definitions ──────────────────────────────────────────────────────────
const ALL_TABS    = ['Profile', 'Security', 'Co-hosts', 'Contractors'];
const CLEANER_TABS = ['Profile', 'Security'];

// ── Main Account Page ────────────────────────────────────────────────────────
export default function AccountPage() {
  const { user, updateUser } = useAuth();
  const tabs = user?.role === 'host' ? ALL_TABS : CLEANER_TABS;
  const [activeTab, setActiveTab] = useState('Profile');

  const [profile, setProfile] = useState({
    name:  user?.name  || '',
    email: user?.email || '',
    phone: user?.phone || '',
  });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileMsg, setProfileMsg]         = useState(null);

  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword:     '',
    confirmPassword: '',
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

        <PendingInvites />

        <div className="account-header">
          <div className="account-avatar">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1>{user?.name}</h1>
            <span className={`role-badge role-${user?.role}`}>{user?.role}</span>
          </div>
        </div>

        {/* ── Tab Bar ── */}
        <div style={{
          display: 'flex',
          gap: 4,
          borderBottom: '2px solid var(--border)',
          marginBottom: 24,
          overflowX: 'auto',
        }}>
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '10px 18px',
                fontSize: 14,
                fontWeight: activeTab === tab ? 700 : 500,
                color: activeTab === tab ? 'var(--primary)' : 'var(--ink-soft)',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
                marginBottom: -2,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'color 0.15s',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* ── Profile Tab ── */}
        {activeTab === 'Profile' && (
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
        )}

        {/* ── Security Tab ── */}
        {activeTab === 'Security' && (
          <>
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
            <DeleteAccountSection />
          </>
        )}

        {/* ── Co-hosts Tab (hosts only) ── */}
        {activeTab === 'Co-hosts' && <CoHostSection />}

        {/* ── Contractors Tab (hosts only) ── */}
        {activeTab === 'Contractors' && <ContractorsSection />}

        {/* ── How To Use ── */}
        <HowToUseSection />

        {/* ── Legal Footer ── */}
        <footer className="account-legal-footer">
          <a href="/privacy-terms#privacy-policy" className="account-legal-link">Privacy Policy</a>
          <span className="account-legal-sep">·</span>
          <a href="/privacy-terms#terms-conditions" className="account-legal-link">Terms &amp; Conditions</a>
        </footer>

      </div>
    </div>
  );
}