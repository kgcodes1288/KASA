import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import HowToUseSection from '../components/HowToUseSection';
import { useAuth } from '../context/AuthContext';

// ── Role Badge ───────────────────────────────────────────────────────────────
function RoleBadge({ role }) {
  const isCoHost = role === 'COHOST';
  return (
    <span style={{
      fontSize: 11,
      fontWeight: 600,
      padding: '3px 8px',
      borderRadius: 20,
      backgroundColor: isCoHost ? '#ede9fe' : '#f0fdf4',
      color: isCoHost ? '#6d28d9' : '#15803d',
      border: `1px solid ${isCoHost ? '#c4b5fd' : '#86efac'}`,
    }}>
      {isCoHost ? 'Co-host' : 'View Only'}
    </span>
  );
}

// ── Mini Calendar Component ──────────────────────────────────────────────────
function MiniCalendar({ jobs }) {
  const today = new Date();
  const [current, setCurrent] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  const year = current.getFullYear();
  const month = current.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const prevMonth = () => setCurrent(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrent(new Date(year, month + 1, 1));

  const dateMap = {};
  jobs.forEach((job) => {
    const checkout = job.checkoutDate ? new Date(job.checkoutDate) : null;
    const checkin = job.checkinDate ? new Date(job.checkinDate) : null;

    if (checkout) {
      const key = `${checkout.getFullYear()}-${checkout.getMonth()}-${checkout.getDate()}`;
      dateMap[key] = 'checkout';
    }

    if (checkin && checkout) {
      const d = new Date(checkin);
      while (d < checkout) {
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        if (!dateMap[key]) dateMap[key] = 'booked';
        d.setDate(d.getDate() + 1);
      }
    }
  });

  const getDayStatus = (day) => dateMap[`${year}-${month}-${day}`] || null;
  const isToday = (day) => today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;

  const dayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const monthName = current.toLocaleString('default', { month: 'long', year: 'numeric' });

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button className="btn-icon" onClick={prevMonth} style={{ padding: '4px 8px', fontSize: 14 }}>‹</button>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{monthName}</span>
        <button className="btn-icon" onClick={nextMonth} style={{ padding: '4px 8px', fontSize: 14 }}>›</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
        {dayLabels.map((d) => (
          <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--ink-ghost)', padding: '2px 0' }}>
            {d}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} />;
          const status = getDayStatus(day);
          const todayFlag = isToday(day);

          let bg = 'transparent';
          let color = 'var(--ink)';
          let title = '';

          if (status === 'booked')   { bg = '#fee2e2'; color = '#b91c1c'; title = 'Booked'; }
          if (status === 'checkout') { bg = '#fef3c7'; color = '#92400e'; title = 'Checkout / Cleaning'; }

          return (
            <div
              key={day}
              title={title}
              style={{
                textAlign: 'center',
                fontSize: 12,
                padding: '5px 2px',
                borderRadius: 6,
                background: bg,
                color: todayFlag ? 'var(--teal)' : color,
                fontWeight: todayFlag ? 700 : 400,
                outline: todayFlag ? '2px solid var(--teal)' : 'none',
                outlineOffset: '-1px',
              }}
            >
              {day}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: 11, color: 'var(--ink-ghost)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: '#fee2e2', display: 'inline-block' }} /> Booked
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: '#fef3c7', display: 'inline-block' }} /> Checkout
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, outline: '2px solid var(--teal)', display: 'inline-block' }} /> Today
        </span>
      </div>
    </div>
  );
}

// ── Listing Modal ────────────────────────────────────────────────────────────
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
        await api.put(`/listings/${listing.id}`, form);
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
          <p style={{ fontSize: 12, marginTop: 4 }}>Find this in Airbnb → Listing → Availability → Export calendar</p>
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

// ── Quick Task Modal ──────────────────────────────────────────────────────────
function QuickTaskModal({ listing, isOwner, currentUser, onClose, onSaved }) {
  const [coHosts, setCoHosts]         = useState([]);
  const [rooms, setRooms]             = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  const [title, setTitle]             = useState('');
  const [notes, setNotes]             = useState('');
  const [taskType, setTaskType]       = useState('ACTION');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [assignedTo, setAssignedTo]   = useState('');
  const [scope, setScope]             = useState('general');
  const [roomId, setRoomId]           = useState('');
  const [scheduleType, setScheduleType] = useState('one_time');
  const [dueDate, setDueDate]         = useState('');
  const [intervalMonths, setIntervalMonths] = useState(1);
  const [lastServicedAt, setLastServicedAt] = useState('');
  const [nextDueAt, setNextDueAt]     = useState('');
  const [error, setError]             = useState('');
  const [saving, setSaving]           = useState(false);

  useEffect(() => {
    if (scheduleType === 'recurring' && lastServicedAt && intervalMonths >= 1) {
      const d = new Date(lastServicedAt);
      d.setMonth(d.getMonth() + parseInt(intervalMonths));
      setNextDueAt(d.toISOString().slice(0, 10));
    }
  }, [lastServicedAt, intervalMonths, scheduleType]);

  useEffect(() => {
    const fetches = [api.get(`/rooms/listing/${listing.id}`)];
    if (isOwner) fetches.push(api.get(`/listings/${listing.id}/cohosts`));
    Promise.all(fetches)
      .then((results) => {
        setRooms(results[0].data);
        if (isOwner && results[1]) {
          setCoHosts(results[1].data.filter((ch) => ch.status === 'ACCEPTED'));
        }
      })
      .catch(() => {})
      .finally(() => setLoadingData(false));
  }, [listing.id, isOwner]);

  const assigneeOptions = isOwner
    ? [
        { value: currentUser.id, label: `Me (${currentUser.name})` },
        ...coHosts
          .filter((ch) => ch.userId)
          .map((ch) => ({ value: ch.userId, label: ch.user?.name || 'Co-host' })),
      ]
    : [
        { value: currentUser.id, label: `Me (${currentUser.name})` },
        listing.host ? { value: listing.host.id, label: `Host: ${listing.host.name}` } : null,
      ].filter(Boolean);

  const handleSave = async () => {
    if (!title.trim()) { setError('Title is required'); return; }
    const due = scheduleType === 'one_time' ? dueDate : nextDueAt;
    if (!due) { setError('Due date is required'); return; }
    if (scope === 'room' && !roomId) { setError('Please select a room'); return; }
    setSaving(true); setError('');
    try {
      await api.post(`/listings/${listing.id}/maintenance`, {
        title: title.trim(),
        notes: notes.trim() || null,
        taskType,
        paymentAmount: taskType === 'PAYMENT_REQUEST' ? paymentAmount.trim() || null : null,
        intervalMonths: scheduleType === 'recurring' ? parseInt(intervalMonths) : 0,
        isRecurring: scheduleType === 'recurring',
        lastServicedAt: scheduleType === 'recurring' ? lastServicedAt || null : null,
        nextDueAt: due,
        roomId: scope === 'room' ? roomId : null,
        assignedUserId: assignedTo || null,
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const seg = (active) => ({
    flex: 1, padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
    fontSize: 13, fontFamily: 'var(--font-body)',
    fontWeight: active ? 600 : 400,
    background: active ? 'var(--teal)' : 'var(--bg-card)',
    color: active ? '#fff' : 'var(--ink)',
    border: active ? '2px solid var(--teal)' : '2px solid var(--border)',
    boxShadow: active ? '0 1px 4px rgba(0,137,123,0.25)' : 'none',
    transition: 'all 0.15s ease',
  });

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h3>Add task — {listing.name}</h3>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        {loadingData ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
            <div className="spinner" />
          </div>
        ) : (
          <>
            {error && <div className="alert alert-error" style={{ marginBottom: 14 }}>{error}</div>}

            {/* Task type */}
            <div className="form-group">
              <label>Task type</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={seg(taskType === 'ACTION')} onClick={() => setTaskType('ACTION')}>
                  ✅ Request Action
                </button>
                <button style={seg(taskType === 'PAYMENT_REQUEST')} onClick={() => setTaskType('PAYMENT_REQUEST')}>
                  💰 Request Payment
                </button>
              </div>
            </div>

            {/* Title */}
            <div className="form-group">
              <label>{taskType === 'PAYMENT_REQUEST' ? "What's the payment for?" : 'Title'}</label>
              <input
                className="input"
                placeholder={taskType === 'PAYMENT_REQUEST' ? 'e.g. Cleaning fee reimbursement' : 'e.g. Fix the broken lock'}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {/* Payment amount — only for PAYMENT_REQUEST */}
            {taskType === 'PAYMENT_REQUEST' && (
              <div className="form-group">
                <label>Payment amount <span style={{ fontWeight: 400, color: 'var(--ink-ghost)' }}>(optional)</span></label>
                <input
                  className="input"
                  placeholder="e.g. $150"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                />
              </div>
            )}

            {/* Notes */}
            <div className="form-group">
              <label>
                {taskType === 'PAYMENT_REQUEST' ? 'Any additional details' : 'Notes'}
                {' '}<span style={{ fontWeight: 400, color: 'var(--ink-ghost)' }}>(optional)</span>
              </label>
              <textarea className="input" rows={2}
                placeholder={taskType === 'PAYMENT_REQUEST' ? 'e.g. Invoice attached, bank transfer preferred…' : 'Any extra details…'}
                value={notes} onChange={(e) => setNotes(e.target.value)} style={{ resize: 'vertical' }} />
            </div>

            {/* Assigned to */}
            {assigneeOptions.length > 0 && (
              <div className="form-group">
                <label>Assigned to</label>
                <select className="input" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                  <option value="">Unassigned</option>
                  {assigneeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Scope */}
            <div className="form-group">
              <label>Applies to</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={seg(scope === 'general')} onClick={() => { setScope('general'); setRoomId(''); }}>
                  🏠 General (entire property)
                </button>
                <button style={seg(scope === 'room')} onClick={() => setScope('room')}>
                  🛏 Specific room
                </button>
              </div>
              {scope === 'room' && (
                <select className="input" style={{ marginTop: 10 }} value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                  <option value="">Choose a room…</option>
                  {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              )}
            </div>

            {/* Schedule */}
            <div className="form-group">
              <label>Schedule</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={seg(scheduleType === 'one_time')} onClick={() => setScheduleType('one_time')}>
                  📅 One-time
                </button>
                <button style={seg(scheduleType === 'recurring')} onClick={() => setScheduleType('recurring')}>
                  🔁 Recurring
                </button>
              </div>
            </div>

            {scheduleType === 'one_time' && (
              <div className="form-group">
                <label>Due date</label>
                <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            )}

            {scheduleType === 'recurring' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label>Interval (months)</label>
                    <input className="input" type="number" min={1} value={intervalMonths}
                      onChange={(e) => setIntervalMonths(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Last serviced <span style={{ fontWeight: 400, color: 'var(--ink-ghost)' }}>(optional)</span></label>
                    <input className="input" type="date" value={lastServicedAt}
                      onChange={(e) => setLastServicedAt(e.target.value)} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Next due date</label>
                  <input className="input" type="date" value={nextDueAt}
                    onChange={(e) => setNextDueAt(e.target.value)} />
                  {lastServicedAt && (
                    <p style={{ fontSize: 12, marginTop: 4, color: 'var(--ink-ghost)' }}>
                      Auto-calculated from last serviced + interval
                    </p>
                  )}
                </div>
              </>
            )}

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Add task'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Listing Card ─────────────────────────────────────────────────────────────
function ListingCard({ l, isOwner, coHostRole, listingJobs, onEdit, onDelete, onSync, onAddTask, syncing, syncErrors, expandedCalendars, toggleCalendar }) {
  const showCal = expandedCalendars[l.id];
  const canEdit = isOwner || coHostRole === 'COHOST';

  return (
    <div key={l.id} className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <h3 style={{ marginBottom: 2 }}>{l.name}</h3>
          {l.address && <p style={{ fontSize: 13 }}>📍 {l.address}</p>}
          {!isOwner && l.host && (
            <p style={{ fontSize: 12, color: 'var(--ink-ghost)', marginTop: 4 }}>
              Owner: {l.host.name}
            </p>
          )}
        </div>
        {!isOwner && <RoleBadge role={coHostRole} />}
      </div>

      <div style={{ fontSize: 12, color: 'var(--ink-ghost)', marginBottom: 14 }}>
        {l.lastSynced ? `Last synced: ${new Date(l.lastSynced).toLocaleString()}` : 'Never synced'}
      </div>

      <div className="cluster">
        <Link to={`/listings/${l.id}`} className="btn btn-secondary btn-sm">
          🛏 Manage rooms
        </Link>
        {canEdit && (
          <>
            <button className="btn btn-secondary btn-sm" onClick={() => onAddTask(l)}>
              + Add task
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => onSync(l.id)} disabled={syncing[l.id]}>
              {syncing[l.id] ? '⏳ Syncing…' : '🔄 Sync iCal'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => onEdit(l)}>
              ✏️ Edit
            </button>
          </>
        )}
        {isOwner && (
          <button className="btn btn-danger btn-sm" onClick={() => onDelete(l.id)}>
            🗑
          </button>
        )}
      </div>

      {syncErrors[l.id] && (
        <div style={{
          marginTop: 10,
          padding: '8px 12px',
          background: '#fef2f2',
          border: '1px solid #fca5a5',
          borderRadius: 8,
          fontSize: 12,
          color: '#b91c1c',
        }}>
          ⚠️ {syncErrors[l.id]}
        </div>
      )}

      <button
        onClick={() => toggleCalendar(l.id)}
        style={{
          marginTop: 14,
          width: '100%',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '7px 12px',
          fontSize: 13,
          color: 'var(--ink-soft)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontFamily: 'var(--font-body)',
        }}
      >
        <span>📅 Booking calendar {listingJobs.length > 0 ? `· ${new Set(listingJobs.map((j) => j.checkoutDate ? new Date(j.checkoutDate).toISOString().slice(0, 10) : j.id)).size} jobs synced` : '· no jobs yet'}</span>
        <span>{showCal ? '▲' : '▼'}</span>
      </button>

      {showCal && <MiniCalendar jobs={listingJobs} />}
    </div>
  );
}

// ── Host Dashboard ───────────────────────────────────────────────────────────
export default function HostDashboard() {
  const { user: currentUser } = useAuth();
  const [listings, setListings] = useState([]);
  const [coHostedListings, setCoHostedListings] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [syncing, setSyncing] = useState({});
  const [syncErrors, setSyncErrors] = useState({});
  const [expandedCalendars, setExpandedCalendars] = useState({});
  const [quickTaskModal, setQuickTaskModal] = useState(null); // { listing, isOwner }

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/listings'),
      api.get('/jobs'),
      api.get('/cohosts/my-listings'),
    ])
      .then(([lRes, jRes, cRes]) => {
        setListings(lRes.data);
        setJobs(jRes.data);
        setCoHostedListings(cRes.data);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this listing and all its rooms?')) return;
    await api.delete(`/listings/${id}`);
    load();
  };

const handleSync = async (id) => {
  setSyncing((s) => ({ ...s, [id]: true }));
  setSyncErrors((e) => ({ ...e, [id]: null }));
  try {
    await api.post(`/listings/${id}/sync`);
    load();
  } catch (err) {
    setSyncErrors((e) => ({ ...e, [id]: 'Sync failed, please try again' }));  // ← changed
  } finally {
    setSyncing((s) => ({ ...s, [id]: false }));
  }
};

  const toggleCalendar = (id) =>
    setExpandedCalendars((prev) => ({ ...prev, [id]: !prev[id] }));

  const jobsForListing = (listingId) =>
    jobs.filter((j) => j.listing?.id === listingId || j.listing === listingId);

  const allEmpty = listings.length === 0 && coHostedListings.length === 0;

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
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <div className="spinner" />
        </div>
      ) : allEmpty ? (
        <>
          <div className="empty-state">
            <div style={{ fontSize: 40 }}>🏠</div>
            <h3>No listings yet</h3>
            <p>Create your first listing to get started</p>
          </div>
          <div style={{ marginTop: 24 }}>
            <HowToUseSection defaultOpen={true} />
          </div>
        </>
      ) : (
        <>
          {/* Owned listings */}
          {listings.length > 0 && (
            <>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', marginBottom: 16 }}>
                My Properties
              </h2>
              <div className="grid-2" style={{ marginBottom: 32 }}>
                {listings.map((l) => (
                  <ListingCard
                    key={l.id}
                    l={l}
                    isOwner={true}
                    coHostRole={null}
                    listingJobs={jobsForListing(l.id)}
                    onEdit={(l) => { setEditTarget(l); setShowModal(true); }}
                    onDelete={handleDelete}
                    onSync={handleSync}
                    onAddTask={(l) => setQuickTaskModal({ listing: l, isOwner: true })}
                    syncing={syncing}
                    syncErrors={syncErrors}
                    expandedCalendars={expandedCalendars}
                    toggleCalendar={toggleCalendar}
                  />
                ))}
              </div>
            </>
          )}

          {/* Co-hosted listings */}
          {coHostedListings.length > 0 && (
            <>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', marginBottom: 16 }}>
                Shared With Me
              </h2>
              <div className="grid-2">
                {coHostedListings.map((l) => (
                  <ListingCard
                    key={l.id}
                    l={l}
                    isOwner={false}
                    coHostRole={l.coHostRole}
                    listingJobs={jobsForListing(l.id)}
                    onEdit={(l) => { setEditTarget(l); setShowModal(true); }}
                    onDelete={handleDelete}
                    onSync={handleSync}
                    onAddTask={(l) => setQuickTaskModal({ listing: l, isOwner: false })}
                    syncing={syncing}
                    syncErrors={syncErrors}
                    expandedCalendars={expandedCalendars}
                    toggleCalendar={toggleCalendar}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {showModal && (
        <ListingModal
          listing={editTarget}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}
      {quickTaskModal && currentUser && (
        <QuickTaskModal
          listing={quickTaskModal.listing}
          isOwner={quickTaskModal.isOwner}
          currentUser={currentUser}
          onClose={() => setQuickTaskModal(null)}
          onSaved={() => setQuickTaskModal(null)}
        />
      )}
    </div>
  );
}
