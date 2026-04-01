import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';

/* ── Room / Appliance / Space modal ── */
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
  const [text, setText]     = useState('');
  const [error, setError]   = useState('');
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

/* ── Send Contractor Link modal ── */
function SendLinkModal({ listingId, checkoutDate, contractors, onClose, onSent }) {
  const [contractorId, setContractorId] = useState('');
  const [useManualPhone, setUseManualPhone] = useState(contractors.length === 0);
  const [manualPhone, setManualPhone]   = useState('');
  const [error, setError]               = useState('');
  const [sending, setSending]           = useState(false);
  const [sent, setSent]                 = useState(false);

  const handleSend = async () => {
    if (!useManualPhone && !contractorId) { setError('Please select a contractor'); return; }
    if (useManualPhone && !manualPhone.trim()) { setError('Phone number is required'); return; }
    setSending(true); setError('');
    try {
      const payload = { listingId, checkoutDate };
      if (useManualPhone) {
        payload.phone = manualPhone.trim();
      } else {
        payload.contractorId = contractorId;
      }
      await api.post('/jobs/send-link', payload);
      setSent(true);
      onSent();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send SMS');
    } finally {
      setSending(false);
    }
  };

  const selectedContractor = contractors.find((c) => c.id === contractorId);

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <h3>Assign job to contractor</h3>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        {sent ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📲</div>
            <p style={{ fontWeight: 600, marginBottom: 6 }}>SMS sent!</p>
            <p style={{ fontSize: 13, color: 'var(--ink-ghost)' }}>
              {selectedContractor
                ? `${selectedContractor.name} will receive a link to their task list.`
                : 'The contractor will receive a link to their task list.'}
            </p>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={onClose}>Done</button>
          </div>
        ) : (
          <>
            {error && <div className="alert alert-error" style={{ marginBottom: 14 }}>{error}</div>}

            {/* Contractor dropdown */}
            {!useManualPhone && contractors.length > 0 && (
              <div className="form-group">
                <label>Select contractor</label>
                <select
                  className="input"
                  value={contractorId}
                  onChange={(e) => setContractorId(e.target.value)}
                >
                  <option value="">Choose a contractor…</option>
                  {contractors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.trade ? ` — ${c.trade}` : ''} · {c.phone}
                    </option>
                  ))}
                </select>
                <button
                  style={{ background: 'none', border: 'none', fontSize: 12,
                    color: 'var(--primary)', cursor: 'pointer', marginTop: 8, padding: 0 }}
                  onClick={() => { setUseManualPhone(true); setContractorId(''); }}
                >
                  + Use a different number instead
                </button>
              </div>
            )}

            {/* Manual phone input */}
            {useManualPhone && (
              <div className="form-group">
                <label>Phone number</label>
                <input
                  className="input"
                  placeholder="e.g. 206 555 1234"
                  value={manualPhone}
                  onChange={(e) => setManualPhone(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSend(); } }}
                />
                {contractors.length > 0 && (
                  <button
                    style={{ background: 'none', border: 'none', fontSize: 12,
                      color: 'var(--primary)', cursor: 'pointer', marginTop: 8, padding: 0 }}
                    onClick={() => { setUseManualPhone(false); setManualPhone(''); }}
                  >
                    ← Pick from saved contractors
                  </button>
                )}
              </div>
            )}

            <p style={{ fontSize: 12, color: 'var(--ink-ghost)', marginBottom: 16 }}>
              They'll receive an SMS with a link to view and check off all rooms for this checkout.
            </p>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSend} disabled={sending}>
                {sending ? 'Sending…' : '📲 Send SMS'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Assign Maintenance Task modal ── */
function AssignMaintenanceModal({ task, listingId, coHosts, contractors, onClose }) {
  const [assignType, setAssignType]   = useState('contractor');
  const [userId, setUserId]           = useState('');
  const [phone, setPhone]             = useState('');
  const [sending, setSending]         = useState(false);
  const [sent, setSent]               = useState(false);
  const [error, setError]             = useState('');

  const handleAssign = async () => {
    if (assignType === 'cohost' && !userId) { setError('Please select a co-host'); return; }
    if (assignType === 'contractor' && !phone.trim()) { setError('Phone number is required'); return; }
    setSending(true); setError('');
    try {
      await api.post(`/maintenance/${task.id}/assign`, {
        type:   assignType,
        userId: assignType === 'cohost' ? userId : undefined,
        phone:  assignType === 'contractor' ? phone.trim() : undefined,
      });
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to assign');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <h3>Assign maintenance task</h3>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        {sent ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>
              {assignType === 'contractor' ? '📲' : '✅'}
            </div>
            <p style={{ fontWeight: 600, marginBottom: 6 }}>
              {assignType === 'contractor' ? 'SMS sent!' : 'Co-host assigned!'}
            </p>
            <p style={{ fontSize: 13, color: 'var(--ink-ghost)' }}>
              {assignType === 'contractor'
                ? 'The contractor will receive a link to mark the task complete.'
                : 'The co-host will see this task in their dashboard.'}
            </p>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={onClose}>Done</button>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 16 }}>
              🔧 <strong>{task.title}</strong>
              {task.roomName && ` — ${task.roomName}`}
            </p>

            {/* Toggle */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {['contractor', 'cohost'].map((t) => (
                <button
                  key={t}
                  className={`btn btn-sm ${assignType === t ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => { setAssignType(t); setError(''); }}
                >
                  {t === 'contractor' ? '📲 Contractor (SMS)' : '👥 Co-host'}
                </button>
              ))}
            </div>

            {error && <div className="alert alert-error" style={{ marginBottom: 14 }}>{error}</div>}

            {assignType === 'contractor' && (
              <div className="form-group">
                <label>Phone number</label>
                {contractors.length > 0 && (
                  <select className="input" style={{ marginBottom: 8 }}
                    onChange={(e) => setPhone(e.target.value)} value={phone}>
                    <option value="">Pick a saved contractor…</option>
                    {contractors.map((c) => (
                      <option key={c.id} value={c.phone}>
                        {c.name}{c.trade ? ` — ${c.trade}` : ''} · {c.phone}
                      </option>
                    ))}
                  </select>
                )}
                <input className="input" placeholder="Or enter a phone number"
                  value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            )}

            {assignType === 'cohost' && (
              <div className="form-group">
                <label>Select co-host</label>
                {coHosts.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--ink-ghost)' }}>
                    No accepted co-hosts on this listing yet.
                  </p>
                ) : (
                  <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)}>
                    <option value="">Choose a co-host…</option>
                    {coHosts.map((ch) => (
                      <option key={ch.userId} value={ch.userId}>{ch.user?.name} ({ch.user?.email})</option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAssign} disabled={sending}>
                {sending ? 'Assigning…' : 'Assign'}
              </button>
            </div>
          </>
        )}
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

const CLEANING_SECTION = {
  wrapper: { background: '#f0f9ff', borderRadius: 8, padding: '12px 14px', marginBottom: 16 },
  header:  { fontSize: 13, fontWeight: 600, color: '#0369a1', marginBottom: 10 },
  item:    { fontSize: 13, padding: '5px 10px', background: '#e0f2fe',
             borderRadius: 6, border: '1px solid #bae6fd', color: '#0c4a6e' },
};
const MAINT_SECTION = {
  wrapper: { background: '#fffbeb', borderRadius: 8, padding: '12px 14px' },
  header:  { fontSize: 13, fontWeight: 600, color: '#92400e', marginBottom: 10 },
  item:    { padding: '10px 12px', background: '#fef3c7', borderRadius: 8, border: '1px solid #fde68a' },
};

const TOKEN_STATUS_STYLE = {
  PENDING:  { background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' },
  ACCEPTED: { background: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7' },
};
const TOKEN_STATUS_LABEL = {
  PENDING:  '📲 Awaiting Acceptance',
  ACCEPTED: '✅ Accepted',
};

/* ── Main component ── */
export default function ListingDetail() {
  const { user: currentUser } = useAuth();
  const { id } = useParams();
  const [listing, setListing]             = useState(null);
  const [allRooms, setAllRooms]           = useState([]);
  const [jobs, setJobs]                   = useState([]);
  const [maintRooms, setMaintRooms]       = useState([]);
  const [contractors, setContractors]     = useState([]);
  const [tokenStatuses, setTokenStatuses] = useState({});  // dateKey → jobToken
  const [loading, setLoading]             = useState(true);
  const [roomModal, setRoomModal]         = useState(false);
  const [editRoom, setEditRoom]           = useState(null);
  const [taskModal, setTaskModal]         = useState(null);
  const [checklistModal, setChecklistModal] = useState(null);
  const [sendLinkModal, setSendLinkModal] = useState(null);
  const [withdrawing, setWithdrawing]     = useState(null);
  const [expanded, setExpanded]           = useState({});
  const [expandedRooms, setExpandedRooms] = useState({});
  const [togglingItem, setTogglingItem]   = useState(null);
  const [tab, setTab]                     = useState('spaces');

  const [coHosts, setCoHosts]                     = useState([]);
  const [assignMaintenanceModal, setAssignMaintenanceModal] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [lRes, rRes, jRes, cRes, chRes] = await Promise.all([
        api.get(`/listings/${id}`),
        api.get(`/rooms/listing/${id}`),
        api.get(`/jobs`),
        api.get(`/contractors`),
        api.get(`/listings/${id}/cohosts`),
      ]);
      setListing(lRes.data);
      setAllRooms(rRes.data);
      setJobs(jRes.data.filter((j) => j.listing?.id === id || j.listing === id));
      setContractors(cRes.data);
      setCoHosts(chRes.data.filter((ch) => ch.status === 'ACCEPTED')); 
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

  // Fetch token status for every unique checkout date
  const loadTokenStatuses = useCallback(async (jobList) => {
    const dateKeys = [...new Set(
      jobList
        .filter((j) => j.checkoutDate)
        .map((j) => new Date(j.checkoutDate).toISOString().slice(0, 10))
    )];
    if (dateKeys.length === 0) return;
    const results = await Promise.all(
      dateKeys.map((dk) =>
        api.get(`/jobs/token-status/${id}/${dk}`)
          .then((r) => ({ dk, token: r.data }))
          .catch(() => ({ dk, token: null }))
      )
    );
    const map = {};
    results.forEach(({ dk, token }) => { map[dk] = token; });
    setTokenStatuses(map);
  }, [id]);

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    if (tab === 'spaces' || tab === 'jobs') loadMaintenance();
  }, [tab]);

  // Re-load token statuses whenever jobs change
  useEffect(() => {
    if (jobs.length > 0) loadTokenStatuses(jobs);
  }, [jobs, loadTokenStatuses]);

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

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Delete this task?')) return;
    await api.delete(`/maintenance/${taskId}`);
    loadMaintenance();
  };

  const handleCompleteTask = async (taskId) => {
    await api.patch(`/maintenance/${taskId}/complete`);
    loadMaintenance();
  };

  const handleToggleChecklistItem = async (jobId, itemId, currentCompleted) => {
    setTogglingItem(itemId);
    try {
      const res = await api.patch(`/jobs/${jobId}/checklist/${itemId}`, {
        completed: !currentCompleted,
      });
      const updatedJob = res.data;
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...updatedJob, checklist: updatedJob.checklist } : j))
      );
    } catch (err) {
      console.error('Failed to toggle checklist item', err);
    } finally {
      setTogglingItem(null);
    }
  };

  const handleWithdraw = async (token, dateKey) => {
    if (!window.confirm('Withdraw this assignment? The contractor\'s link will stop working.')) return;
    setWithdrawing(dateKey);
    try {
      await api.post(`/jobs/withdraw/${token}`);
      setTokenStatuses((prev) => ({ ...prev, [dateKey]: null }));
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to withdraw');
    } finally {
      setWithdrawing(null);
    }
  };

  const toggleExpand = (entityId) =>
    setExpanded((prev) => ({ ...prev, [entityId]: !prev[entityId] }));

  const toggleRoom = (jobId) =>
    setExpandedRooms((prev) => ({ ...prev, [jobId]: !prev[jobId] }));

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
          { key: 'spaces', label: `🏠 Spaces & Appliances (${allRooms.length})` },
          { key: 'jobs',   label: `📋 Jobs (${new Set(jobs.map((j) => j.checkoutDate ? new Date(j.checkoutDate).toISOString().slice(0, 10) : 'unknown')).size + maintRooms.flatMap((r) => r.maintenanceTasks || []).length})` },
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
          <div className="section-header" style={{ gap: 16 }}>
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

                          {isOpen && (
                            <div style={{ borderTop: '1px solid var(--border)', padding: '16px' }}>
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
                                          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                            {task.status !== 'COMPLETED' && (
                                              <button className="btn btn-secondary btn-sm"
                                                onClick={() => setAssignMaintenanceModal({ ...task, roomName: entity.name })}>
                                                👤 Assign
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

      {/* ── Jobs tab ── */}
      {tab === 'jobs' && (() => {
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
            taskType: t.taskType || 'MAINTENANCE',
            isRecurring: t.isRecurring !== false,
            paymentAmount: t.paymentAmount || null,
            attachments: t.attachments || [],
            assignedUser: t.assignedUser || null,
            assignedBy: t.assignedBy || null,
          }))
        );

        const jobsByDate = {};
        const seenJobIds = new Set();
        jobs.forEach((j) => {
          if (seenJobIds.has(j.id)) return;
          seenJobIds.add(j.id);
          const key = j.checkoutDate
            ? new Date(j.checkoutDate).toISOString().slice(0, 10)
            : 'unknown';
          if (!jobsByDate[key]) {
            jobsByDate[key] = {
              _type: 'cleaning_group',
              date: j.checkoutDate,
              dateKey: key,
              guestName: j.guestName,
              rooms: [],
            };
          }
          const roomName = j.room?.name || 'Room';
          const alreadyAdded = jobsByDate[key].rooms.some((r) => r.roomName === roomName);
          if (!alreadyAdded) {
            jobsByDate[key].rooms.push({
              jobId: j.id,
              roomName,
              status: j.status,
              checklist: j.checklist || [],
            });
          }
        });

        const cleaningGroups = Object.values(jobsByDate);

        const groupStatus = (rooms) => {
          if (rooms.every((r) => r.status === 'completed')) return 'completed';
          if (rooms.some((r) => r.status === 'in_progress')) return 'in_progress';
          return 'pending';
        };

        const sorted = [...cleaningGroups, ...maintItems].sort(
          (a, b) => new Date(a.date) - new Date(b.date)
        );
        const isMyTask = (i) => i._type === 'maintenance' && (
          i.assignedUser?.id === currentUser?.id ||
          (!i.assignedUser && i.assignedBy?.id === currentUser?.id)
        );
        const myItems    = sorted.filter(isMyTask);
        const otherItems = sorted.filter((i) => !isMyTask(i));

        const JOB_COLORS = {
          active: { background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af' },
          done:   { background: '#f8fafc', border: '1px solid #e2e8f0', color: '#94a3b8' },
        };
        const MAINT_COLORS = {
          active: { background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' },
          done:   { background: '#fafaf9', border: '1px solid #e7e5e4', color: '#a8a29e' },
        };
        const MY_TASK_COLORS = {
          active: { background: '#f5f3ff', border: '1px solid #c4b5fd', color: '#5b21b6' },
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

            {sorted.length === 0 ? (
              <div className="empty-state">
                <div style={{ fontSize: 32 }}>📋</div>
                <h3>No jobs yet</h3>
                <p>Sync your iCal to generate cleaning jobs or add maintenance tasks</p>
              </div>
            ) : (
              <>
                {/* ── Assigned to me ── */}
                {myItems.length > 0 && (
                  <>
                    <h3 style={{ fontSize: 13, fontWeight: 700, color: '#5b21b6', marginBottom: 8,
                      display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#7c3aed', display: 'inline-block' }} />
                      Assigned to me
                    </h3>
                    <div className="stack" style={{ marginBottom: 20 }}>
                      {myItems.map((item) => {
                        const isDone   = item.status === 'COMPLETED';
                        const colorSet = isDone ? MY_TASK_COLORS.done : MY_TASK_COLORS.active;
                        const taskIcon = item.taskType === 'PAYMENT_REQUEST' ? '💰' : item.taskType === 'ACTION' ? '✅' : '🔧';
                        return (
                          <div key={`my-${item.id}`}
                            style={{ padding: '14px 18px', borderRadius: 10, ...colorSet,
                              opacity: isDone ? 0.7 : 1, transition: 'opacity 0.2s' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: 13, fontWeight: 700 }}>{taskIcon} {item.roomName}</span>
                                  <span style={{ fontSize: 12 }}>— {item.title}</span>
                                </div>
                                <p style={{ fontSize: 12, marginBottom: 2 }}>
                                  📅 {new Date(item.date).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                                </p>
                                {item.paymentAmount && <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>💵 {item.paymentAmount}</p>}
                                {item.notes && <p style={{ fontSize: 12, marginBottom: 2 }}>{item.notes}</p>}
                                {item.isRecurring
                                  ? <p style={{ fontSize: 11, marginTop: 2 }}>🔁 Every {item.intervalMonths}mo</p>
                                  : <p style={{ fontSize: 11, marginTop: 2 }}>📌 One-time</p>}
                                {item.attachments.length > 0 && (
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                                    {item.attachments.map((url, i) => {
                                      const isImage = url.includes('/image/upload/') && !url.toLowerCase().includes('.pdf');
                                      return !isImage ? (
                                        <a key={i} href={url} target="_blank" rel="noreferrer"
                                          style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6,
                                            background: 'rgba(0,0,0,0.08)', color: colorSet.color, textDecoration: 'none' }}>
                                          📄 Attachment {i + 1}
                                        </a>
                                      ) : (
                                        <a key={i} href={url} target="_blank" rel="noreferrer">
                                          <img src={url} alt={`Attachment ${i + 1}`}
                                            style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, border: '1px solid rgba(0,0,0,0.1)', display: 'block' }} />
                                        </a>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 10, flexShrink: 0 }}>
                                {!isDone && (
                                  <button className="btn btn-secondary btn-sm"
                                    style={{ fontSize: 11 }}
                                    onClick={() => handleCompleteTask(item.id)}>
                                    ✅ Mark complete
                                  </button>
                                )}
                                {item.assignedBy?.id === currentUser?.id && (
                                  <button className="btn btn-danger btn-sm"
                                    style={{ fontSize: 11 }}
                                    onClick={() => handleDeleteTask(item.id)}>
                                    🗑
                                  </button>
                                )}
                                <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, fontWeight: 600,
                                  background: isDone ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.08)', color: colorSet.color }}>
                                  {TASK_STATUS_LABEL[item.status]}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* ── Everything else ── */}
                {otherItems.length > 0 && (
                  <>
                    {myItems.length > 0 && (
                      <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 8 }}>
                        All jobs
                      </h3>
                    )}
                    <div className="stack">
                      {otherItems.map((item) => {

                        if (item._type === 'cleaning_group') {
                    const aggStatus  = groupStatus(item.rooms);
                    const isDone     = aggStatus === 'completed';
                    const colorSet   = isDone ? JOB_COLORS.done : JOB_COLORS.active;
                    const dateKey    = item.dateKey;
                    const activeToken = tokenStatuses[dateKey];
                    const isWithdrawing = withdrawing === dateKey;

                    return (
                      <div key={`checkout-${item.date}`}
                        style={{ padding: '14px 18px', borderRadius: 10, ...colorSet,
                          opacity: isDone ? 0.7 : 1, transition: 'opacity 0.2s' }}>

                        <div style={{ display: 'flex', justifyContent: 'space-between',
                          alignItems: 'flex-start', marginBottom: 10 }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                              <span style={{ fontSize: 13, fontWeight: 700 }}>🧹 Checkout Clean</span>
                              {item.guestName && (
                                <span style={{ fontSize: 12, fontWeight: 400 }}>— {item.guestName}</span>
                              )}
                            </div>
                            <p style={{ fontSize: 12 }}>
                              📅 {new Date(item.date).toLocaleDateString(undefined, {
                                weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
                              })}
                            </p>
                          </div>

                          {/* Right side: status badge + assign/withdraw controls */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            {/* Job status badge */}
                            <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99,
                              fontWeight: 600, background: isDone ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.08)',
                              color: colorSet.color }}>
                              {STATUS_LABEL[aggStatus]}
                            </span>

                            {/* Assignment status badge */}
                            {/* Assignment status badge */}
                            {activeToken && !isDone && (
                              <span style={{
                                fontSize: 11, padding: '3px 9px', borderRadius: 99, fontWeight: 600,
                                ...TOKEN_STATUS_STYLE[activeToken.status],
                              }}>
                                {TOKEN_STATUS_LABEL[activeToken.status]}
                                {activeToken.contractorName ? ` · ${activeToken.contractorName}` : ''}
                              </span>
                            )}

                            {/* Withdraw button */}
                            {activeToken && !isDone && (
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => handleWithdraw(activeToken.token, dateKey)}
                                disabled={isWithdrawing}
                                style={{ fontSize: 11, whiteSpace: 'nowrap' }}
                              >
                                {isWithdrawing ? 'Withdrawing…' : 'Withdraw'}
                              </button>
                            )}

                            {/* Assign button — hidden if already assigned or done */}
                            {!activeToken && !isDone && (
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => setSendLinkModal({ checkoutDate: item.date })}
                                style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                                📲 Assign
                              </button>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {item.rooms.map((r) => {
                            const roomDone   = r.status === 'completed';
                            const isRoomOpen = !!expandedRooms[r.jobId];
                            const checklist  = r.checklist;
                            const doneCount  = checklist.filter((c) => c.completed).length;

                            return (
                              <div key={r.jobId}>
                                <div
                                  onClick={() => toggleRoom(r.jobId)}
                                  style={{ display: 'flex', justifyContent: 'space-between',
                                    alignItems: 'center', padding: '7px 10px', borderRadius: 7,
                                    background: roomDone ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.6)',
                                    border: '1px solid rgba(0,0,0,0.06)',
                                    cursor: 'pointer', userSelect: 'none' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: colorSet.color,
                                      opacity: roomDone ? 0.6 : 1 }}>
                                      🛏 {r.roomName}
                                    </span>
                                    {checklist.length > 0 && (
                                      <span style={{ fontSize: 11, color: colorSet.color, opacity: 0.6 }}>
                                        {doneCount}/{checklist.length} tasks done
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 11, color: colorSet.color, opacity: 0.8 }}>
                                      {STATUS_LABEL[r.status]}
                                    </span>
                                    <span style={{ fontSize: 11, color: colorSet.color, opacity: 0.4 }}>
                                      {isRoomOpen ? '▲' : '▼'}
                                    </span>
                                  </div>
                                </div>

                                {isRoomOpen && (
                                  <div style={{ margin: '3px 0 3px 10px', padding: '8px 12px',
                                    borderRadius: 7, background: 'rgba(255,255,255,0.5)',
                                    border: '1px solid rgba(0,0,0,0.05)' }}>
                                    {checklist.length === 0 ? (
                                      <p style={{ fontSize: 12, color: colorSet.color, opacity: 0.6, margin: 0 }}>
                                        No checklist items for this room.
                                      </p>
                                    ) : (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                                        {checklist.map((ci) => (
                                          <label key={ci.id}
                                            style={{ display: 'flex', alignItems: 'center', gap: 9,
                                              cursor: togglingItem === ci.id ? 'wait' : 'pointer',
                                              opacity: togglingItem === ci.id ? 0.5 : 1 }}>
                                            <input
                                              type="checkbox"
                                              checked={!!ci.completed}
                                              disabled={togglingItem === ci.id}
                                              onChange={() => handleToggleChecklistItem(r.jobId, ci.id, ci.completed)}
                                              style={{ width: 15, height: 15, cursor: 'pointer', flexShrink: 0 }}
                                            />
                                            <span style={{ fontSize: 12, color: colorSet.color,
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
                      </div>
                    );
                  }

                  /* ── Maintenance task card ── */
                  const isDone   = item.status === 'COMPLETED';
                  const colorSet = isDone ? MAINT_COLORS.done : MAINT_COLORS.active;

                  const taskIcon = item.taskType === 'PAYMENT_REQUEST' ? '💰' : item.taskType === 'ACTION' ? '✅' : '🔧';

                  return (
                    <div key={`maint-${item.id}`}
                      style={{ padding: '14px 18px', borderRadius: 10, ...colorSet,
                        opacity: isDone ? 0.7 : 1, transition: 'opacity 0.2s' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 13, fontWeight: 700 }}>{taskIcon} {item.roomName}</span>
                            <span style={{ fontSize: 12, fontWeight: 400 }}>— {item.title}</span>
                          </div>
                          <p style={{ fontSize: 12, marginBottom: 2 }}>
                            📅 {new Date(item.date).toLocaleDateString(undefined, {
                              weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
                            })}
                          </p>
                          {item.paymentAmount && (
                            <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>
                              💵 {item.paymentAmount}
                            </p>
                          )}
                          {item.notes && (
                            <p style={{ fontSize: 12, marginBottom: 2 }}>{item.notes}</p>
                          )}
                          {item.assignedUser && (
                            <p style={{ fontSize: 11, marginBottom: 2 }}>👤 {item.assignedUser.name}</p>
                          )}
                          {item.isRecurring
                            ? <p style={{ fontSize: 11, marginTop: 2 }}>🔁 Every {item.intervalMonths}mo</p>
                            : <p style={{ fontSize: 11, marginTop: 2 }}>📌 One-time</p>
                          }
                          {item.attachments.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                              {item.attachments.map((url, i) => {
                                const isPdf = url.toLowerCase().includes('.pdf') || url.includes('/raw/upload/');
                                return isPdf ? (
                                  <a key={i} href={url} target="_blank" rel="noreferrer"
                                    style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6,
                                      background: 'rgba(0,0,0,0.08)', color: colorSet.color,
                                      textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    📄 Attachment {i + 1}
                                  </a>
                                ) : (
                                  <a key={i} href={url} target="_blank" rel="noreferrer">
                                    <img src={url} alt={`Attachment ${i + 1}`}
                                      style={{ width: 56, height: 56, objectFit: 'cover',
                                        borderRadius: 6, border: '1px solid rgba(0,0,0,0.1)', display: 'block' }} />
                                  </a>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 10 }}>
                          {!isDone && (
                            <>
                              <button className="btn btn-secondary btn-sm"
                                style={{ fontSize: 11 }}
                                onClick={() => setAssignMaintenanceModal(item)}>
                                👤 Assign
                              </button>
                              <button className="btn btn-secondary btn-sm"
                                style={{ fontSize: 11 }}
                                onClick={() => handleCompleteTask(item.id)}>
                                ✅ Mark complete
                              </button>
                            </>
                          )}
                          {item.assignedBy?.id === currentUser?.id && (
                            <button className="btn btn-danger btn-sm"
                              style={{ fontSize: 11 }}
                              onClick={() => handleDeleteTask(item.id)}>
                              🗑
                            </button>
                          )}
                          <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99,
                            fontWeight: 600, background: isDone ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.08)',
                            color: colorSet.color }}>
                            {TASK_STATUS_LABEL[item.status]}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                      })}
                    </div>
                  </>
                )}
              </>
            )}
          </>
        );
      })()}

      {/* Modals */}
      {roomModal && (
        <RoomModal listingId={id} room={editRoom} onClose={() => setRoomModal(false)}
          onSaved={() => { setRoomModal(false); load(); loadMaintenance(); }} />
      )}
      {taskModal && (
        <AddTaskModal listingId={id} room={taskModal} onClose={() => setTaskModal(null)}
          onSaved={() => { setTaskModal(null); loadMaintenance(); }} />
      )}
      {checklistModal && (
        <AddChecklistItemModal room={checklistModal} onClose={() => setChecklistModal(null)}
          onSaved={() => { setChecklistModal(null); loadMaintenance(); }} />
      )}
      {sendLinkModal && (
        <SendLinkModal
          listingId={id}
          checkoutDate={sendLinkModal.checkoutDate}
          contractors={contractors}
          onClose={() => setSendLinkModal(null)}
          onSent={() => loadTokenStatuses(jobs)}
        />
      )}
      {assignMaintenanceModal && (
        <AssignMaintenanceModal
          task={assignMaintenanceModal}
          listingId={id}
          coHosts={coHosts}
          contractors={contractors}
          onClose={() => setAssignMaintenanceModal(null)}
        />
      )}
    </div>
  );
}