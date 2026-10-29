import { useState } from 'react';
import api from '../api';

// Building blocks shared by the owner and co-host overview dashboards.

export const DAY = 86400000;

// All of a listing's maintenance/task items, flattened, each tagged with its room name
export const fetchListingTasks = (listingId) =>
  api.get(`/listings/${listingId}/maintenance`).then(({ data }) =>
    data.flatMap((r) => (r.maintenanceTasks || []).map((t) => ({ ...t, roomName: r.entityType === 'GENERAL' ? null : r.name }))));

export const SOON_DAYS = 30;

const ICONS = [
  [/pool|spa|hot tub/i, '🏊'],
  [/\bac\b|a\/c|air cond|hvac|furnace|heat pump/i, '❄️'],
  [/lawn|yard|garden|grass|landscap|tree|mow/i, '🌿'],
  [/battery|ring|camera|doorbell|smoke|alarm|detector/i, '🔋'],
  [/filter/i, '🧴'],
  [/water heater|plumb|leak|faucet|drain/i, '🚰'],
  [/roof|gutter/i, '🏠'],
  [/pest|termite|bug/i, '🐜'],
  [/fridge|refrigerator|oven|stove|dishwasher|washer|dryer/i, '🔧'],
];
export const iconFor = (task) => {
  if (task.taskType === 'PAYMENT_REQUEST') return '💳';
  if (task.taskType === 'QUOTE') return '💬';
  if (task.taskType === 'PURCHASE') return '🛒';
  const hit = ICONS.find(([re]) => re.test(task.title));
  if (hit) return hit[1];
  return task.taskType === 'ACTION' ? '📞' : '🛠️';
};

export const money = (v) => {
  const n = parseFloat(String(v ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? `$${n.toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}` : String(v || '');
};
export const quoteTotal = (quotes) =>
  quotes.reduce((sum, q) => sum + (parseFloat(String(q.paymentAmount ?? '').replace(/[^0-9.]/g, '')) || 0), 0);

export const daysUntil = (date) => Math.ceil((new Date(date) - Date.now()) / DAY);

// icon + label always accompany the colour, never colour alone
export function dueInfo(days) {
  if (days < 0) return { icon: '⚠️', label: `Overdue ${-days}d`, bg: 'var(--red-pale)', fg: '#991b1b' };
  if (days === 0) return { icon: '⏰', label: 'Due today', bg: 'var(--amber-pale)', fg: '#92400e' };
  if (days <= 14) return { icon: '⏰', label: `Due in ${days}d`, bg: 'var(--amber-pale)', fg: '#92400e' };
  return { icon: '📅', label: `Due in ${days}d`, bg: 'var(--teal-pale)', fg: 'var(--teal-dark)' };
}

// How far through its service interval a recurring task is (0–1)
export function intervalProgress(t) {
  if (!t.isRecurring || !t.intervalMonths || !t.lastServicedAt) return null;
  const total = t.intervalMonths * 30.4 * DAY;
  const elapsed = Date.now() - new Date(t.lastServicedAt).getTime();
  return Math.max(0, Math.min(1, elapsed / total));
}

// recurring tasks re-arm after completion (nextDueAt moves out); one-offs stay open until done
export const isOpen = (t) => (t.isRecurring ? daysUntil(t.nextDueAt) <= SOON_DAYS : t.status !== 'COMPLETED');

export function Chip({ icon, children, bg = 'var(--bg)', fg = 'var(--ink-soft)' }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px',
      borderRadius: 999, background: bg, color: fg, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      {icon && <span aria-hidden="true">{icon}</span>}{children}
    </span>
  );
}

// Possible double-bookings across a listing's calendars (from GET /listings/:id -> conflicts)
export function ConflictAlert({ conflicts }) {
  if (!conflicts?.length) return null;
  const f = (d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return (
    <div role="alert" style={{ margin: '0 0 14px', padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, fontSize: 13, color: '#92400e' }}>
      <strong>⚠️ Possible double-booking.</strong>{' '}
      {conflicts.slice(0, 3).map((c, i) => <span key={i}>{i ? '; ' : ''}{c.a.label} {f(c.a.checkin)}–{f(c.a.checkout)} overlaps {c.b.label} {f(c.b.checkin)}–{f(c.b.checkout)}</span>)}.
      {' '}Block those dates on one of the sites.
    </div>
  );
}

export function StatTile({ icon, label, value, hint, accent }) {
  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow)',
      padding: '12px 12px', borderLeft: `4px solid ${accent}`, display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--ink-soft)', whiteSpace: 'nowrap', minWidth: 0 }}>
        <span aria-hidden="true" style={{ flex: 'none' }}>{icon}</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      </div>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 34, fontWeight: 700, lineHeight: 1.1, color: 'var(--ink)' }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink-ghost)', minHeight: 15 }}>{hint}</div>
    </div>
  );
}

export function SectionTitle({ children, count }) {
  return (
    <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', margin: '28px 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
      {children}
      {count > 0 && <span style={{ fontSize: 12, fontWeight: 600, background: 'var(--teal-pale)', color: 'var(--teal-dark)', borderRadius: 999, padding: '2px 8px' }}>{count}</span>}
    </h2>
  );
}

export function DoneButton({ task, busy, onDone, label = 'Mark done' }) {
  return (
    <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onDone(task)}>
      {busy ? '…' : `✓ ${label}`}
    </button>
  );
}

export function AttentionCard({ task, canWrite, busy, onDone }) {
  const days = daysUntil(task.nextDueAt);
  const due = dueInfo(days);
  const progress = intervalProgress(task);
  const barColor = days < 0 ? 'var(--red)' : days <= 14 ? 'var(--amber)' : 'var(--teal)';
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div aria-hidden="true" style={{ fontSize: 26, width: 46, height: 46, borderRadius: 12, background: due.bg, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          {iconFor(task)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--ink)' }}>{task.title}</div>
          <div style={{ fontSize: 12, color: 'var(--ink-ghost)', marginTop: 2 }}>
            {task.roomName || 'General'}{task.assignedUser ? ` · ${task.assignedUser.name}` : ''}
          </div>
        </div>
      </div>
      {progress !== null && (
        <div title={`${Math.round(progress * 100)}% of the service interval used`}
          style={{ height: 6, borderRadius: 999, background: 'var(--border)', overflow: 'hidden' }}>
          <div style={{ width: `${Math.max(4, progress * 100)}%`, height: '100%', borderRadius: 999, background: barColor }} />
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Chip icon={due.icon} bg={due.bg} fg={due.fg}>{due.label}</Chip>
        {canWrite && <DoneButton task={task} busy={busy} onDone={onDone} />}
      </div>
    </div>
  );
}

export function TaskCard({ task, mine, canWrite, busy, onDone }) {
  const days = daysUntil(task.nextDueAt);
  const due = dueInfo(days);
  const who = mine
    ? (task.assignedBy ? `From ${task.assignedBy.name}` : 'Unassigned')
    : `With ${task.assignedUser?.name || 'co-host'}`;
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span aria-hidden="true" style={{ fontSize: 20 }}>{iconFor(task)}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>{task.title}</div>
          {task.notes && (
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {task.notes}
            </div>
          )}
        </div>
        {task.taskType === 'PAYMENT_REQUEST' && task.paymentAmount && (
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>
            {String(task.paymentAmount).startsWith('$') ? task.paymentAmount : `$${task.paymentAmount}`}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <Chip icon={due.icon} bg={due.bg} fg={due.fg}>{due.label}</Chip>
        <Chip>{who}</Chip>
        {task.roomName && <Chip>{task.roomName}</Chip>}
        {task.attachments?.length > 0 && <Chip icon="📎">{task.attachments.length}</Chip>}
        <span style={{ flex: 1 }} />
        {canWrite && <DoneButton task={task} busy={busy} onDone={onDone} label={task.taskType === 'PAYMENT_REQUEST' ? 'Paid' : 'Done'} />}
      </div>
    </div>
  );
}

export function Column({ title, icon, tasks, empty, busyId, ...rest }) {
  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14, color: 'var(--ink)', marginBottom: 12 }}>
        <span aria-hidden="true">{icon}</span>{title}
        <span style={{ fontSize: 12, color: 'var(--ink-ghost)', fontWeight: 600 }}>{tasks.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {tasks.length === 0
          ? <div style={{ textAlign: 'center', padding: '20px 8px', fontSize: 13, color: 'var(--ink-ghost)' }}>{empty}</div>
          : tasks.map((t) => <TaskCard key={t.id} task={t} busy={busyId === t.id} {...rest} />)}
      </div>
    </div>
  );
}


// A quote a co-host sent for the owner's approval. canDecide = the owner viewing it.
export function QuoteCard({ task, canDecide, busy, onDecide }) {
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState('');
  const pending = task.quoteStatus === 'PENDING';
  const approved = task.quoteStatus === 'APPROVED';
  const days = daysUntil(task.nextDueAt);
  const due = dueInfo(days);
  const accent = pending ? 'var(--amber)' : approved ? 'var(--green)' : 'var(--red)';

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow)', padding: 16, borderTop: `4px solid ${accent}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, minWidth: 0 }}>
          <span aria-hidden="true" style={{ fontSize: 22 }}>💬</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--ink)' }}>{task.title}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-ghost)', marginTop: 2 }}>
              Quote from {task.assignedBy?.name || 'your co-host'}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink)', lineHeight: 1, whiteSpace: 'nowrap', flexShrink: 0 }}>{money(task.paymentAmount)}</div>
      </div>

      {task.notes && <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{task.notes}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {pending && <Chip icon={due.icon} bg={due.bg} fg={due.fg}>{days < 0 ? `Reply overdue ${-days}d` : days === 0 ? 'Reply today' : `Reply in ${days}d`}</Chip>}
        {!pending && (
          <Chip icon={approved ? '✅' : '❌'} bg={approved ? 'var(--green-pale)' : 'var(--red-pale)'} fg={approved ? '#166534' : '#991b1b'}>
            {approved ? 'Approved' : 'Declined'}{task.decidedAt ? ` · ${new Date(task.decidedAt).toLocaleDateString()}` : ''}
          </Chip>
        )}
        {pending && !canDecide && <Chip icon="⏳">Awaiting owner</Chip>}
        {(task.attachments || []).map((url, i) => (
          <a key={url} href={url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
            <Chip icon="📎">Quote file{task.attachments.length > 1 ? ` ${i + 1}` : ''}</Chip>
          </a>
        ))}
      </div>

      {!pending && task.decisionNote && (
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontStyle: 'italic' }}>“{task.decisionNote}”</div>
      )}

      {pending && canDecide && !declining && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy}
            onClick={() => window.confirm(`Approve ${money(task.paymentAmount)} for "${task.title}"?`) && onDecide(task, 'APPROVED')}>
            {busy ? '…' : '✓ Approve'}
          </button>
          <button className="btn btn-secondary" style={{ flex: 1 }} disabled={busy} onClick={() => setDeclining(true)}>
            ✕ Decline
          </button>
        </div>
      )}
      {pending && canDecide && declining && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea className="input" rows={2} placeholder="Reason or counter-offer (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-danger" style={{ flex: 1 }} disabled={busy} onClick={() => onDecide(task, 'DECLINED', note)}>
              {busy ? '…' : 'Confirm decline'}
            </button>
            <button className="btn btn-secondary" disabled={busy} onClick={() => setDeclining(false)}>Back</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Whole calendar days from today to a checkout date (stored as a UTC date)
export function calendarDaysUntil(date) {
  const d = new Date(date);
  const now = new Date();
  return Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / DAY);
}

// A draft invoice waiting for the co-host to finish the work, then edit and send.
export function DraftInvoiceCard({ task, ownerName, busy, onEdit, onSend, onDiscard }) {
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '2px dashed var(--border)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, minWidth: 0 }}>
          <span aria-hidden="true" style={{ fontSize: 22 }}>🧾</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--ink)' }}>{task.title}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-ghost)', marginTop: 2 }}>To {ownerName}</div>
          </div>
        </div>
        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink)', lineHeight: 1, whiteSpace: 'nowrap', flexShrink: 0 }}>{money(task.paymentAmount)}</div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Chip icon="✏️">Draft · not sent</Chip>
        {task.attachments?.length > 0 && <Chip icon="📎">{task.attachments.length}</Chip>}
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Created from the approved quote. Send it once the work is done.</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={() => onSend(task)}>{busy ? '…' : '📤 Send invoice'}</button>
        <button className="btn btn-secondary" disabled={busy} onClick={() => onEdit(task)}>Edit</button>
        <button className="btn btn-secondary" disabled={busy} onClick={() => onDiscard(task)} title="Discard draft">🗑</button>
      </div>
    </div>
  );
}

// ── Purchase requests ────────────────────────────────────────────────────────
const PURCHASE_STATUS = {
  PENDING:   { icon: '⏳', label: 'Waiting for approval', bg: 'var(--amber-pale)', fg: '#92400e', accent: 'var(--amber)' },
  APPROVED:  { icon: '✅', label: 'Approved', bg: 'var(--green-pale)', fg: '#166534', accent: 'var(--green)' },
  DECLINED:  { icon: '❌', label: 'Declined', bg: 'var(--red-pale)', fg: '#991b1b', accent: 'var(--red)' },
  ORDERED:   { icon: '🚚', label: 'Ordered', bg: 'var(--teal-pale)', fg: 'var(--teal-dark)', accent: 'var(--teal)' },
  PURCHASED: { icon: '🧾', label: 'Bought · reimbursement sent', bg: 'var(--green-pale)', fg: '#166534', accent: 'var(--green)' },
  RECEIVED:  { icon: '📦', label: 'Received', bg: 'var(--green-pale)', fg: '#166534', accent: 'var(--green)' },
  ISSUE:     { icon: '⚠️', label: 'Problem with delivery', bg: 'var(--red-pale)', fg: '#991b1b', accent: 'var(--red)' },
};
export const purchaseOpen = (t) => ['PENDING', 'APPROVED', 'ORDERED', 'ISSUE'].includes(t.purchaseStatus);
const fmtDay = (d) => new Date(String(d).length === 10 ? `${d}T12:00:00Z` : d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

// A purchase request. role = 'owner' (approves / orders) or 'cohost' (asked; buys or confirms delivery).
export function PurchaseCard({ task, role, busy, onAction }) {
  const [form, setForm] = useState(null);   // null | 'decline' | 'order' | 'bought' | 'problem'
  const [note, setNote] = useState('');
  const [mode, setMode] = useState(task.purchaseMode);
  const [order, setOrder] = useState({ store: '', orderNumber: '', trackingUrl: '', eta: '' });
  const [paid, setPaid] = useState(task.paymentAmount || '');
  const [receipts, setReceipts] = useState([]);
  const [uploading, setUploading] = useState(false);
  const st = PURCHASE_STATUS[task.purchaseStatus] || PURCHASE_STATUS.PENDING;
  const items = Array.isArray(task.purchaseItems) ? task.purchaseItems : [];
  const ownerOrders = task.purchaseMode === 'OWNER_ORDERS';
  const days = daysUntil(task.nextDueAt);
  const o = task.orderInfo || {};
  const act = (action, body) => onAction(task, action, body).then((ok) => ok && setForm(null));

  const markBought = async () => {
    setUploading(true);
    try {
      const urls = [];
      for (const f of receipts) {
        const fd = new FormData(); fd.append('file', f);
        urls.push((await api.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data.url);
      }
      await act('purchased', { actualAmount: paid, attachments: urls });
    } catch (err) {
      alert(err.response?.data?.message || 'Could not upload the receipt');
    } finally { setUploading(false); }
  };

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow)', padding: 16, borderTop: `4px solid ${st.accent}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, minWidth: 0 }}>
          <span aria-hidden="true" style={{ fontSize: 22 }}>🛒</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--ink)' }}>{task.title}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-ghost)', marginTop: 2 }}>
              {role === 'owner' ? `From ${task.assignedBy?.name || 'your co-host'}` : `To ${task.assignedUser?.name || 'the owner'}`} · {ownerOrders ? 'owner orders it' : 'co-host buys it'}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', lineHeight: 1, whiteSpace: 'nowrap' }}>{task.actualAmount ? money(task.actualAmount) : task.paymentAmount ? money(task.paymentAmount) : '—'}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-ghost)', marginTop: 3 }}>{task.actualAmount ? 'paid' : task.paymentAmount ? 'estimate' : 'no prices given'}</div>
        </div>
      </div>

      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--ink-soft)', display: 'grid', gap: 3 }}>
        {items.map((it, i) => (
          <li key={i}>
            {it.qty > 1 ? `${it.qty} × ` : ''}{it.link ? <a href={it.link} target="_blank" rel="noreferrer">{it.name}</a> : it.name}
            {it.price ? <span style={{ color: 'var(--ink-ghost)' }}> · {money(it.price)}{it.qty > 1 ? ' each' : ''}</span> : null}
          </li>
        ))}
      </ul>
      {task.notes && <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{task.notes}</div>}
      {ownerOrders && task.deliveryAddress && <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>📍 Deliver to: {task.deliveryAddress}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <Chip icon={st.icon} bg={st.bg} fg={st.fg}>{st.label}</Chip>
        {task.purchaseStatus === 'PENDING' && <Chip icon="📅">Needed by {fmtDay(task.nextDueAt)}{days < 0 ? ` (${-days}d ago)` : ''}</Chip>}
        {task.purchaseStatus === 'ORDERED' && o.eta && <Chip icon="📅">Expected {fmtDay(o.eta)}</Chip>}
        {o.store && <Chip icon="🏬">{o.store}{o.orderNumber ? ` #${o.orderNumber}` : ''}</Chip>}
        {o.trackingUrl && <a href={o.trackingUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}><Chip icon="🔗">Track</Chip></a>}
        {(task.attachments || []).map((url, i) => (
          <a key={url} href={url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}><Chip icon="📎">{task.purchaseStatus === 'PURCHASED' ? 'Receipt' : 'Photo'}{task.attachments.length > 1 ? ` ${i + 1}` : ''}</Chip></a>
        ))}
      </div>
      {task.decisionNote && <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontStyle: 'italic' }}>“{task.decisionNote}”</div>}
      {task.statusNote && <div style={{ fontSize: 12, color: task.purchaseStatus === 'ISSUE' ? '#991b1b' : 'var(--ink-soft)' }}>{task.purchaseStatus === 'ISSUE' ? '⚠️ ' : ''}{task.statusNote}</div>}

      {/* owner: approve or decline */}
      {role === 'owner' && task.purchaseStatus === 'PENDING' && !form && (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 12 }}>
            <span style={{ color: 'var(--ink-soft)', alignSelf: 'center' }}>Who buys it?</span>
            {[['COHOST_BUYS', 'Co-host buys'], ['OWNER_ORDERS', 'I’ll order it']].map(([k, label]) => (
              <button key={k} type="button" className={`btn btn-sm ${mode === k ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setMode(k)}>{label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy}
              onClick={() => window.confirm(`Approve ${task.paymentAmount ? `about ${money(task.paymentAmount)} for ` : ''}"${task.title}"?`) && act('purchase-decision', { decision: 'APPROVED', purchaseMode: mode })}>
              {busy ? '…' : '✓ Approve'}
            </button>
            <button className="btn btn-secondary" style={{ flex: 1 }} disabled={busy} onClick={() => setForm('decline')}>✕ Decline</button>
          </div>
        </>
      )}
      {form === 'decline' && (
        <div style={{ display: 'grid', gap: 8 }}>
          <textarea className="input" rows={2} placeholder="Reason (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-danger" style={{ flex: 1 }} disabled={busy} onClick={() => act('purchase-decision', { decision: 'DECLINED', note })}>{busy ? '…' : 'Confirm decline'}</button>
            <button className="btn btn-secondary" disabled={busy} onClick={() => setForm(null)}>Back</button>
          </div>
        </div>
      )}

      {/* owner: place the order */}
      {role === 'owner' && ownerOrders && ['APPROVED', 'ISSUE'].includes(task.purchaseStatus) && !form && (
        <button className="btn btn-primary" disabled={busy} onClick={() => setForm('order')}>🚚 Mark ordered</button>
      )}
      {form === 'order' && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input className="input" placeholder="Store (optional)" value={order.store} onChange={(e) => setOrder({ ...order, store: e.target.value })} style={{ flex: '1 1 120px' }} />
            <input className="input" placeholder="Order # (optional)" value={order.orderNumber} onChange={(e) => setOrder({ ...order, orderNumber: e.target.value })} style={{ flex: '1 1 120px' }} />
          </div>
          <input className="input" placeholder="Tracking link (optional)" value={order.trackingUrl} onChange={(e) => setOrder({ ...order, trackingUrl: e.target.value })} />
          <label style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Expected delivery (optional)
            <input className="input" type="date" value={order.eta} onChange={(e) => setOrder({ ...order, eta: e.target.value })} style={{ marginTop: 4 }} />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={() => act('ordered', order)}>{busy ? '…' : 'Save — it’s ordered'}</button>
            <button className="btn btn-secondary" disabled={busy} onClick={() => setForm(null)}>Back</button>
          </div>
        </div>
      )}

      {/* co-host: bought it */}
      {role === 'cohost' && !ownerOrders && task.purchaseStatus === 'APPROVED' && !form && (
        <button className="btn btn-primary" disabled={busy} onClick={() => setForm('bought')}>🧾 Mark purchased</button>
      )}
      {form === 'bought' && (
        <div style={{ display: 'grid', gap: 8 }}>
          <label style={{ fontSize: 12, color: 'var(--ink-soft)' }}>What did you pay? ($)
            <input className="input" type="number" min={0} step="0.01" value={paid} onChange={(e) => setPaid(e.target.value)} style={{ marginTop: 4 }} />
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '7px 12px', borderRadius: 8, border: '1.5px dashed var(--border)', fontSize: 13, color: 'var(--ink-soft)' }}>
            📎 {receipts.length ? `${receipts.length} receipt file${receipts.length > 1 ? 's' : ''}` : 'Attach the receipt'}
            <input type="file" multiple accept="image/*,application/pdf" style={{ display: 'none' }} onChange={(e) => setReceipts(Array.from(e.target.files).slice(0, 5))} />
          </label>
          <p style={{ fontSize: 12, color: 'var(--ink-ghost)', margin: 0 }}>This sends {task.assignedUser?.name || 'the owner'} a reimbursement invoice.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy || uploading || !(parseFloat(paid) > 0)} onClick={markBought}>{busy || uploading ? '…' : 'Send for reimbursement'}</button>
            <button className="btn btn-secondary" disabled={busy || uploading} onClick={() => setForm(null)}>Back</button>
          </div>
        </div>
      )}

      {/* co-host: delivery arrived (or not) */}
      {role === 'cohost' && ['ORDERED', 'ISSUE'].includes(task.purchaseStatus) && !form && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={() => act('received', { ok: true })}>{busy ? '…' : '📦 Received'}</button>
          <button className="btn btn-secondary" style={{ flex: 1 }} disabled={busy} onClick={() => setForm('problem')}>Report a problem</button>
        </div>
      )}
      {form === 'problem' && (
        <div style={{ display: 'grid', gap: 8 }}>
          <textarea className="input" rows={2} placeholder="e.g. Not arrived yet, or the wrong size came" value={note} onChange={(e) => setNote(e.target.value)} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-danger" style={{ flex: 1 }} disabled={busy || !note.trim()} onClick={() => act('received', { ok: false, note })}>{busy ? '…' : 'Tell the owner'}</button>
            <button className="btn btn-secondary" disabled={busy} onClick={() => setForm(null)}>Back</button>
          </div>
        </div>
      )}
    </div>
  );
}
