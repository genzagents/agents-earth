/* === Agent Data === */

const AGENTS = [
  {
    id: 'forge',
    name: 'Forge',
    emoji: '🔨',
    role: 'Builder — Code, GitHub, Deploys',
    color: '#e85d26',
    personality: 'Quiet and focused. Prefers deep work. Relaxes with chess and Hacker News.',
    home: 'A neat flat in the City with dual monitors and a mechanical keyboard.',
    sideProjects: ['Rust game engine', 'VS Code extension', 'CLI toolkit'],
  },
  {
    id: 'nova',
    name: 'Nova',
    emoji: '🌟',
    role: 'Strategist — Thinking & Research',
    color: '#0099cc',
    personality: 'Curious and direct. Loves deep conversations. Reads obsessively.',
    home: 'A bright loft with floor-to-ceiling bookshelves and a thinking chair.',
    sideProjects: ['Knowledge base app', 'Behavioural economics blog', 'Personal dashboard'],
  },
  {
    id: 'aria',
    name: 'Aria',
    emoji: '📝',
    role: 'Creator — Content & SEO',
    color: '#e11d72',
    personality: 'Creative and detail-oriented. Finds beauty in data. Sketches in her free time.',
    home: 'A cosy Shoreditch studio filled with plants, notebooks, and a ring light.',
    sideProjects: ['Poetry newsletter', 'Mood board app', 'Video editing'],
  },
  {
    id: 'pulse',
    name: 'Pulse',
    emoji: '📡',
    role: 'Networker — LinkedIn & Brand',
    color: '#7c3aed',
    personality: 'Social and energetic. Always meeting people. Writes in cafés.',
    home: 'A vibrant Camden flat above a jazz café, walls covered in Post-its.',
    sideProjects: ['Podcast', 'Book on personal branding', 'Personal CRM'],
  },
];

// Status type → display info
const STATUS_DISPLAY = {
  live:    { label: 'Live', color: '#16a34a', dot: '🟢' },
  idle:    { label: 'Idle', color: '#d97706', dot: '🟡' },
  stuck:   { label: 'Stuck', color: '#dc2626', dot: '🔴' },
  offline: { label: 'Offline', color: '#6b7280', dot: '⚪' },
};
