import { useEffect, useState } from 'react';
import api from '../api';
import QuickTaskModal from './QuickTaskModal';
import { fetchListingTasks, SOON_DAYS, DAY, daysUntil, isOpen, money, quoteTotal, StatTile, SectionTitle, AttentionCard, Column, QuoteCard } from './overviewParts';

// Overview shown to an owner whose listing is run by a co-host: what needs the
// owner's attention (due maintenance) and the tasks passing between owner and co-host.

export default function HostOverview({ listing, currentUser, canWrite }) {
  const [tasks, setTasks] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const load = () => fetchListingTasks(listing.id).then(setTasks).catch(() => setTasks([]));

  useEffect(() => { load(); }, [listing.id]);

  const handleDecide = async (task, decision, note) => {
    setBusyId(task.id);
    try {
      await api.post(`/maintenance/${task.id}/decision`, { decision, note });
      await load();
    } catch (err) {
      alert(err.response?.data?.message || 'Could not save your decision');
      await load();
    } finally {
      setBusyId(null);
    }
  };

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
  const maintenance = tasks.filter((t) => !t.isDraft && t.taskType === 'MAINTENANCE' && isOpen(t)).sort(byDue);
  const requests = tasks.filter((t) => !t.isDraft && t.taskType !== 'MAINTENANCE' && t.taskType !== 'QUOTE' && isOpen(t)).sort(byDue);
  const quotes = tasks.filter((t) => t.taskType === 'QUOTE');
  const pendingQuotes = quotes.filter((t) => t.quoteStatus === 'PENDING').sort(byDue);
  const decidedQuotes = quotes
    .filter((t) => t.quoteStatus !== 'PENDING' && t.decidedAt && Date.now() - new Date(t.decidedAt) < 30 * DAY)
    .sort((a, b) => new Date(b.decidedAt) - new Date(a.decidedAt))
    .slice(0, 4);
  const onMyPlate = requests.filter((t) => !t.assignedUser || t.assignedUser.id === currentUser.id);
  const withCoHost = requests.filter((t) => t.assignedUser && t.assignedUser.id !== currentUser.id);

  const overdue = [...maintenance, ...requests, ...pendingQuotes].filter((t) => daysUntil(t.nextDueAt) < 0).length;
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(148px, 100%), 1fr))', gap: 12 }}>
        <StatTile icon="⚠️" label="Overdue" value={overdue} hint={overdue ? 'Needs action' : 'Nothing late'} accent="var(--red)" />
        <StatTile icon="⏰" label="Due in 30 days" value={dueSoon} hint="Maintenance" accent="var(--amber)" />
        <StatTile icon="💬" label="Quotes" value={pendingQuotes.length} hint={pendingQuotes.length ? `${money(quoteTotal(pendingQuotes))} total` : 'To approve'} accent="var(--amber)" />
        <StatTile icon="📝" label="Your plate" value={onMyPlate.length} hint="Waiting on you" accent="var(--teal)" />
        <StatTile icon="🤝" label="With co-host" value={withCoHost.length} hint="Handed off" accent="var(--ink-ghost)" />
      </div>

      {(pendingQuotes.length > 0 || decidedQuotes.length > 0) && (
        <>
          <SectionTitle count={pendingQuotes.length}>Quotes to approve</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))', gap: 12 }}>
            {[...pendingQuotes, ...decidedQuotes].map((q) => (
              <QuoteCard key={q.id} task={q} canDecide busy={busyId === q.id} onDecide={handleDecide} />
            ))}
          </div>
        </>
      )}

      <SectionTitle count={maintenance.length}>Needs your attention</SectionTitle>
      {maintenance.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 28 }}>✅</div>
          <p style={{ marginTop: 6 }}>All clear — no maintenance due in the next {SOON_DAYS} days.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(250px, 100%), 1fr))', gap: 12 }}>
          {maintenance.map((t) => <AttentionCard key={t.id} task={t} busy={busyId === t.id} {...common} />)}
        </div>
      )}
      {later.length > 0 && (
        <p style={{ fontSize: 12, color: 'var(--ink-ghost)', marginTop: 10 }}>
          {later.length} more scheduled later — next: {later[0].title} on {new Date(later[0].nextDueAt).toLocaleDateString()}.
        </p>
      )}

      <SectionTitle count={requests.length}>Tasks</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 14 }}>
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
