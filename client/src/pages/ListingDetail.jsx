import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api';

/* ── Tag / checklist item input ── */
function TagInput({ items, onChange, placeholder }) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const t = draft.trim();
    if (t && !items.includes(t)) { onChange([...items, t]); setDraft(''); }
  };

  const remove = (i) => onChange(items.filter((_, idx) => idx !== i));

  return (
    <div className="tag-input-wrapper" onClick={(e) => e.currentTarget.querySelector('input').focus()}>
      {items.map((item, i) => (
        <span key={i} className="tag">
          {item}
          <button type="button" onClick={() => remove(i)}>×</button>
        </span>
      ))}
      <input
        className="tag-input-field"
        value={draft}
        placeholder={placeholder || 'Add item…'}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        onBlur={add}
      />
    </div>
  );
}

/* ── Room modal ── */
function RoomModal({ listingId, onClose, onSaved, room }) {
  const editing = !!room;
  const [name, setName] = useState(room?.name || '');
  const [checklist, setChecklist] = useState(room?.checklist?.map((c) => c.text) || []);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { setError('Room name is required'); return; }
    setSaving(true); setError('');
    try {
      if (editing) {
        await api.put(`/rooms/${room.id}`, { name, checklist });
      } else {
        await api.post('/rooms', { listing: listingId, name, checklist });
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <h3>{editing ? 'Edit room' : 'New room'}</h3>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        {error && <div className="alert alert-error" style={{ marginBottom: 14 }}>{error}</div>}
        <div className="form-group">
          <label>Room name</label>
          <input className="input" placeholder="Master Bedroom" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Cleaning checklist</label>
          <TagInput items={checklist} onChange={setChecklist} placeholder="Type item, press Enter…" />
          <p style={{ fontSize: 12, marginTop: 4 }}>Press Enter or Tab after each item</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create room'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Add cleaner modal ── */
function AddCleanerModal({ listingId, onClose, onAdded }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!email.trim()) { setError('Email required'); return; }
    setSaving(true); setError('');
    try {
      await api.post(`/listings/${listingId}/cleaners`, { email });
      onAdded();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add cleaner');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3>Add cleaner</h3>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        {error && <div className="alert alert-error" style={{ marginBottom: 14 }}>{error}</div>}
        <p style={{ marginBottom: 14 }}>Enter the cleaner's registered email address.</p>
        <div className="form-group">
          <label>Email</label>
          <input className="input" type="email" placeholder="cleaner@example.com" value={email}
            onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleAdd} disabled={saving}>
            {saving ? 'Adding…' : 'Add cleaner'}
          </button>
        </div>
      </div>
    </div>
  );
}

const STATUS_LABEL = { pending: '⏳ Pending', in_progress: '🧹 In progress', completed: '✅ Done' };

export default function ListingDetail() {
  const { id } = useParams();
  const [listing, setListing] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roomModal, setRoomModal] = useState(false);
  const [editRoom, setEditRoom] = useState(null);
  const [cleanerModal, setCleanerModal] = useState(false);
  const [tab, setTab] = useState('rooms');

  const load = async () => {
    setLoading(true);
    try {
      const [lRes, rRes, jRes] = await Promise.all([
        api.get(`/listings/${id}`),
        api.get(`/rooms/listing/${id}`),
        api.get(`/jobs`),
      ]);
      setListing(lRes.data);
      setRooms(rRes.data);
      setJobs(jRes.data.filter((j) => j.listing?.id === id || j.listing === id));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const handleDeleteRoom = async (roomId) => {
    if (!window.confirm('Delete this room?')) return;
    await api.delete(`/rooms/${roomId}`);
    load();
  };

  const handleRemoveCleaner = async (cleanerId) => {
    if (!window.confirm('Remove this cleaner?')) return;
    await api.delete(`/listings/${id}/cleaners/${cleanerId}`);
    load();
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><div className="spinner" /></div>;
  if (!listing) return <div className="page"><p>Listing not found.</p></div>;

  return (
    <div className="page">
      <div style={{ marginBottom: 20 }}>
        <Link to="/host" style={{ fontSize: 13, color: 'var(--ink-ghost)' }}>← Back to listings</Link>
      </div>

      <div className="section-header">
        <div>
          <h1>{listing.name}</h1>
          {listing.address && <p>📍 {listing.address}</p>}
        </div>
      </div>

      {/* Tabs */}
      <div className="cluster" style={{ marginBottom: 24 }}>
        {['rooms', 'cleaners', 'jobs'].map((t) => (
          <button key={t} className={`btn ${tab === t ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab(t)} style={{ textTransform: 'capitalize' }}>
            {t === 'rooms' ? `🛏 Rooms (${rooms.length})` : t === 'cleaners' ? `👷 Cleaners (${listing.cleaners?.length || 0})` : `📋 Jobs (${jobs.length})`}
          </button>
        ))}
      </div>

      {/* ── Rooms tab ── */}
      {tab === 'rooms' && (
        <>
          <div className="section-header">
            <h2>Rooms</h2>
            <button className="btn btn-primary" onClick={() => { setEditRoom(null); setRoomModal(true); }}>
              + Add room
            </button>
          </div>
          {rooms.length === 0 ? (
            <div className="empty-state"><div style={{ fontSize: 32 }}>🛏</div><h3>No rooms yet</h3><p>Add rooms and their cleaning checklists</p></div>
          ) : (
            <div className="grid-2">
              {rooms.map((r) => (
                <div key={r.id} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <h3>{r.name}</h3>
                    <div className="cluster">
                      <button className="btn-icon" onClick={() => { setEditRoom(r); setRoomModal(true); }}>✏️</button>
                      <button className="btn-icon" onClick={() => handleDeleteRoom(r.id)}>🗑</button>
                    </div>
                  </div>
                  {r.checklist.length === 0 ? (
                    <p style={{ fontSize: 13 }}>No checklist items yet</p>
                  ) : (
                    <div className="stack" style={{ gap: 6 }}>
                      {r.checklist.map((item) => (
                        <div key={item.id} style={{ fontSize: 13, padding: '5px 10px', background: 'var(--bg)', borderRadius: 6, border: '1px solid var(--border)' }}>
                          ☑ {item.text}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Cleaners tab ── */}
      {tab === 'cleaners' && (
        <>
          <div className="section-header">
            <h2>Assigned cleaners</h2>
            <button className="btn btn-primary" onClick={() => setCleanerModal(true)}>+ Add cleaner</button>
          </div>
          {(!listing.cleaners || listing.cleaners.length === 0) ? (
            <div className="empty-state"><div style={{ fontSize: 32 }}>👷</div><h3>No cleaners yet</h3><p>Add cleaners so they get notified for jobs</p></div>
          ) : (
            <div className="stack">
              {listing.cleaners.map((c) => (
                <div key={c.id} className="card" style={{ padding: '14px 18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>{c.name}</strong>
                      <p style={{ fontSize: 13 }}>{c.email} {c.phone && `· ${c.phone}`}</p>
                    </div>
                    <button className="btn btn-danger btn-sm" onClick={() => handleRemoveCleaner(c.id)}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Jobs tab ── */}
      {tab === 'jobs' && (
        <>
          <div className="section-header">
            <h2>Cleaning jobs</h2>
            <span style={{ fontSize: 13, color: 'var(--ink-ghost)' }}>Auto-created from iCal checkouts</span>
          </div>
          {jobs.length === 0 ? (
            <div className="empty-state"><div style={{ fontSize: 32 }}>📋</div><h3>No jobs yet</h3><p>Sync your iCal to generate cleaning jobs</p></div>
          ) : (
            <div className="stack">
              {jobs.map((j) => (
                <Link to={`/jobs/${j.id}`} key={j.id} style={{ textDecoration: 'none' }}>
                  <div className="card card-hover" style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong>{j.room?.name}</strong> — <span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{j.guestName}</span>
                        <p style={{ fontSize: 13, marginTop: 2 }}>Checkout: {new Date(j.checkoutDate).toLocaleDateString()}</p>
                        {j.cleaner && <p style={{ fontSize: 13 }}>Cleaner: {j.cleaner.name}</p>}
                      </div>
                      <span className={`badge badge-${j.status}`}>{STATUS_LABEL[j.status]}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {roomModal && (
        <RoomModal listingId={id} room={editRoom} onClose={() => setRoomModal(false)} onSaved={() => { setRoomModal(false); load(); }} />
      )}
      {cleanerModal && (
        <AddCleanerModal listingId={id} onClose={() => setCleanerModal(false)} onAdded={() => { setCleanerModal(false); load(); }} />
      )}
    </div>
  );
}
