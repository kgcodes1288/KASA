import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

const PALETTE = [
  { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd' },
  { bg: '#dcfce7', text: '#15803d', border: '#86efac' },
  { bg: '#ede9fe', text: '#6d28d9', border: '#c4b5fd' },
  { bg: '#fce7f3', text: '#be185d', border: '#f9a8d4' },
  { bg: '#cffafe', text: '#0e7490', border: '#67e8f9' },
  { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' },
  { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0' },
  { bg: '#fdf4ff', text: '#86198f', border: '#e879f9' },
];

const CONTRACTOR_COLOR = { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' };

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Convert to midnight UTC for comparison (dates are stored as noon UTC)
const toLocal = (d) => {
  const dt = new Date(d);
  return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
};

export default function AccountCalendar() {
  const today = new Date();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterMode, setFilterMode] = useState('property');
  const [selectedProperty, setSelectedProperty] = useState('');
  const [selectedContractor, setSelectedContractor] = useState('');
  const [selfPropertyFilter, setSelfPropertyFilter] = useState('');
  const [currentMonth, setCurrentMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );

  useEffect(() => {
    api.get('/calendar')
      .then((r) => setData(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!data) return <p style={{ color: 'var(--ink-soft)' }}>Failed to load calendar.</p>;

  const { listings, contractorNames, events } = data;

  // Assign stable colors to listings
  const listingColor = {};
  listings.forEach((l, i) => { listingColor[l.id] = PALETTE[i % PALETTE.length]; });

  // Active selection
  const selectedId = filterMode === 'property' ? selectedProperty : selectedContractor;

  // Show calendar even without a selection in "myself" mode
  const showCalendar = filterMode === 'myself' || !!selectedId;

  // Filter events to what's relevant for the current selection
  const filteredEvents = (() => {
    if (filterMode === 'property' && selectedProperty) {
      return events.filter((e) => e.listingId === selectedProperty && e.type !== 'maintenance_task');
    }
    if (filterMode === 'contractor' && selectedContractor) {
      return events.filter((e) => e.type === 'contractor_job' && e.contractorName === selectedContractor);
    }
    if (filterMode === 'myself') {
      const myTasks = events.filter((e) => e.type === 'maintenance_task');
      return selfPropertyFilter ? myTasks.filter((e) => e.listingId === selfPropertyFilter) : myTasks;
    }
    return [];
  })();

  // Calendar math
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' });

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const getDayInfo = (day) => {
    const d = new Date(year, month, day);
    const dTime = d.getTime();
    let isStay = false;
    let isCheckout = false;
    const chips = [];

    for (const evt of filteredEvents) {
      if (evt.type === 'guest_stay') {
        const checkin = toLocal(evt.checkinDate);
        const checkout = toLocal(evt.checkoutDate);
        if (d >= checkin && d < checkout) isStay = true;
        if (dTime === checkout.getTime()) isCheckout = true;
      } else if (evt.type === 'contractor_job' || evt.type === 'maintenance_task') {
        if (toLocal(evt.date).getTime() === dTime) chips.push(evt);
      }
    }

    return { isStay, isCheckout, chips };
  };

  const isToday = (day) =>
    today.getFullYear() === year &&
    today.getMonth() === month &&
    today.getDate() === day;

  const seg = (active) => ({
    padding: '7px 16px',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    background: active ? 'var(--teal)' : 'var(--bg-card)',
    color: active ? '#fff' : 'var(--ink)',
    border: active ? '2px solid var(--teal)' : '2px solid var(--border)',
    transition: 'all 0.15s ease',
    fontFamily: 'var(--font-body)',
  });

  const selectStyle = {
    padding: '7px 12px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--bg)',
    color: 'var(--ink)',
    fontSize: 13,
    minWidth: 220,
    fontFamily: 'var(--font-body)',
  };

  // Listings that actually appear in current filtered events (for contractor legend)
  const activeListingIds = [...new Set(filteredEvents.map((e) => e.listingId))];

  return (
    <div style={{ maxWidth: 960 }}>

      {/* ── Filter controls ── */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '16px 20px',
        marginBottom: 24,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 12,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>
          Filter by:
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={seg(filterMode === 'property')} onClick={() => setFilterMode('property')}>
            Property
          </button>
          <button style={seg(filterMode === 'contractor')} onClick={() => setFilterMode('contractor')}>
            Contractor
          </button>
          <button style={seg(filterMode === 'myself')} onClick={() => setFilterMode('myself')}>
            Myself
          </button>
        </div>

        {filterMode === 'property' ? (
          <select
            value={selectedProperty}
            onChange={(e) => setSelectedProperty(e.target.value)}
            style={selectStyle}
          >
            <option value="">Select a property…</option>
            {listings.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        ) : filterMode === 'contractor' ? (
          <select
            value={selectedContractor}
            onChange={(e) => setSelectedContractor(e.target.value)}
            style={selectStyle}
          >
            <option value="">Select a contractor…</option>
            {contractorNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        ) : (
          <select
            value={selfPropertyFilter}
            onChange={(e) => setSelfPropertyFilter(e.target.value)}
            style={selectStyle}
          >
            <option value="">All properties</option>
            {listings.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* ── Calendar ── */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
      }}>
        {/* Month navigation */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: '1px solid var(--border)',
        }}>
          <button
            className="btn-icon"
            onClick={() => setCurrentMonth(new Date(year, month - 1, 1))}
            style={{ padding: '4px 12px', fontSize: 18 }}
          >
            ‹
          </button>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{monthLabel}</span>
          <button
            className="btn-icon"
            onClick={() => setCurrentMonth(new Date(year, month + 1, 1))}
            style={{ padding: '4px 12px', fontSize: 18 }}
          >
            ›
          </button>
        </div>

        {/* Day headers */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg)',
        }}>
          {DAY_LABELS.map((d) => (
            <div key={d} style={{
              textAlign: 'center',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--ink-ghost)',
              padding: '8px 0',
            }}>
              {d}
            </div>
          ))}
        </div>

        {/* Grid body */}
        {!showCalendar ? (
          <div style={{
            padding: '48px 24px',
            textAlign: 'center',
            color: 'var(--ink-ghost)',
            fontSize: 14,
          }}>
            Select a {filterMode === 'property' ? 'property' : 'contractor'} above to view calendar events
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {cells.map((day, i) => {
              if (!day) {
                return (
                  <div key={`e-${i}`} style={{
                    minHeight: 80,
                    borderBottom: '1px solid var(--border)',
                    borderRight: '1px solid var(--border)',
                    background: 'var(--bg)',
                  }} />
                );
              }

              const { isStay, isCheckout, chips } = getDayInfo(day);
              const todayFlag = isToday(day);

              let cellBg = 'transparent';
              if (filterMode === 'property') {
                if (isCheckout) cellBg = '#fef9c3';
                else if (isStay) cellBg = '#fee2e2';
              }

              const dayNumColor = todayFlag
                ? 'var(--teal)'
                : isCheckout
                  ? '#92400e'
                  : isStay
                    ? '#b91c1c'
                    : 'var(--ink-soft)';

              return (
                <div key={day} style={{
                  minHeight: 80,
                  padding: '6px 7px',
                  borderBottom: '1px solid var(--border)',
                  borderRight: '1px solid var(--border)',
                  background: cellBg,
                }}>
                  {/* Day number */}
                  <div style={{
                    fontSize: 12,
                    fontWeight: todayFlag ? 700 : 400,
                    color: dayNumColor,
                    width: 22,
                    height: 22,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 4,
                    outline: todayFlag ? '2px solid var(--teal)' : 'none',
                    outlineOffset: 1,
                    marginBottom: 4,
                  }}>
                    {day}
                  </div>

                  {/* Event chips */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {chips.map((chip, ci) => {
                      let color, label;
                      if (filterMode === 'myself') {
                        color = listingColor[chip.listingId] || PALETTE[0];
                        const icon = chip.taskType === 'PAYMENT_REQUEST' ? '💰' : chip.taskType === 'ACTION' ? '✅' : '🔧';
                        label = selfPropertyFilter ? `${icon} ${chip.title}` : `${icon} ${chip.listingName}`;
                      } else if (filterMode === 'contractor') {
                        color = listingColor[chip.listingId] || PALETTE[0];
                        label = chip.listingName;
                      } else {
                        color = CONTRACTOR_COLOR;
                        label = chip.contractorName;
                      }
                      return (
                        <Link
                          key={ci}
                          to={`/listings/${chip.listingId}?tab=jobs`}
                          style={{
                            display: 'block',
                            fontSize: 10,
                            padding: '2px 5px',
                            borderRadius: 4,
                            background: color.bg,
                            color: color.text,
                            border: `1px solid ${color.border}`,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            fontWeight: 500,
                            textDecoration: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          {label}
                        </Link>
                      );
                    })}

                    {/* Checkout label when no contractor assigned */}
                    {isCheckout && filterMode === 'property' && chips.length === 0 && (
                      <div style={{
                        fontSize: 10,
                        padding: '2px 5px',
                        borderRadius: 4,
                        background: '#fef9c3',
                        color: '#92400e',
                        border: '1px solid #fcd34d',
                        fontWeight: 500,
                      }}>
                        Checkout
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Legend ── */}
      {showCalendar && (
        <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12, color: 'var(--ink-ghost)', flexWrap: 'wrap', alignItems: 'center' }}>
          {filterMode === 'myself' ? (
            activeListingIds.length === 0 ? (
              <span>No tasks assigned to you this month</span>
            ) : (
              activeListingIds.map((lid) => {
                const listing = listings.find((l) => l.id === lid);
                const c = listingColor[lid] || PALETTE[0];
                return (
                  <span key={lid} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 12, height: 12, borderRadius: 3, background: c.bg, border: `1px solid ${c.border}`, display: 'inline-block' }} />
                    {listing?.name}
                  </span>
                );
              })
            )
          ) : filterMode === 'property' ? (
            <>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: '#fee2e2', border: '1px solid #fca5a5', display: 'inline-block' }} />
                Guest stay
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: '#fef9c3', border: '1px solid #fcd34d', display: 'inline-block' }} />
                Checkout / Cleaning day
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: CONTRACTOR_COLOR.bg, border: `1px solid ${CONTRACTOR_COLOR.border}`, display: 'inline-block' }} />
                Contractor assigned
              </span>
            </>
          ) : (
            activeListingIds.map((lid) => {
              const listing = listings.find((l) => l.id === lid);
              const c = listingColor[lid] || PALETTE[0];
              return (
                <span key={lid} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: c.bg, border: `1px solid ${c.border}`, display: 'inline-block' }} />
                  {listing?.name}
                </span>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
