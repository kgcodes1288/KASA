import { useEffect, useState } from 'react';
import api from '../api';
import QuickTaskModal from './QuickTaskModal';

// Overview shown to an owner whose listing is run by a co-host: what needs the
// owner's attention (due maintenance) and the tasks passing between owner and co-host.

const DAY = 86400000;
const SOON_DAYS = 30;

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
const iconFor = (task) => {
  if (task.taskType === 'PAYMENT_REQUEST') return '💳';
  const hit = ICONS.find(([re]) => re.test(task.title));
  if (hit) return hit[1];
  return task.taskType === 'ACTION' ? '📞' : '🛠️';
};

const daysUntil = (date) => Math.ceil((new Date(date) - Date.now()) / DAY);

// icon + label always accompany the colour, never colour alone
function dueInfo(days) {
  if (days < 0) return { icon: '⚠️', label: `Overdue ${-days}d`, bg: 'var(--red-pale)', fg: '#991b1b' };
  if (days === 0) return { icon: '⏰', label: 'Due today', bg: 'var(--amber-pale)', fg: '#92400e' };
  if (days <= 14) return { icon: '⏰', label: `Due in ${days}d`, bg: 'var(--amber-pale)', fg: '#92400e' };
  return { icon: '📅', label: `Due in ${days}d`, bg: 'var(--teal-pale)', fg: 'var(--teal-dark)' };
}

// How far through its service interval a recurring task is (0–1)
function intervalProgress(t) {
  if (!t.isRecurring || !t.intervalMonths || !t.lastServicedAt) return null;
  const total = t.intervalMonths * 30.4 * DAY;
  const elapsed = Date.now() - new Date(t.lastServicedAt).getTime();
  return Math.max(0, Math.min(1, elapsed / total));
}

// recurring tasks re-arm after completion (nextDueAt moves out); one-offs stay open until done
const isOpen = (t) => (t.isRecurring ? daysUntil(t.nextDueAt) <= SOON_DAYS : t.status !== 'COMPLETED');

function Chip({ icon, children, bg = 'var(--bg)', fg = 'var(--ink-soft)' }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px',
      borderRadius: 999, background: bg, color: fg, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      {icon && <span aria-hidden="true">{icon}</span>}{children}
    </span>
  );
}

function StatTile({ icon, label, value, hint, accent }) {
  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow)',
      padding: '14px 16px', borderLeft: `4px solid ${accent}`, display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ink-soft)' }}>
        <span aria-hidden="true">{icon}</span>{label}
      </div>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 34, fontWeight: 700, lineHeight: 1.1, color: 'var(--ink)' }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-ghost)', minHeight: 16 }}>{hint}</div>
    </div>
  );
}

function SectionTitle({ children, count }) {
  return (
    <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', margin: '28px 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
      {children}
      {count > 0 && <span style={{ fontSize: 12, fontWeight: 600, background: 'var(--teal-pale)', color: 'var(--teal-dark)', borderRadius: 999, padding: '2px 8px' }}>{count}</span>}
    </h2>
  );
}

function DoneButton({ task, busy, onDone, label = 'Mark done' }) {
  return (
    <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onDone(task)}>
      {busy ? '…' : `✓ ${label}`}
    </button>
  );
}

function AttentionCard({ task, canWrite, busy, onDone }) {
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

function TaskCard({ task, mine, canWrite, busy, onDone }) {
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

function Column({ title, icon, tasks, empty, busyId, ...rest }) {
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

export default function HostOverview({ listing, currentUser, canWrite }) {
  const [tasks, setTasks] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const load = () =>
    api.get(`/listings/${listing.id}/maintenance`)
      .then(({ data }) => setTasks(data.flatMap((r) => (r.maintenanceTasks || []).map((t) => ({ ...t, roomName: r.entityType === 'GENERAL' ? null : r.name })))))
      .catch(() => setTasks([]));

  useEffect(() => { load(); }, [listing.id]);

  const handleDone = async (task) => {
    setBusyId(task.id);
    try {
      await api.patch(`/maintenance/${task.id}/complete`);
      await load();
    } catch (err) {
      alert(err.response?.data?.message || 'Could not update task');
    } finally {
      setBusyId(null);
    }
  };

  if (!tasks) return <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><div className="spinner" /></div>;

  const byDue = (a, b) => new Date(a.nextDueAt) - new Date(b.nextDueAt);
  const maintenance = tasks.filter((t) => t.taskType === 'MAINTENANCE' && isOpen(t)).sort(byDue);
  const requests = tasks.filter((t) => t.taskType !== 'MAINTENANCE' && isOpen(t)).sort(byDue);
  const onMyPlate = requests.filter((t) => !t.assignedUser || t.assignedUser.id === currentUser.id);
  const withCoHost = requests.filter((t) => t.assignedUser && t.assignedUser.id !== currentUser.id);

  const overdue = [...maintenance, ...requests].filter((t) => daysUntil(t.nextDueAt) < 0).length;
  const dueSoon = maintenance.filter((t) => daysUntil(t.nextDueAt) >= 0).length;
  const later = tasks
    .filter((t) => t.taskType === 'MAINTENANCE' && t.isRecurring && daysUntil(t.nextDueAt) > SOON_DAYS)
    .sort(byDue);

  const common = { canWrite, onDone: handleDone };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <p style={{ fontSize: 14, margin: 0 }}>
          🏢 Day-to-day is run by your co-host. Here's what needs <strong>you</strong>.
        </p>
        {canWrite && <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New task</button>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
        <StatTile icon="⚠️" label="Overdue" value={overdue} hint={overdue ? 'Needs action now' : 'Nothing late'} accent="var(--red)" />
        <StatTile icon="⏰" label="Due in 30 days" value={dueSoon} hint="Maintenance coming up" accent="var(--amber)" />
        <StatTile icon="📝" label="On your plate" value={onMyPlate.length} hint="Tasks waiting on you" accent="var(--teal)" />
        <StatTile icon="🤝" label="With your co-host" value={withCoHost.length} hint="Tasks you've handed off" accent="var(--ink-ghost)" />
      </div>

      <SectionTitle count={maintenance.length}>Needs your attention</SectionTitle>
      {maintenance.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 28 }}>✅</div>
          <p style={{ marginTop: 6 }}>All clear — no maintenance due in the next {SOON_DAYS} days.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
          {maintenance.map((t) => <AttentionCard key={t.id} task={t} busy={busyId === t.id} {...common} />)}
        </div>
      )}
      {later.length > 0 && (
        <p style={{ fontSize: 12, color: 'var(--ink-ghost)', marginTop: 10 }}>
          {later.length} more scheduled later — next: {later[0].title} on {new Date(later[0].nextDueAt).toLocaleDateString()}.
        </p>
      )}

      <SectionTitle count={requests.length}>Tasks</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
        <Column title="On your plate" icon="📝" tasks={onMyPlate} mine empty="Nothing waiting on you 🎉"
          {...common} busyId={busyId} />
        <Column title="With your co-host" icon="🤝" tasks={withCoHost} mine={false} empty="Nothing handed off yet"
          {...common} busyId={busyId} />
      </div>

      {showModal && (
        <QuickTaskModal
          listing={listing}
          isOwner={listing.hostId === currentUser.id}
          currentUser={currentUser}
          allowMaintenance
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}
    </div>
  );
}
