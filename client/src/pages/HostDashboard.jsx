import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

function ListingModal({ onClose, onSaved, listing }) {
  const editing = !!listing;
  const [form, setForm] = useState(listing || { name: '', address: '', icalUrl: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name || !form.icalUrl) { setError('Name and iCal URL are required'); return; }
    setSaving(true); setError('');
    try {
      if (editing) {
        await api.put(`/listings/${listing._id}`, form);
      } else {
        await api.post('/listings', form);
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
      <div className="modal">
        <div className="modal-header">
          <h3>{editing ? 'Edit listing' : 'New listing'}</h3>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        {error && <div className="alert alert-error" style={{ marginBottom: 14 }}>{error}</div>}
        <div className="form-group">
          <label>Listing name</label>
          <input className="input" placeholder="Beach House #1" value={form.name} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Address (optional)</label>
          <input className="input" placeholder="123 Ocean Drive, Miami" value={form.address} onChange={(e) => set('address', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Airbnb iCal URL</label>
          <input className="input" placeholder="https://www.airbnb.com/calendar/ical/..." value={form.icalUrl} onChange={(e) => set('icalUrl', e.target.value)} />
          <p style={{ fontSize: 12, marginTop: 4 }}>
            Find this in Airbnb → Listing → Availability → Export calendar
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create listing'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HostDashboard() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [syncing, setSyncing] = useState({});

  const load = () => {
    setLoading(true);
    api.get('/listings').then((r) => setListings(r.data)).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this listing and all its rooms?')) return;
    await api.delete(`/listings/${id}`);
    load();
  };

  const handleSync = async (id) => {
    setSyncing((s) => ({ ...s, [id]: true }));
    try {
      await api.post(`/listings/${id}/sync`);
      load();
    } finally {
      setSyncing((s) => ({ ...s, [id]: false }));
    }
  };

  return (
    <div className="page">
      <div className="section-header">
        <div>
          <h1>My Listings</h1>
          <p>Manage your Airbnb properties and cleaning rooms</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditTarget(null); setShowModal(true); }}>
          + New listing
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><div className="spinner" /></div>
      ) : listings.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: 40 }}>🏠</div>
          <h3>No listings yet</h3>
          <p>Create your first listing to get started</p>
        </div>
      ) : (
        <div className="grid-2">
          {listings.map((l) => (
            <div key={l._id} className="card card-hover">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <h3 style={{ marginBottom: 2 }}>{l.name}</h3>
                  {l.address && <p style={{ fontSize: 13 }}>📍 {l.address}</p>}
                </div>
              </div>

              <div style={{ fontSize: 12, color: 'var(--ink-ghost)', marginBottom: 14 }}>
                {l.lastSynced
                  ? `Last synced: ${new Date(l.lastSynced).toLocaleString()}`
                  : 'Never synced'}
              </div>

              <div className="cluster">
                <Link to={`/listings/${l._id}`} className="btn btn-secondary btn-sm">
                  🛏 Manage rooms
                </Link>
                <button className="btn btn-secondary btn-sm" onClick={() => handleSync(l._id)} disabled={syncing[l._id]}>
                  {syncing[l._id] ? '⏳ Syncing…' : '🔄 Sync iCal'}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => { setEditTarget(l); setShowModal(true); }}>
                  ✏️ Edit
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(l._id)}>
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <ListingModal
          listing={editTarget}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}
    </div>
  );
}
