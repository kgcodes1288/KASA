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
  const hit = ICONS.find(([re]) => re.test(task.title));
  if (hit) return hit[1];
  return task.taskType === 'ACTION' ? '📞' : '🛠️';
};

export const money = (v) => {
  const n = parseFloat(String(v ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : String(v || '');
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

export function StatTile({ icon, label, value, hint, accent }) {
  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow)',
      padding: '12px 12px', borderLeft: `4px solid ${accent}`, display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>
        <span aria-hidden="true">{icon}</span>{label}
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
        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink)', lineHeight: 1 }}>{money(task.paymentAmount)}</div>
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
