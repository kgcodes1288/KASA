import { useEffect, useState } from 'react';
import api from '../api';
import QuickTaskModal from './QuickTaskModal';
import {
  fetchListingTasks, calendarDaysUntil, SOON_DAYS, DAY, daysUntil, isOpen, money, quoteTotal,
  Chip, StatTile, SectionTitle, AttentionCard, Column, QuoteCard, DraftInvoiceCard,
} from './overviewParts';
import DraftInvoiceModal from './DraftInvoiceModal';

// Overview for a co-host running a listing for its owner: upcoming turnovers,
// what needs a cleaner, maintenance due, quotes awaiting the owner, and tasks both ways.

const TURNOVER_WINDOW_DAYS = 14;

function groupTurnovers(jobs, tokenStatuses) {
  const byDate = {};
  const seen = new Set();
  jobs.forEach((j) => {
    if (seen.has(j.id) || !j.checkoutDate) return;
    seen.add(j.id);
    const key = new Date(j.checkoutDate).toISOString().slice(0, 10);
    const g = (byDate[key] ||= { key, date: j.checkoutDate, checkin: j.checkinDate, rooms: 0, done: 0, cleaners: new Set() });
    g.rooms += 1;
    if (j.status === 'completed') g.done += 1;
    if (j.cleaner?.name) g.cleaners.add(j.cleaner.name);
  });
  return Object.values(byDate)
    .map((g) => {
      const token = tokenStatuses?.[g.key] || null;
      return { ...g, contractor: token && token.status !== 'WITHDRAWN' ? token : null, days: calendarDaysUntil(g.date) };
    })
    .filter((g) => g.done < g.rooms && g.days >= -1)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

const isAssigned = (g) => g.cleaners.size > 0 || !!g.contractor;

function TurnoverCard({ g, onOpen }) {
  const d = new Date(g.date);
  const pct = g.rooms ? Math.round((g.done / g.rooms) * 100) : 0;
  const when = g.days <= 0 ? 'Today' : g.days === 1 ? 'Tomorrow' : `In ${g.days} days`;
  const urgent = g.days <= 1;
  return (
    <button onClick={onOpen} style={{
      textAlign: 'left', cursor: 'pointer', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow)',
      border: 'none', padding: 14, display: 'flex', gap: 12, fontFamily: 'var(--font-body)',
    }}>
      <div aria-hidden="true" style={{ width: 52, flexShrink: 0, borderRadius: 12, background: urgent ? 'var(--amber-pale)' : 'var(--teal-pale)', textAlign: 'center', padding: '6px 0' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase' }}>{d.toLocaleString(undefined, { month: 'short', timeZone: 'UTC' })}</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.1 }}>{d.getUTCDate()}</div>
      </div>
      <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>Checkout · {when}</span>
          <span style={{ fontSize: 12, color: 'var(--ink-ghost)' }}>{g.done}/{g.rooms} rooms</span>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: 'var(--border)', overflow: 'hidden' }}>
          <div style={{ width: `${Math.max(pct, 3)}%`, height: '100%', borderRadius: 999, background: 'var(--teal)' }} />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {isAssigned(g)
            ? <Chip icon={g.contractor && !g.cleaners.size ? '📲' : '🧑‍🔧'} bg="var(--teal-pale)" fg="var(--teal-dark)">
                {g.cleaners.size ? [...g.cleaners].join(', ') : `Contractor ${String(g.contractor.status || 'pending').toLowerCase()}`}
              </Chip>
            : <Chip icon="⚠️" bg="var(--red-pale)" fg="#991b1b">Needs a cleaner</Chip>}
          {g.checkin && <Chip icon="➡️">Next check-in {new Date(g.checkin).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })}</Chip>}
        </div>
      </div>
    </button>
  );
}

export default function CoHostOverview({ listing, currentUser, jobs, tokenStatuses, canWrite, onOpenJobs }) {
  const [tasks, setTasks] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editDraft, setEditDraft] = useState(null);

  const load = () => fetchListingTasks(listing.id).then(setTasks).catch(() => setTasks([]));
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

  const handleSendDraft = async (task) => {
    if (!window.confirm(`Send this ${money(task.paymentAmount)} invoice to the owner? Only do this once the work is done.`)) return;
    setBusyId(task.id);
    try {
      await api.post(`/maintenance/${task.id}/send`);
      await load();
    } catch (err) {
      alert(err.response?.data?.message || 'Could not send the invoice');
    } finally {
      setBusyId(null);
    }
  };

  const handleDiscardDraft = async (task) => {
    if (!window.confirm('Discard this draft invoice?')) return;
    setBusyId(task.id);
    try {
      await api.delete(`/maintenance/${task.id}`);
      await load();
    } catch (err) {
      alert(err.response?.data?.message || 'Could not discard the draft');
    } finally {
      setBusyId(null);
    }
  };

  if (!tasks) return <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><div className="spinner" /></div>;

  const owner = listing.host?.name || 'the owner';
  const byDue = (a, b) => new Date(a.nextDueAt) - new Date(b.nextDueAt);

  const turnovers = groupTurnovers(jobs, tokenStatuses);
  const soonTurnovers = turnovers.filter((g) => g.days <= TURNOVER_WINDOW_DAYS);
  const needCleaner = soonTurnovers.filter((g) => !isAssigned(g));

  const drafts = tasks.filter((t) => t.isDraft);
  const maintenance = tasks.filter((t) => !t.isDraft && t.taskType === 'MAINTENANCE' && isOpen(t)).sort(byDue);
  const quotes = tasks.filter((t) => t.taskType === 'QUOTE');
  const pendingQuotes = quotes.filter((t) => t.quoteStatus === 'PENDING').sort(byDue);
  const decidedQuotes = quotes
    .filter((t) => t.quoteStatus !== 'PENDING' && t.decidedAt && Date.now() - new Date(t.decidedAt) < 30 * DAY)
    .sort((a, b) => new Date(b.decidedAt) - new Date(a.decidedAt))
    .slice(0, 4);

  const requests = tasks.filter((t) => !t.isDraft && t.taskType !== 'MAINTENANCE' && t.taskType !== 'QUOTE' && isOpen(t)).sort(byDue);
  const onMyPlate = requests.filter((t) => !t.assignedUser || t.assignedUser.id === currentUser.id);
  const withOwner = requests.filter((t) => t.assignedUser && t.assignedUser.id !== currentUser.id);

  const common = { canWrite, onDone: handleDone };
  const nextTurnover = soonTurnovers[0];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <p style={{ fontSize: 14, margin: 0 }}>
          🤝 You're managing this property for <strong>{owner}</strong>.
        </p>
        {canWrite && <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New task / quote</button>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))', gap: 12 }}>
        <StatTile icon="🧹" label="Turnovers" value={soonTurnovers.length}
          hint={nextTurnover ? `Next ${new Date(nextTurnover.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })}` : 'Next 14 days'} accent="var(--teal)" />
        <StatTile icon="⚠️" label="Needs cleaner" value={needCleaner.length} hint={needCleaner.length ? 'Assign in Jobs' : 'All covered'} accent="var(--red)" />
        <StatTile icon="🛠️" label="Maintenance" value={maintenance.length} hint={`Due in ${SOON_DAYS} days`} accent="var(--amber)" />
        <StatTile icon="💬" label="Quotes" value={pendingQuotes.length} hint={pendingQuotes.length ? `${money(quoteTotal(pendingQuotes))} pending` : 'None pending'} accent="var(--amber)" />
        <StatTile icon="📝" label="Your tasks" value={onMyPlate.length} hint="Waiting on you" accent="var(--ink-ghost)" />
      </div>

      <SectionTitle count={soonTurnovers.length}>Upcoming turnovers</SectionTitle>
      {soonTurnovers.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 28 }}>🗓️</div>
          <p style={{ marginTop: 6 }}>No checkouts in the next {TURNOVER_WINDOW_DAYS} days.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 12 }}>
          {soonTurnovers.slice(0, 6).map((g) => <TurnoverCard key={g.key} g={g} onOpen={onOpenJobs} />)}
        </div>
      )}
      {soonTurnovers.length > 6 && <p style={{ fontSize: 12, color: 'var(--ink-ghost)', marginTop: 10 }}>+{soonTurnovers.length - 6} more in the Jobs tab.</p>}

      {(pendingQuotes.length > 0 || decidedQuotes.length > 0) && (
        <>
          <SectionTitle count={pendingQuotes.length}>Quotes</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {[...pendingQuotes, ...decidedQuotes].map((q) => <QuoteCard key={q.id} task={q} canDecide={false} />)}
          </div>
        </>
      )}

      {drafts.length > 0 && (
        <>
          <SectionTitle count={drafts.length}>Draft invoices</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {drafts.map((t) => (
              <DraftInvoiceCard key={t.id} task={t} ownerName={owner} busy={busyId === t.id}
                onEdit={setEditDraft} onSend={handleSendDraft} onDiscard={handleDiscardDraft} />
            ))}
          </div>
        </>
      )}

      <SectionTitle count={maintenance.length}>Maintenance due</SectionTitle>
      {maintenance.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 28 }}>✅</div>
          <p style={{ marginTop: 6 }}>Nothing due in the next {SOON_DAYS} days.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
          {maintenance.map((t) => <AttentionCard key={t.id} task={t} busy={busyId === t.id} {...common} />)}
        </div>
      )}

      <SectionTitle count={requests.length}>Tasks</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
        <Column title="On your plate" icon="📝" tasks={onMyPlate} mine empty="Nothing waiting on you 🎉" {...common} busyId={busyId} />
        <Column title={`With ${owner}`} icon="🤝" tasks={withOwner} mine={false} empty="Nothing waiting on the owner" {...common} busyId={busyId} />
      </div>

      {editDraft && (
        <DraftInvoiceModal task={editDraft} onClose={() => setEditDraft(null)} onSaved={() => { setEditDraft(null); load(); }} />
      )}

      {showModal && (
        <QuickTaskModal
          listing={listing}
          isOwner={false}
          currentUser={currentUser}
          allowMaintenance
          allowQuote
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}
    </div>
  );
}
