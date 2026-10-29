import { useState, useEffect } from 'react';
import api from '../api';

export default function QuickTaskModal({ listing, isOwner, currentUser, onClose, onSaved, allowMaintenance = false, allowQuote = false }) {
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
  const [items, setItems]             = useState([{ name: '', qty: 1, price: '', link: '' }]);
  const [buyMode, setBuyMode]         = useState('COHOST_BUYS');
  const [shipTo, setShipTo]           = useState('property');
  const [otherAddress, setOtherAddress] = useState('');
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

  const setItem = (i, k, v) => setItems((list) => list.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
  const itemsTotal = items.reduce((sum, it) => sum + (parseFloat(it.price) > 0 ? parseFloat(it.price) * (parseInt(it.qty) || 1) : 0), 0);

  const savePurchase = async () => {
    const list = items.filter((it) => it.name.trim());
    if (!list.length) { setError('Add at least one item'); return; }
    if (!dueDate) { setError('When do you need it by?'); return; }
    const address = shipTo === 'property' ? (listing.address || [listing.street, listing.city].filter(Boolean).join(', ')) : otherAddress.trim();
    if (buyMode === 'OWNER_ORDERS' && !address) { setError('Where should it be delivered?'); return; }
    setSaving(true); setError('');
    try {
      const uploadedUrls = [];
      for (const entry of attachedFiles) {
        const formData = new FormData();
        formData.append('file', entry.file);
        const res = await api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        uploadedUrls.push(res.data.url);
      }
      const names = list.map((it) => it.name.trim());
      await api.post(`/listings/${listing.id}/maintenance`, {
        taskType: 'PURCHASE',
        title: title.trim() || (names.length > 2 ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} more` : names.join(' and ')).slice(0, 120),
        notes: notes.trim() || null,
        purchaseItems: list.map((it) => ({ name: it.name.trim(), qty: parseInt(it.qty) || 1, price: it.price || null, link: it.link.trim() || null })),
        purchaseMode: buyMode,
        deliveryAddress: buyMode === 'OWNER_ORDERS' ? address : null,
        attachments: uploadedUrls,
        nextDueAt: dueDate,
        isRecurring: false,
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (isPurchase) return savePurchase();
    if (!title.trim()) {
      setError(taskType === 'PAYMENT_REQUEST' ? "What's the payment for? is required" : isQuote ? "What's the quote for? is required" : 'Title is required');
      return;
    }
    if (isQuote && !(parseFloat(paymentAmount) > 0)) { setError('Enter the quote amount'); return; }
    if (isQuote && !listing.host?.id) { setError('Could not find the listing owner to send this to'); return; }
    const due = scheduleType === 'one_time' || isQuote ? dueDate : nextDueAt;
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
        paymentAmount: taskType === 'PAYMENT_REQUEST' || isQuote ? paymentAmount.trim() || null : null,
        attachments: uploadedUrls,
        intervalMonths: scheduleType === 'recurring' ? parseInt(intervalMonths) : 0,
        isRecurring: scheduleType === 'recurring' && !isQuote,
        lastServicedAt: scheduleType === 'recurring' ? lastServicedAt || null : null,
        nextDueAt: due,
        roomId: scope === 'room' && !isQuote ? roomId : null,
        assignedUserId: isQuote ? listing.host.id : assignedTo || null,
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const isQuote = taskType === 'QUOTE';
  const isPurchase = taskType === 'PURCHASE';

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
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button style={seg(taskType === 'ACTION')} onClick={() => setTaskType('ACTION')}>
                  ✅ Request Action
                </button>
                <button style={seg(taskType === 'PAYMENT_REQUEST')} onClick={() => setTaskType('PAYMENT_REQUEST')}>
                  💰 Request Payment
                </button>
                {allowQuote && (
                  <button style={seg(isQuote)} onClick={() => { setTaskType('QUOTE'); setScheduleType('one_time'); setScope('general'); setRoomId(''); }}>
                    💬 Send Quote
                  </button>
                )}
                {allowQuote && (
                  <button style={seg(isPurchase)} onClick={() => { setTaskType('PURCHASE'); setScheduleType('one_time'); setScope('general'); setRoomId(''); }}>
                    🛒 Request Purchase
                  </button>
                )}
                {allowMaintenance && (
                  <button style={seg(taskType === 'MAINTENANCE')} onClick={() => { setTaskType('MAINTENANCE'); setScheduleType('recurring'); }}>
                    🛠️ Maintenance
                  </button>
                )}
              </div>
            </div>

            {isPurchase && (
              <>
                <div className="form-group">
                  <label>What do you need?</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {items.map((it, i) => (
                      <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, display: 'grid', gap: 8, background: 'var(--bg)' }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input className="input" aria-label="Item" placeholder="e.g. Bath towels (white)" value={it.name} maxLength={100}
                            onChange={(e) => setItem(i, 'name', e.target.value)} style={{ flex: 1, minWidth: 0 }} />
                          {items.length > 1 && <button type="button" className="btn-icon" aria-label="Remove item" onClick={() => setItems((l) => l.filter((_, j) => j !== i))}>✕</button>}
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <input className="input" aria-label="Quantity" type="number" min={1} max={99} value={it.qty}
                            onChange={(e) => setItem(i, 'qty', e.target.value)} style={{ width: 80 }} />
                          <input className="input" aria-label="Price each" type="number" min={0} step="0.01" placeholder="Price each ($)" value={it.price}
                            onChange={(e) => setItem(i, 'price', e.target.value)} style={{ width: 140 }} />
                          <input className="input" aria-label="Link" placeholder="Store link (optional)" value={it.link}
                            onChange={(e) => setItem(i, 'link', e.target.value)} style={{ flex: '1 1 160px', minWidth: 0 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 8, flexWrap: 'wrap' }}>
                    {items.length < 20 && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setItems((l) => [...l, { name: '', qty: 1, price: '', link: '' }])}>+ Add another item</button>}
                    <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{itemsTotal > 0 ? <>Estimated total <strong>${itemsTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></> : 'Add prices for an estimate'}</span>
                  </div>
                </div>

                <div className="form-group">
                  <label>Who's buying?</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" style={seg(buyMode === 'COHOST_BUYS')} onClick={() => setBuyMode('COHOST_BUYS')}>🛍️ I'll buy it (reimburse me)</button>
                    <button type="button" style={seg(buyMode === 'OWNER_ORDERS')} onClick={() => setBuyMode('OWNER_ORDERS')}>📦 Ask {listing.host?.name?.split(' ')[0] || 'the owner'} to order it</button>
                  </div>
                </div>

                {buyMode === 'OWNER_ORDERS' && (
                  <div className="form-group">
                    <label>Deliver to</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button type="button" style={seg(shipTo === 'property')} onClick={() => setShipTo('property')}>🏠 The property</button>
                      <button type="button" style={seg(shipTo === 'other')} onClick={() => setShipTo('other')}>📍 Another address</button>
                    </div>
                    {shipTo === 'property'
                      ? <p style={{ fontSize: 12, color: 'var(--ink-ghost)', marginTop: 6 }}>{listing.address || [listing.street, listing.city].filter(Boolean).join(', ') || 'The property address on file'}</p>
                      : <textarea className="input" rows={2} style={{ marginTop: 8 }} placeholder="e.g. your home address" maxLength={300} value={otherAddress} onChange={(e) => setOtherAddress(e.target.value)} />}
                  </div>
                )}
              </>
            )}

            {/* Title */}
            <div className="form-group">
              <label>{taskType === 'PAYMENT_REQUEST' ? "What's the payment for?" : isQuote ? "What's the quote for?" : isPurchase ? <>Short title <span style={{ fontWeight: 400, color: 'var(--ink-ghost)' }}>(optional)</span></> : 'Title'}</label>
              <input
                className="input"
                placeholder={isPurchase ? 'e.g. Bathroom restock' : taskType === 'PAYMENT_REQUEST' ? 'e.g. Cleaning fee reimbursement' : taskType === 'MAINTENANCE' ? 'e.g. Lawn maintenance, Ring battery' : isQuote ? 'e.g. Replace patio chairs, repaint living room' : 'e.g. Fix the broken lock'}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {/* Payment amount — only for PAYMENT_REQUEST */}
            {(taskType === 'PAYMENT_REQUEST' || isQuote) && (
              <div className="form-group">
                <label>{isQuote ? 'Quote amount ($)' : 'Payment amount'} {!isQuote && <span style={{ fontWeight: 400, color: 'var(--ink-ghost)' }}>(optional)</span>}</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  placeholder={isQuote ? 'e.g. 1200' : 'e.g. 150'}
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
                {taskType === 'PAYMENT_REQUEST' ? 'Any additional details' : isQuote ? 'Vendor & scope of work' : isPurchase ? 'Why it’s needed, size, colour, brand…' : 'Notes'}
                {' '}<span style={{ fontWeight: 400, color: 'var(--ink-ghost)' }}>(optional)</span>
              </label>
              <textarea className="input" rows={2}
                placeholder={isPurchase ? 'e.g. Two towels are stained; any brand is fine, white please' : taskType === 'PAYMENT_REQUEST' ? 'e.g. Invoice attached, bank transfer preferred…' : isQuote ? 'e.g. Acme Furniture — 2 chairs, delivery included, valid 14 days' : 'Any extra details…'}
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
            {(isQuote || isPurchase) && (
              <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '0 0 14px' }}>
                📨 Sent to <strong>{listing.host?.name || 'the owner'}</strong> for approval.
              </p>
            )}
            {!isQuote && !isPurchase && assigneeOptions.length > 0 && (
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
            {!isQuote && !isPurchase && (
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
            )}

            {/* Schedule */}
            {!isQuote && !isPurchase && (
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
            )}

            {(scheduleType === 'one_time' || isQuote || isPurchase) && (
              <div className="form-group">
                <label>{isQuote ? 'Reply needed by' : isPurchase ? 'Needed by' : 'Due date'}</label>
                <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            )}

            {scheduleType === 'recurring' && !isQuote && !isPurchase && (
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
                {saving ? 'Saving…' : isQuote ? 'Send quote' : isPurchase ? 'Send request' : 'Add task'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
