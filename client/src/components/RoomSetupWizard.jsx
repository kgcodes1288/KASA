import { useState } from 'react';
import api from '../api';

// ── Config ───────────────────────────────────────────────────────────────────

const BEDROOM_OPTIONS = [
  { label: 'Studio', value: 0 },
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: '4', value: 4 },
  { label: '5+', value: 5 },
];

const BATHROOM_OPTIONS = [
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: '4+', value: 4 },
];

const INDOOR_OPTIONS = [
  { key: 'kitchen',     label: 'Kitchen',      emoji: '🍳', defaultOn: true  },
  { key: 'livingRoom',  label: 'Living Room',  emoji: '🛋️', defaultOn: true  },
  { key: 'diningRoom',  label: 'Dining Room',  emoji: '🍽️', defaultOn: false },
  { key: 'laundryRoom', label: 'Laundry Room', emoji: '🧺', defaultOn: false },
];

const OUTDOOR_OPTIONS = [
  { key: 'backyard', label: 'Backyard / Lawn', emoji: '🌿' },
  { key: 'pool',     label: 'Pool',            emoji: '🏊' },
  { key: 'garage',   label: 'Garage',          emoji: '🚗' },
  { key: 'patio',    label: 'Patio / Deck',    emoji: '🌅' },
];

const APPLIANCE_OPTIONS = [
  { key: 'ac',          label: 'Air Conditioner (AC)', emoji: '❄️',  defaultOn: true  },
  { key: 'heater',      label: 'Heater / Furnace',     emoji: '🌡️', defaultOn: false },
  { key: 'waterHeater', label: 'Water Heater',         emoji: '💧',  defaultOn: true  },
  { key: 'washer',      label: 'Washer',               emoji: '🫧',  defaultOn: false },
  { key: 'dryer',       label: 'Dryer',                emoji: '💨',  defaultOn: false },
  { key: 'dishwasher',  label: 'Dishwasher',           emoji: '🥣',  defaultOn: false },
  { key: 'refrigerator',label: 'Refrigerator',         emoji: '🧊',  defaultOn: false },
  { key: 'oven',        label: 'Oven / Stove',         emoji: '🔥',  defaultOn: false },
  { key: 'bbq',         label: 'BBQ / Grill',          emoji: '🪵',  defaultOn: false },
];

const STEPS = ['bedrooms', 'bathrooms', 'indoors', 'outdoors', 'appliances', 'review'];

const roomEmoji = (name) => {
  if (name.includes('Bedroom') || name === 'Studio') return '🛏️';
  if (name.includes('Bathroom'))                      return '🚿';
  if (name === 'Kitchen')                             return '🍳';
  if (name === 'Living Room')                         return '🛋️';
  if (name === 'Dining Room')                         return '🍽️';
  if (name === 'Laundry Room')                        return '🧺';
  if (name.includes('Backyard') || name.includes('Lawn')) return '🌿';
  if (name === 'Pool')                                return '🏊';
  if (name.includes('Garage'))                        return '🚗';
  if (name.includes('Patio') || name.includes('Deck')) return '🌅';
  if (name.includes('Air Conditioner') || name === 'AC') return '❄️';
  if (name.includes('Heater') || name.includes('Furnace')) return '🌡️';
  if (name === 'Water Heater')                        return '💧';
  if (name === 'Washer')                              return '🫧';
  if (name === 'Dryer')                               return '💨';
  if (name === 'Dishwasher')                          return '🥣';
  if (name === 'Refrigerator')                        return '🧊';
  if (name.includes('Oven') || name.includes('Stove')) return '🔥';
  if (name.includes('BBQ') || name.includes('Grill')) return '🪵';
  return '🏠';
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function RoomSetupWizard({ listing, onClose, onDone }) {
  const [step, setStep]           = useState(0);
  const [bedrooms, setBedrooms]   = useState(null);
  const [bathrooms, setBathrooms] = useState(null);
  const [indoors, setIndoors]     = useState(
    Object.fromEntries(INDOOR_OPTIONS.map((o) => [o.key, o.defaultOn]))
  );
  const [outdoors, setOutdoors]   = useState(
    Object.fromEntries(OUTDOOR_OPTIONS.map((o) => [o.key, false]))
  );
  const [appliances, setAppliances] = useState(
    Object.fromEntries(APPLIANCE_OPTIONS.map((o) => [o.key, o.defaultOn]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const toggleIndoor    = (key) => setIndoors((p)    => ({ ...p, [key]: !p[key] }));
  const toggleOutdoor   = (key) => setOutdoors((p)   => ({ ...p, [key]: !p[key] }));
  const toggleAppliance = (key) => setAppliances((p) => ({ ...p, [key]: !p[key] }));

  const getRooms = () => {
    const rooms = [];

    if (bedrooms === 0) {
      rooms.push({ name: 'Studio', entityType: 'ROOM' });
    } else if (bedrooms !== null) {
      for (let i = 1; i <= bedrooms; i++)
        rooms.push({ name: bedrooms === 1 ? 'Bedroom' : `Bedroom ${i}`, entityType: 'ROOM' });
    }

    if (bathrooms !== null) {
      for (let i = 1; i <= bathrooms; i++)
        rooms.push({ name: bathrooms === 1 ? 'Bathroom' : `Bathroom ${i}`, entityType: 'ROOM' });
    }

    INDOOR_OPTIONS.forEach((o)    => { if (indoors[o.key])    rooms.push({ name: o.label, entityType: 'ROOM'      }); });
    OUTDOOR_OPTIONS.forEach((o)   => { if (outdoors[o.key])   rooms.push({ name: o.label, entityType: 'SPACE'     }); });
    APPLIANCE_OPTIONS.forEach((o) => { if (appliances[o.key]) rooms.push({ name: o.label, entityType: 'APPLIANCE' }); });

    return rooms;
  };

  const handleCreate = async () => {
    const rooms = getRooms();
    if (rooms.length === 0) { onDone(); return; }
    setSaving(true); setError('');
    try {
      await api.post(`/rooms/listing/${listing.id}/batch`, { rooms });
      onDone();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create rooms');
    } finally {
      setSaving(false);
    }
  };

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  // ── Styles ──
  const choiceBtn = (selected) => ({
    padding: '16px 4px',
    width: '100%',
    borderRadius: 10,
    border: `2px solid ${selected ? 'var(--teal)' : 'var(--border)'}`,
    background: selected ? 'rgba(0,137,123,0.08)' : 'var(--bg)',
    color: selected ? 'var(--teal)' : 'var(--ink)',
    fontWeight: selected ? 700 : 400,
    fontSize: 16,
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
    transition: 'all 0.12s',
  });

  const toggleCard = (active) => ({
    padding: '13px 16px',
    borderRadius: 10,
    border: `2px solid ${active ? 'var(--teal)' : 'var(--border)'}`,
    background: active ? 'rgba(0,137,123,0.06)' : 'var(--bg)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    transition: 'all 0.12s',
    userSelect: 'none',
  });

  const rooms = getRooms();

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>

        {/* Header */}
        <div className="modal-header">
          <h3>🏠 Room setup — {listing.name}</h3>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        {/* Progress bar */}
        <div style={{ display: 'flex', gap: 5, marginBottom: 28 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              flex: i === step ? 3 : 1,
              height: 5,
              borderRadius: 3,
              background: i < step ? 'var(--teal)' : i === step ? 'var(--teal)' : 'var(--border)',
              opacity: i < step ? 0.4 : 1,
              transition: 'all 0.25s',
            }} />
          ))}
        </div>

        {/* Step body */}
        <div style={{ minHeight: 240 }}>

          {/* ── Step 0: Bedrooms ── */}
          {step === 0 && (
            <>
              <div style={{ textAlign: 'center', fontSize: 32, marginBottom: 6 }}>🛏️</div>
              <h4 style={{ textAlign: 'center', fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
                How many bedrooms?
              </h4>
              <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-ghost)', marginBottom: 20 }}>
                Select one, or skip if none apply
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {BEDROOM_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    style={choiceBtn(bedrooms === opt.value)}
                    onClick={() => setBedrooms(bedrooms === opt.value ? null : opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {bedrooms === 5 && (
                <p style={{ fontSize: 11, color: 'var(--ink-ghost)', textAlign: 'center', marginTop: 8 }}>
                  5 bedrooms will be created — you can add more manually after
                </p>
              )}
            </>
          )}

          {/* ── Step 1: Bathrooms ── */}
          {step === 1 && (
            <>
              <div style={{ textAlign: 'center', fontSize: 32, marginBottom: 6 }}>🚿</div>
              <h4 style={{ textAlign: 'center', fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
                How many bathrooms?
              </h4>
              <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-ghost)', marginBottom: 20 }}>
                Select one, or skip if none apply
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {BATHROOM_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    style={choiceBtn(bathrooms === opt.value)}
                    onClick={() => setBathrooms(bathrooms === opt.value ? null : opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {bathrooms === 4 && (
                <p style={{ fontSize: 11, color: 'var(--ink-ghost)', textAlign: 'center', marginTop: 8 }}>
                  4 bathrooms will be created — you can add more manually after
                </p>
              )}
            </>
          )}

          {/* ── Step 2: Indoor spaces ── */}
          {step === 2 && (
            <>
              <div style={{ textAlign: 'center', fontSize: 32, marginBottom: 6 }}>🏠</div>
              <h4 style={{ textAlign: 'center', fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
                Which indoor spaces need cleaning?
              </h4>
              <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-ghost)', marginBottom: 20 }}>
                Toggle off anything that doesn't apply
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {INDOOR_OPTIONS.map((opt) => (
                  <div key={opt.key} style={toggleCard(indoors[opt.key])} onClick={() => toggleIndoor(opt.key)}>
                    <span style={{ fontSize: 22 }}>{opt.emoji}</span>
                    <span style={{
                      flex: 1, fontSize: 14,
                      fontWeight: indoors[opt.key] ? 600 : 400,
                      color: indoors[opt.key] ? 'var(--teal)' : 'var(--ink)',
                    }}>
                      {opt.label}
                    </span>
                    <span style={{
                      fontSize: 18,
                      color: indoors[opt.key] ? 'var(--teal)' : 'var(--border)',
                      fontWeight: 700,
                    }}>
                      {indoors[opt.key] ? '✓' : '+'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── Step 3: Outdoor & extras ── */}
          {step === 3 && (
            <>
              <div style={{ textAlign: 'center', fontSize: 32, marginBottom: 6 }}>🌿</div>
              <h4 style={{ textAlign: 'center', fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
                Any outdoor areas?
              </h4>
              <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-ghost)', marginBottom: 20 }}>
                Select all that apply
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {OUTDOOR_OPTIONS.map((opt) => (
                  <div key={opt.key} style={toggleCard(outdoors[opt.key])} onClick={() => toggleOutdoor(opt.key)}>
                    <span style={{ fontSize: 22 }}>{opt.emoji}</span>
                    <span style={{
                      flex: 1, fontSize: 14,
                      fontWeight: outdoors[opt.key] ? 600 : 400,
                      color: outdoors[opt.key] ? 'var(--teal)' : 'var(--ink)',
                    }}>
                      {opt.label}
                    </span>
                    <span style={{
                      fontSize: 18,
                      color: outdoors[opt.key] ? 'var(--teal)' : 'var(--border)',
                      fontWeight: 700,
                    }}>
                      {outdoors[opt.key] ? '✓' : '+'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── Step 4: Appliances ── */}
          {step === 4 && (
            <>
              <div style={{ textAlign: 'center', fontSize: 32, marginBottom: 6 }}>🔧</div>
              <h4 style={{ textAlign: 'center', fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
                Which appliances does this property have?
              </h4>
              <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-ghost)', marginBottom: 20 }}>
                These get their own maintenance checklists — toggle off anything that doesn't apply
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                {APPLIANCE_OPTIONS.map((opt) => (
                  <div key={opt.key} style={toggleCard(appliances[opt.key])} onClick={() => toggleAppliance(opt.key)}>
                    <span style={{ fontSize: 22 }}>{opt.emoji}</span>
                    <span style={{
                      flex: 1, fontSize: 14,
                      fontWeight: appliances[opt.key] ? 600 : 400,
                      color: appliances[opt.key] ? 'var(--teal)' : 'var(--ink)',
                    }}>
                      {opt.label}
                    </span>
                    <span style={{
                      fontSize: 18,
                      color: appliances[opt.key] ? 'var(--teal)' : 'var(--border)',
                      fontWeight: 700,
                    }}>
                      {appliances[opt.key] ? '✓' : '+'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── Step 5: Review ── */}
          {step === 5 && (
            <>
              <div style={{ textAlign: 'center', fontSize: 32, marginBottom: 6 }}>✅</div>
              <h4 style={{ textAlign: 'center', fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
                {rooms.length > 0
                  ? `Creating ${rooms.length} space${rooms.length !== 1 ? 's' : ''}`
                  : 'Nothing selected'}
              </h4>
              <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-ghost)', marginBottom: 16 }}>
                {rooms.length > 0
                  ? 'Each space gets its own cleaning checklist'
                  : 'Go back and select some spaces, or close to add rooms manually'}
              </p>
              {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                {rooms.map((r, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 14px', borderRadius: 8,
                    background: 'var(--bg)', border: '1px solid var(--border)',
                    fontSize: 13,
                  }}>
                    <span style={{ fontSize: 18 }}>{roomEmoji(r.name)}</span>
                    <span style={{ fontWeight: 500 }}>{r.name}</span>
                    {r.entityType === 'SPACE' && (
                      <span style={{
                        marginLeft: 'auto', fontSize: 10, padding: '2px 6px',
                        borderRadius: 10, background: '#f0fdf4', color: '#15803d',
                        border: '1px solid #86efac', fontWeight: 500,
                      }}>
                        outdoor
                      </span>
                    )}
                    {r.entityType === 'APPLIANCE' && (
                      <span style={{
                        marginLeft: 'auto', fontSize: 10, padding: '2px 6px',
                        borderRadius: 10, background: '#eff6ff', color: '#1d4ed8',
                        border: '1px solid #bfdbfe', fontWeight: 500,
                      }}>
                        appliance
                      </span>
                    )}
                  </div>
                ))}
                {rooms.length === 0 && (
                  <div style={{ textAlign: 'center', color: 'var(--ink-ghost)', fontSize: 13, padding: 20 }}>
                    No spaces selected
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer navigation */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)',
        }}>
          {step > 0
            ? <button className="btn btn-secondary" onClick={back}>← Back</button>
            : <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          }

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Skip only on bedrooms/bathrooms steps */}
            {(step === 0 || step === 1) && (
              <button
                onClick={next}
                style={{
                  background: 'none', border: 'none',
                  color: 'var(--ink-ghost)', fontSize: 13,
                  cursor: 'pointer', fontFamily: 'var(--font-body)',
                }}
              >
                Skip
              </button>
            )}

            {step < STEPS.length - 1 ? (
              <button className="btn btn-primary" onClick={next}>
                Next →
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={handleCreate}
                disabled={saving || rooms.length === 0}
              >
                {saving
                  ? 'Creating…'
                  : rooms.length > 0
                    ? `Create ${rooms.length} room${rooms.length !== 1 ? 's' : ''}`
                    : 'Nothing to create'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
