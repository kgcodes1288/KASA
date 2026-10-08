import { useState, useEffect } from 'react';
import api from '../api';

export default function QuickTaskModal({ listing, isOwner, currentUser, onClose, onSaved, allowMaintenance = false }) {
  const [coHosts, setCoHosts]         = useState([]);
  const [rooms, setRooms]             = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  const [title, setTitle]             = useState('');
  const [notes, setNotes]             = useState('');
  const [taskType, setTaskType]       = useState('ACTION');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [attachedFiles, setAttachedFiles] = useState([]); // [{ name, url, uploading, error }]
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

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    e.target.value = '';
    const newEntries = files.map((f) => ({ name: f.name, file: f, error: null }));
    setAttachedFiles((prev) => [...prev, ...newEntries]);
  };

  const removeFile = (idx) => setAttachedFiles((prev) => prev.filter((_, j) => j !== idx));

  const handleSave = async () => {
    if (!title.trim()) {
      setError(taskType === 'PAYMENT_REQUEST' ? "What's the payment for? is required" : 'Title is required');
      return;
    }
    const due = scheduleType === 'one_time' ? dueDate : nextDueAt;
    if (!due) { setError('Due date is required'); return; }
    if (scope === 'room' && !roomId) { setError('Please select a room'); return; }
    setSaving(true); setError('');
    try {
      // Upload all files at submit time
      const uploadedUrls = [];
      for (const entry of attachedFiles) {
        const formData = new FormData();
        formData.append('file', entry.file);
        const res = await api.post('/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        uploadedUrls.push(res.data.url);
      }

      await api.post(`/listings/${listing.id}/maintenance`, {
        title: title.trim(),
        notes: notes.trim() || null,
        taskType,
        paymentAmount: taskType === 'PAYMENT_REQUEST' ? paymentAmount.trim() || null : null,
        attachments: uploadedUrls,
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
      <div className="modal" style={{ maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
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
                {allowMaintenance && (
                  <button style={seg(taskType === 'MAINTENANCE')} onClick={() => { setTaskType('MAINTENANCE'); setScheduleType('recurring'); }}>
                    🛠️ Maintenance
                  </button>
                )}
              </div>
            </div>

            {/* Title */}
            <div className="form-group">
              <label>{taskType === 'PAYMENT_REQUEST' ? "What's the payment for?" : 'Title'}</label>
              <input
                className="input"
                placeholder={taskType === 'PAYMENT_REQUEST' ? 'e.g. Cleaning fee reimbursement' : taskType === 'MAINTENANCE' ? 'e.g. Lawn maintenance, Ring battery' : 'e.g. Fix the broken lock'}
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
                  type="number"
                  min="0"
                  placeholder="e.g. 150"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  onKeyDown={(e) => {
                    const allowed = ['Backspace','Delete','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Tab','Home','End','.'];
                    if (allowed.includes(e.key)) return;
                    if (/^[0-9]$/.test(e.key)) return;
                    e.preventDefault();
                  }}
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

            {/* Attachments */}
            <div className="form-group">
              <label>Attachments <span style={{ fontWeight: 400, color: 'var(--ink-ghost)' }}>(optional)</span></label>
              {attachedFiles.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                  {attachedFiles.map((f, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '6px 10px', borderRadius: 7, fontSize: 12,
                      background: '#f0f9ff', border: '1px solid #bae6fd', color: '#0c4a6e',
                    }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>
                        📎 {f.name}
                      </span>
                      <button onClick={() => removeFile(i)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, lineHeight: 1, color: 'inherit', flexShrink: 0 }}>
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <label style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                padding: '7px 12px', borderRadius: 8, border: '1.5px dashed var(--border)',
                fontSize: 13, color: 'var(--ink-soft)', background: 'var(--bg)',
              }}>
                📎 Choose files
                <input type="file" multiple accept="image/*,application/pdf"
                  onChange={handleFileChange} style={{ display: 'none' }} />
              </label>
              <p style={{ fontSize: 11, color: 'var(--ink-ghost)', marginTop: 5 }}>Images or PDFs, up to 10 MB each</p>
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
