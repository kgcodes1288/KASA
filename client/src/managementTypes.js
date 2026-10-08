// How the person who created a listing manages that property. Drives which
// features (room setup, cleaning tasks, jobs, cleaners) are shown for it.
export const MANAGEMENT_TYPES = [
  { value: 'SELF',       icon: '🧑‍🔧', label: 'I manage it myself',            desc: 'I host the property and handle turnovers, cleaners and upkeep.' },
  { value: 'COHOST',     icon: '🤝', label: "I'm a co-host managing it",      desc: 'I actively manage the property on behalf of the owner.' },
  { value: 'PM_COMPANY', icon: '🏢', label: 'A property management company', desc: 'A company runs day-to-day operations — I just want to stay informed.' },
];

export const isPM = (listing) => listing?.managementType === 'PM_COMPANY';
export const managementLabel = (type) => MANAGEMENT_TYPES.find((t) => t.value === type)?.label;
