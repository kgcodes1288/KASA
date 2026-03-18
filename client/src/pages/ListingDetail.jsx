import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api';

/* ── Room / Appliance / Space modal (no checklist input) ── */
function RoomModal({ listingId, onClose, onSaved, room }) {
  const editing = !!room;
  const [name, setName]             = useState(room?.name || '');
  const [entityType, setEntityType] = useState(room?.entityType || 'ROOM');
  const [error, setError]           = useState('');
  const [saving, setSaving]         = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true); setError('');
    try {
      if (editing) {
        await api.put(`/rooms/${room.id}`, { name, entityType, checklist: room.checklist?.map(c => c.text) || [] });
      } else {
        await api.post('/rooms', { listing: listingId, name, entityType, checklist: [] });
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const ENTITY_OPTIONS = [
    { value: 'ROOM',      label: '🛏 Room' },
    { value: 'APPLIANCE', label: '❄️ Appliance' },
    { value: 'SPACE',     label: '🌿 Space' },
  ];

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h3>{editing ? 'Edit' : 'New'} room / appliance / space</h3>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        {error && <div className="alert alert-error" style={{ marginBottom: 14 }}>{error}</div>}
        <div className="form-group">
          <label>Type</label>
          <select className="input" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
            {ENTITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Name</label>
          <input className="input" placeholder={
            entityType === 'APPLIANCE' ? 'e.g. Washing Machine' :
            entityType === 'SPACE'     ? 'e.g. Pool' : 'e.g. Master Bedroom'
          } value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Add Cleaning Task modal ── */
function AddChecklistItemModal({ room, onClose, onSaved }) {
  const [text, setText]   = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!text.trim()) { setError('Task description is required'); return; }
    setSaving(true); setError('');
    try {
      const existing = (room.checklistItems || []).map((c) => c.text);
      await api.put(`/rooms/${room.id}`, {
        name: room.name,
        entityType: room.entityType,
        checklist: [...existing, text.trim()],
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <h3>Add cleaning task — {room.name}</h3>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        {error && <div className="alert alert-error" style={{ marginBottom: 14 }}>{error}</div>}
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 14 }}>
          This task will be added to the cleaning checklist each time a guest checks out.
        </p>
        <div className="form-group">
          <label>Task description</label>
          <input className="input" placeholder="e.g. Vacuum floor" value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSave(); } }} />
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Add task'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Add Maintenance Task modal ── */
function AddTaskModal({ listingId, room, onClose, onSaved }) {
  const [title, setTitle]             = useState('');
  const [notes, setNotes]             = useState('');
  const [intervalMonths, setInterval] = useState(3);
  const [lastServicedAt, setLastDate] = useState('');
  const [nextDueAt, setNextDate]      = useState('');
  const [error, setError]             = useState('');
  const [saving, setSaving]           = useState(false);

  useEffect(() => {
    if (lastServicedAt && intervalMonths >= 1) {
      const d = new Date(lastServicedAt);
      d.setMonth(d.getMonth() + parseInt(intervalMonths));
      setNextDate(d.toISOString().slice(0, 10));
    }
  }, [lastServicedAt, intervalMonths]);

  const handleSave = async () => {
    if (!title.trim()) { setError('Title is required'); return; }
    if (!nextDueAt)    { setError('Next due date is required'); return; }
    setSaving(true); setError('');
    try {
      await api.post(`/listings/${listingId}/maintenance`, {
        title: title.trim(),
        notes: notes.trim() || null,
        intervalMonths: parseInt(intervalMonths),
        lastServicedAt: lastServicedAt || null,
        nextDueAt,
        roomId: room.id,
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h3>Add maintenance task — {room.name}</h3>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        {error && <div className="alert alert-error" style={{ marginBottom: 14 }}>{error}</div>}
        <div className="form-group">
          <label>Title</label>
          <input className="input" placeholder="e.g. Filter replacement" value={title}
            onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Notes <span style={{ fontWeight: 400, color: 'var(--ink-ghost)' }}>(optional)</span></label>
          <textarea className="input" rows={2} placeholder="Any extra details…" value={notes}
            onChange={(e) => setNotes(e.target.value)} style={{ resize: 'vertical' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label>Interval (months)</label>
            <input className="input" type="number" min={1} value={intervalMonths}
              onChange={(e) => setInterval(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Last serviced <span style={{ fontWeight: 400, color: 'var(--ink-ghost)' }}>(optional)</span></label>
            <input className="input" type="date" value={lastServicedAt}
              onChange={(e) => setLastDate(e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label>Next due date</label>
          <input className="input" type="date" value={nextDueAt}
            onChange={(e) => setNextDate(e.target.value)} />
          {lastServicedAt && <p style={{ fontSize: 12, marginTop: 4, color: 'var(--ink-ghost)' }}>Auto-calculated from last serviced + interval</p>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Add task'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Add Contractor modal ── */
function AddContractorModal({ listingId, onClose, onAdded }) {
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
      setError(err.response?.data?.message || 'Failed to add contractor');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3>Add contractor</h3>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        {error && <div className="alert alert-error" style={{ marginBottom: 14 }}>{error}</div>}
        <p style={{ marginBottom: 14 }}>Enter the contractor's registered email address.</p>
        <div className="form-group">
          <label>Email</label>
          <input className="input" type="email" placeholder="contractor@example.com" value={email}
            onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleAdd} disabled={saving}>
            {saving ? 'Adding…' : 'Add contractor'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── constants ── */
const STATUS_LABEL = { pending: '⏳ Pending', in_progress: '🧹 In progress', completed: '✅ Done' };

const TASK_STATUS_STYLE = {
  PENDING:   { background: '#fff8e1', color: '#b45309', border: '1px solid #fde68a' },
  COMPLETED: { background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' },
  OVERDUE:   { background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' },
};
const TASK_STATUS_LABEL = { PENDING: '⏳ Pending', COMPLETED: '✅ Completed', OVERDUE: '🔴 Overdue' };

const ENTITY_GROUPS = [
  { type: 'ROOM',      icon: '🛏', label: 'Rooms' },
  { type: 'APPLIANCE', icon: '❄️', label: 'Appliances' },
  { type: 'SPACE',     icon: '🌿', label: 'Spaces' },
];

/* ── section styles ── */
const CLEANING_SECTION = {
  wrapper:  { background: '#f0f9ff', borderRadius: 8, padding: '12px 14px', marginBottom: 16 },
  header:   { fontSize: 13, fontWeight: 600, color: '#0369a1', marginBottom: 10 },
  item:     { fontSize: 13, padding: '5px 10px', background: '#e0f2fe',
              borderRadius: 6, border: '1px solid #bae6fd', color: '#0c4a6e' },
};
const MAINT_SECTION = {
  wrapper:  { background: '#fffbeb', borderRadius: 8, padding: '12px 14px' },
  header:   { fontSize: 13, fontWeight: 600, color: '#92400e', marginBottom: 10 },
  item:     { padding: '10px 12px', background: '#fef3c7',
              borderRadius: 8, border: '1px solid #fde68a' },
};

/* ── Main component ── */
export default function ListingDetail() {
  const { id } = useParams();
  const [listing, setListing]               = useState(null);
  const [allRooms, setAllRooms]             = useState([]);
  const [jobs, setJobs]                     = useState([]);
  const [maintRooms, setMaintRooms]         = useState([]);
  const [loading, setLoading]               = useState(true);
  const [roomModal, setRoomModal]           = useState(false);
  const [editRoom, setEditRoom]             = useState(null);
  const [contractorModal, setContractorModal] = useState(false);
  const [taskModal, setTaskModal]           = useState(null);
  const [checklistModal, setChecklistModal] = useState(null);
  const [expanded, setExpanded]             = useState({});
  const [completing, setCompleting]         = useState(null);
  const [tab, setTab]                       = useState('spaces');

  const load = async () => {
    setLoading(true);
    try {
      const [lRes, rRes, jRes] = await Promise.all([
        api.get(`/listings/${id}`),
        api.get(`/rooms/listing/${id}`),
        api.get(`/jobs`),
      ]);
      setListing(lRes.data);
      setAllRooms(rRes.data);
      setJobs(jRes.data.filter((j) => j.listing?.id === id || j.listing === id));
    } finally {
      setLoading(false);
    }
  };

  const loadMaintenance = async () => {
    try {
      const res = await api.get(`/listings/${id}/maintenance`);
      setMaintRooms(res.data);
    } catch {
      setMaintRooms([]);
    }
  };

  useEffect(() => { load(); }, [id]);

useEffect(() => {
    if (tab === 'spaces' || tab === 'jobs') loadMaintenance();
  }, [tab]);

  const handleDeleteRoom = async (roomId) => {
    if (!window.confirm('Delete this?')) return;
    await api.delete(`/rooms/${roomId}`);
    load();
    loadMaintenance();
  };

  const handleDeleteChecklistItem = async (entity, itemIndex) => {
    if (!window.confirm('Remove this cleaning task?')) return;
    const updated = (entity.checklistItems || [])
      .filter((_, i) => i !== itemIndex)
      .map((c) => c.text);
    await api.put(`/rooms/${entity.id}`, {
      name: entity.name,
      entityType: entity.entityType,
      checklist: updated,
    });
    loadMaintenance();
  };

  const handleRemoveContractor = async (cleanerId) => {
    if (!window.confirm('Remove this contractor?')) return;
    await api.delete(`/listings/${id}/cleaners/${cleanerId}`);
    load();
  };

  const handleCompleteTask = async (taskId) => {
    setCompleting(taskId);
    try {
      await api.patch(`/maintenance/${taskId}/complete`);
      loadMaintenance();
    } finally {
      setCompleting(null);
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Delete this task?')) return;
    await api.delete(`/maintenance/${taskId}`);
    loadMaintenance();
  };

  const toggleExpand = (entityId) =>
    setExpanded((prev) => ({ ...prev, [entityId]: !prev[entityId] }));

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
        {[
          { key: 'spaces',      label: `🏠 Spaces & Appliances (${allRooms.length})` },
          { key: 'contractors', label: `👷 Contractors (${listing.cleaners?.length || 0})` },
          { key: 'jobs',        label: `📋 Jobs (${jobs.length})` },
        ].map(({ key, label }) => (
          <button key={key} className={`btn ${tab === key ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Spaces & Appliances tab ── */}
      {tab === 'spaces' && (
        <>
          <div className="section-header">
            <h2>Spaces & Appliances</h2>
            <button className="btn btn-primary" onClick={() => { setEditRoom(null); setRoomModal(true); }}>
              + Add appliance / space
            </button>
          </div>

          {ENTITY_GROUPS.map(({ type, icon, label }) => {
            const entities = maintRooms.filter((r) => r.entityType === type);
            return (
              <div key={type} style={{ marginBottom: 28 }}>
                <h3 style={{ fontSize: 15, marginBottom: 12, color: 'var(--ink-soft)' }}>
                  {icon} {label} ({entities.length})
                </h3>

                {entities.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--ink-ghost)', paddingLeft: 4 }}>
                    No {label.toLowerCase()} added yet.
                  </p>
                ) : (
                  <div className="stack" style={{ gap: 8 }}>
                    {entities.map((entity) => {
                      const isOpen    = !!expanded[entity.id];
                      const tasks     = entity.maintenanceTasks || [];
                      const checklist = entity.checklistItems || [];
                      const isRoom    = entity.entityType === 'ROOM';

                      return (
                        <div key={entity.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>

                          {/* Entity header */}
                          <div
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              padding: '12px 16px', cursor: 'pointer', userSelect: 'none' }}
                            onClick={() => toggleExpand(entity.id)}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontWeight: 600 }}>{entity.name}</span>
                              <span style={{ fontSize: 12, color: 'var(--ink-ghost)' }}>
                                {isRoom && `${checklist.length} cleaning · `}
                                {tasks.length} maintenance
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <button className="btn-icon" onClick={(e) => { e.stopPropagation(); setEditRoom(entity); setRoomModal(true); }}>✏️</button>
                              <button className="btn-icon" onClick={(e) => { e.stopPropagation(); handleDeleteRoom(entity.id); }}>🗑</button>
                              <span style={{ fontSize: 12, color: 'var(--ink-ghost)' }}>{isOpen ? '▲' : '▼'}</span>
                            </div>
                          </div>

                          {/* Expanded body */}
                          {isOpen && (
                            <div style={{ borderTop: '1px solid var(--border)', padding: '16px' }}>

                              {/* 🧹 Cleaning Tasks — ROOM only */}
                              {isRoom && (
                                <div style={CLEANING_SECTION.wrapper}>
                                  <p style={CLEANING_SECTION.header}>🧹 Guest Turnover Tasks</p>
                                  {checklist.length === 0 ? (
                                    <p style={{ fontSize: 13, color: '#0369a1', marginBottom: 10 }}>No cleaning tasks yet.</p>
                                  ) : (
                                    <div className="stack" style={{ gap: 6, marginBottom: 10 }}>
                                      {checklist.map((item, idx) => (
                                        <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between',
                                          alignItems: 'center', ...CLEANING_SECTION.item }}>
                                          <span>☑ {item.text}</span>
                                          <button
                                            style={{ background: 'none', border: 'none', cursor: 'pointer',
                                              color: '#0369a1', fontSize: 14, lineHeight: 1 }}
                                            onClick={() => handleDeleteChecklistItem(entity, idx)}>
                                            ×
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  <button className="btn btn-secondary btn-sm"
                                    onClick={() => setChecklistModal(entity)}>
                                    + Add cleaning task
                                  </button>
                                </div>
                              )}

                              {/* 🔧 Maintenance Tasks — all types */}
                              <div style={MAINT_SECTION.wrapper}>
                                <p style={MAINT_SECTION.header}>🔧 Scheduled Maintenance</p>
                                {tasks.length === 0 ? (
                                  <p style={{ fontSize: 13, color: '#92400e', marginBottom: 10 }}>No maintenance tasks yet.</p>
                                ) : (
                                  <div className="stack" style={{ gap: 8, marginBottom: 10 }}>
                                    {tasks.map((task) => (
                                      <div key={task.id} style={MAINT_SECTION.item}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between',
                                          alignItems: 'flex-start', gap: 6 }}>
                                          <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6,
                                              flexWrap: 'wrap', marginBottom: 4 }}>
                                              <span style={{ fontWeight: 600, fontSize: 13 }}>{task.title}</span>
                                              <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 99,
                                                ...TASK_STATUS_STYLE[task.status] }}>
                                                {TASK_STATUS_LABEL[task.status]}
                                              </span>
                                            </div>
                                            {task.notes && (
                                              <p style={{ fontSize: 12, color: '#92400e', marginBottom: 3 }}>
                                                {task.notes}
                                              </p>
                                            )}
                                            <p style={{ fontSize: 11, color: '#b45309' }}>
                                              Every {task.intervalMonths}mo
                                              {task.lastServicedAt && ` · Last: ${new Date(task.lastServicedAt).toLocaleDateString()}`}
                                              {' · Next: '}<strong>{new Date(task.nextDueAt).toLocaleDateString()}</strong>
                                            </p>
                                          </div>
                                          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                            {task.status !== 'COMPLETED' && (
                                              <button className="btn btn-primary btn-sm"
                                                disabled={completing === task.id}
                                                onClick={() => handleCompleteTask(task.id)}>
                                                {completing === task.id ? '…' : '✓'}
                                              </button>
                                            )}
                                            <button className="btn btn-danger btn-sm"
                                              onClick={() => handleDeleteTask(task.id)}>
                                              🗑
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <button className="btn btn-secondary btn-sm"
                                  onClick={() => setTaskModal(entity)}>
                                  + Add maintenance task
                                </button>
                              </div>

                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {/* ── Contractors tab ── */}
      {tab === 'contractors' && (
        <>
          <div className="section-header">
            <h2>Contractors</h2>
            <button className="btn btn-primary" onClick={() => setContractorModal(true)}>+ Add contractor</button>
          </div>
          {(!listing.cleaners || listing.cleaners.length === 0) ? (
            <div className="empty-state">
              <div style={{ fontSize: 32 }}>👷</div>
              <h3>No contractors yet</h3>
              <p>Add contractors so they get notified for jobs</p>
            </div>
          ) : (
            <div className="stack">
              {listing.cleaners.map((c) => (
                <div key={c.id} className="card" style={{ padding: '14px 18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>{c.name}</strong>
                      <p style={{ fontSize: 13 }}>{c.email} {c.phone && `· ${c.phone}`}</p>
                    </div>
                    <button className="btn btn-danger btn-sm" onClick={() => handleRemoveContractor(c.id)}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Jobs tab ── */}
{/* ── Jobs tab ── */}
      {tab === 'jobs' && (() => {
        // Flatten maintenance tasks into unified list
        const maintItems = maintRooms.flatMap((r) =>
          (r.maintenanceTasks || []).map((t) => ({
            _type: 'maintenance',
            id: t.id,
            title: t.title,
            date: t.nextDueAt,
            status: t.status,
            roomName: r.name,
            notes: t.notes,
            intervalMonths: t.intervalMonths,
          }))
        );

        const jobItems = jobs.map((j) => ({
          _type: 'job',
          id: j.id,
          title: j.guestName,
          date: j.checkoutDate,
          status: j.status,
          roomName: j.room?.name,
          cleaner: j.cleaner,
          jobRef: j,
        }));

        const allItems = [...jobItems, ...maintItems].sort(
          (a, b) => new Date(a.date) - new Date(b.date)
        );

        const JOB_COLORS = {
          active: { background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af' },
          done:   { background: '#f8fafc', border: '1px solid #e2e8f0', color: '#94a3b8' },
        };
        const MAINT_COLORS = {
          active: { background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' },
          done:   { background: '#fafaf9', border: '1px solid #e7e5e4', color: '#a8a29e' },
        };

        return (
          <>
            <div className="section-header">
              <h2>All Jobs</h2>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 13 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: '#bfdbfe', display: 'inline-block' }} />
                  Cleaning
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: '#fde68a', display: 'inline-block' }} />
                  Maintenance
                </span>
              </div>
            </div>

            {allItems.length === 0 ? (
              <div className="empty-state">
                <div style={{ fontSize: 32 }}>📋</div>
                <h3>No jobs yet</h3>
                <p>Sync your iCal to generate cleaning jobs or add maintenance tasks</p>
              </div>
            ) : (
              <div className="stack">
                {allItems.map((item) => {
                  const isJob       = item._type === 'job';
                  const isDone      = item.status === 'completed' || item.status === 'COMPLETED';
                  const colorSet    = isJob
                    ? (isDone ? JOB_COLORS.done   : JOB_COLORS.active)
                    : (isDone ? MAINT_COLORS.done  : MAINT_COLORS.active);

                  const inner = (
                    <div style={{ padding: '14px 18px', borderRadius: 10, ...colorSet,
                      opacity: isDone ? 0.7 : 1, transition: 'opacity 0.2s' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 13, fontWeight: 700 }}>
                              {isJob ? '🧹' : '🔧'} {item.roomName}
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 400 }}>
                              {isJob ? `— ${item.title}` : `— ${item.title}`}
                            </span>
                          </div>
                          <p style={{ fontSize: 12, marginBottom: 2 }}>
                            📅 {new Date(item.date).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                          </p>
                          {isJob && item.cleaner && (
                            <p style={{ fontSize: 12 }}>👤 {item.cleaner.name}</p>
                          )}
                          {!isJob && item.notes && (
                            <p style={{ fontSize: 12 }}>{item.notes}</p>
                          )}
                          {!isJob && (
                            <p style={{ fontSize: 11, marginTop: 2 }}>🔁 Every {item.intervalMonths}mo</p>
                          )}
                        </div>
                        <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, flexShrink: 0,
                          fontWeight: 600, background: isDone ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.08)',
                          color: colorSet.color }}>
                          {isJob ? STATUS_LABEL[item.status] : TASK_STATUS_LABEL[item.status]}
                        </span>
                      </div>
                    </div>
                  );

                  return isJob ? (
                    <Link key={`job-${item.id}`} to={`/jobs/${item.id}`} style={{ textDecoration: 'none' }}>
                      {inner}
                    </Link>
                  ) : (
                    <div key={`maint-${item.id}`}>{inner}</div>
                  );
                })}
              </div>
            )}
          </>
        );
      })()}

      {/* Modals */}
      {roomModal && (
        <RoomModal listingId={id} room={editRoom} onClose={() => setRoomModal(false)}
          onSaved={() => { setRoomModal(false); load(); loadMaintenance(); }} />
      )}
      {contractorModal && (
        <AddContractorModal listingId={id} onClose={() => setContractorModal(false)}
          onAdded={() => { setContractorModal(false); load(); }} />
      )}
      {taskModal && (
        <AddTaskModal listingId={id} room={taskModal} onClose={() => setTaskModal(null)}
          onSaved={() => { setTaskModal(null); loadMaintenance(); }} />
      )}
      {checklistModal && (
        <AddChecklistItemModal room={checklistModal} onClose={() => setChecklistModal(null)}
          onSaved={() => { setChecklistModal(null); loadMaintenance(); }} />
      )}
    </div>
  );
}