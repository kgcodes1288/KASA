// How the person who created a listing manages that property. Drives which
// features (room setup, cleaning tasks, jobs, cleaners) are shown for it.
export const MANAGEMENT_TYPES = [
  { value: 'SELF',       icon: '🧑‍🔧', label: "I'm the host/owner, managing it myself",            desc: 'I host the property and handle turnovers, cleaners and upkeep.' },
  { value: 'COHOST',     icon: '🤝', label: "I'm a co-host managing it",          desc: 'I actively run this property on behalf of the owner.' },
  { value: 'HOST_WITH_COHOST', icon: '🏠', label: "I'm the host/owner, using a co-host to manage it", desc: 'A co-host handles turnovers and day-to-day operations — I just want to stay informed.' },
];

export const isDelegated = (listing) => listing?.managementType === 'HOST_WITH_COHOST';
export const managementLabel = (type) => MANAGEMENT_TYPES.find((t) => t.value === type)?.label;
