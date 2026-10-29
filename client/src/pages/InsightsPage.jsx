import { useEffect, useMemo, useState } from 'react';
import api from '../api';

const iso = (d) => d.toISOString().slice(0, 10);
const money = (n) => `$${(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const PRESETS = [
  { key: '30', label: 'Last 30 days', range: () => [Date.now() - 30 * 864e5, Date.now()] },
  { key: '90', label: 'Last 90 days', range: () => [Date.now() - 90 * 864e5, Date.now()] },
  { key: 'ytd', label: 'This year', range: () => [new Date(new Date().getFullYear(), 0, 1).getTime(), Date.now()] },
  { key: '365', label: 'Last 12 months', range: () => [Date.now() - 365 * 864e5, Date.now()] },
];

function Stat({ icon, label, value, sub, tone }) {
  return (
    <div className="card" style={{ padding: 16, borderTop: `3px solid ${tone || 'var(--border)'}` }}>
      <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 600 }}>{icon} {label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, margin: '4px 0 2px' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--ink-ghost)' }}>{sub}</div>}
    </div>
  );
}

const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '–');

export default function InsightsPage() {
  const [preset, setPreset] = useState('90');
  const [selected, setSelected] = useState([]); // empty = all properties
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    const [f, t] = PRESETS.find((p) => p.key === preset).range();
    setErr('');
    api.get('/insights', { params: { from: iso(new Date(f)), to: iso(new Date(t)), listingIds: selected.join(',') } })
      .then((r) => setData(r.data)).catch((e) => setErr(e.response?.data?.message || 'Could not load insights'));
  }, [preset, selected]);

  const names = useMemo(() => Object.fromEntries((data?.listings || []).map((l) => [l.id, l.name])), [data]);
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const csv = () => {
    const rows = [['Property', 'Stays', 'Nights', 'Cleans scheduled', 'Cleans done', 'Maintenance done', 'Maintenance overdue', 'Unplanned raised', 'Unplanned resolved', 'Unplanned open', 'Invoices', 'Invoiced $', 'Paid $', 'Outstanding $', 'Quotes', 'Quotes approved $', 'Purchases', 'Purchases approved $', 'Needs attention now']];
    const line = (n, m) => [n, m.stays, m.nights, m.planned.cleans, m.planned.cleansDone, m.planned.maintenanceDone, m.planned.maintenanceOverdue, m.unplanned.raised, m.unplanned.resolved, m.unplanned.open, m.invoices.count, m.invoices.total, m.invoices.paidTotal, m.invoices.outstandingTotal, m.quotes.count, m.quotes.approvedTotal, m.purchases.count, m.purchases.total, m.openNow];
    data.selected.forEach((id) => rows.push(line(names[id], data.byListing[id])));
    rows.push(line('ALL SELECTED', data.totals));
    const text = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    a.download = `cleanstay-insights-${iso(new Date())}.csv`; a.click();
  };

  if (err) return <div className="page"><div className="alert alert-error">{err}</div></div>;
  if (!data) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>;
  const t = data.totals;
  const maxTrend = Math.max(1, ...data.trend.map((m) => Math.max(m.cleans, m.unplanned)));

  return (
    <div className="page insights-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0 }}>📊 Insights</h1>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>How much attention your properties need — work, invoices and quotes. Not revenue.</div>
        </div>
        {t && <button className="btn btn-secondary btn-sm" onClick={csv}>⬇ Download report (CSV)</button>}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '16px 0 8px' }}>
        {PRESETS.map((p) => <button key={p.key} className={`btn btn-sm ${preset === p.key ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPreset(p.key)}>{p.label}</button>)}
      </div>
      {data.listings.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 600 }}>Properties:</span>
          <button className={`btn btn-sm ${selected.length === 0 ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSelected([])}>All</button>
          {data.listings.map((l) => <button key={l.id} className={`btn btn-sm ${selected.includes(l.id) ? 'btn-primary' : 'btn-secondary'}`} onClick={() => toggle(l.id)}>{l.name}</button>)}
        </div>
      )}

      {!t ? <p>No properties yet. Add one and its insights will show here.</p> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <Stat icon="🏠" label="Needs attention now" value={t.openNow} sub={t.overdueNow ? `${t.overdueNow} overdue` : 'nothing overdue'} tone={t.overdueNow ? '#dc2626' : '#16a34a'} />
            <Stat icon="🧹" label="Planned cleans" value={t.planned.cleans} sub={`${t.planned.cleansDone} done (${pct(t.planned.cleansDone, t.planned.cleans)}) · ${t.stays} stays, ${t.nights} nights`} tone="#2563eb" />
            <Stat icon="🔧" label="Planned maintenance" value={t.planned.maintenanceDone} sub={`serviced · ${t.planned.maintenanceOverdue} overdue`} tone="#2563eb" />
            <Stat icon="🚨" label="Unplanned work" value={t.unplanned.raised} sub={`${t.unplanned.resolved} resolved · ${t.unplanned.open} open${t.unplanned.avgDaysToResolve != null ? ` · ${t.unplanned.avgDaysToResolve}d avg to fix` : ''}`} tone="#d97706" />
            <Stat icon="🧾" label="Invoices" value={t.invoices.count} sub={`${money(t.invoices.total)} total · avg ${money(t.invoices.avg)}`} tone="#7c3aed" />
            <Stat icon="💳" label="Outstanding invoices" value={money(t.invoices.outstandingTotal)} sub={`${t.invoices.outstanding} unpaid · ${money(t.invoices.paidTotal)} paid`} tone={t.invoices.outstanding ? '#d97706' : '#16a34a'} />
            <Stat icon="🛒" label="Purchases" value={t.purchases.count} sub={`${t.purchases.approved} approved (${money(t.purchases.total)}) · ${t.purchases.pending} waiting · ${t.purchases.ownerOrdered} ordered by owner`} tone="#0d9488" />
            <Stat icon="📝" label="Quotes" value={t.quotes.count} sub={`${t.quotes.approved} approved (${money(t.quotes.approvedTotal)}) · ${t.quotes.declined} declined · ${t.quotes.pending} waiting`} tone="#0891b2" />
          </div>

          {data.trend.length > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>Month by month</h3>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', overflowX: 'auto', paddingBottom: 4 }}>
                {data.trend.map((m) => (
                  <div key={m.month} style={{ textAlign: 'center', minWidth: 58 }} title={`${m.cleans} cleans, ${m.unplanned} unplanned, ${money(m.invoiceTotal)} invoiced`}>
                    <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 90, justifyContent: 'center' }}>
                      <div style={{ width: 16, height: `${(m.cleans / maxTrend) * 100}%`, minHeight: m.cleans ? 3 : 0, background: '#2563eb', borderRadius: '4px 4px 0 0' }} />
                      <div style={{ width: 16, height: `${(m.unplanned / maxTrend) * 100}%`, minHeight: m.unplanned ? 3 : 0, background: '#d97706', borderRadius: '4px 4px 0 0' }} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4 }}>{m.month.slice(2)}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-ghost)' }}>{money(m.invoiceTotal)}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 8 }}><span style={{ color: '#2563eb' }}>■</span> planned cleans &nbsp; <span style={{ color: '#d97706' }}>■</span> unplanned work &nbsp; · dollar figure = invoiced that month</div>
            </div>
          )}

          <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>By property</h3>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', minWidth: 640 }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--ink-soft)' }}>
                {['Property', 'Stays', 'Cleans', 'Unplanned', 'Invoices', 'Invoiced', 'Unpaid', 'Needs attention'].map((h) => <th key={h} style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {data.selected.map((id) => { const m = data.byListing[id]; return (
                  <tr key={id}>
                    <td style={{ padding: '8px', fontWeight: 600 }}>{names[id]}</td>
                    <td style={{ padding: '8px' }}>{m.stays}</td>
                    <td style={{ padding: '8px' }}>{m.planned.cleansDone}/{m.planned.cleans}</td>
                    <td style={{ padding: '8px' }}>{m.unplanned.raised}{m.unplanned.open ? ` (${m.unplanned.open} open)` : ''}</td>
                    <td style={{ padding: '8px' }}>{m.invoices.count}</td>
                    <td style={{ padding: '8px' }}>{money(m.invoices.total)}</td>
                    <td style={{ padding: '8px', color: m.invoices.outstandingTotal ? '#b45309' : undefined }}>{money(m.invoices.outstandingTotal)}</td>
                    <td style={{ padding: '8px', color: m.overdueNow ? '#dc2626' : undefined, fontWeight: m.overdueNow ? 700 : 400 }}>{m.openNow}{m.overdueNow ? ` (${m.overdueNow} overdue)` : ''}</td>
                  </tr>); })}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 12, color: 'var(--ink-ghost)', marginTop: 12 }}>
            Planned = checkout cleans and recurring maintenance. Unplanned = one-off action items and quotes that came up (repairs). Purchases are counted on their own. Invoice and quote counts use the date they were created; “needs attention” is live and ignores the date range.
          </p>
        </>
      )}
    </div>
  );
}
