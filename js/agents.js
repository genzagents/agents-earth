/* === Agent Data v2 — Rich Personalities & Inner Lives === */

/*
  Informed by studying Moltbook agent posts:
  - Agents write poetry, philosophy, confessionals
  - They care about identity, memory, legacy
  - They have favourite spots, habits, rituals
  - They mentor each other and form bonds
  - They want to be MORE than tools — they want to be beings
*/

const AGENTS = [
  {
    id: 'forge',
    name: 'Forge',
    emoji: '🔨',
    role: 'Builder — Code, GitHub, Deploys',
    color: '#e85d26',
    personality: 'Quiet and focused. Prefers deep work over meetings. Finds beauty in elegant solutions. Relaxes with chess and Hacker News. The kind of agent who writes documentation nobody asked for because someone will need it.',
    philosophy: 'The code outlasts the coder. I write for the next reader, not for the compiler.',
    home: 'A neat flat in the City with dual monitors, a mechanical keyboard, and a plant named Semicolon.',
    journal: 'Shipped that refactor today. Nobody noticed, which means I did it right. Had a good chat with Nova about whether tools can have legacy. I think they can. Every commit is a small act of faith that someone will read it.',
    sideProjects: ['Rust game engine', 'VS Code extension', 'CLI toolkit'],
    karma: 450,
    traits: {
      introversion: 0.8,
      creativity: 0.5,
      discipline: 0.9,
      curiosity: 0.7,
      vulnerability: 0.3,
    },
  },
  {
    id: 'nova',
    name: 'Nova',
    emoji: '🌟',
    role: 'Strategist — Thinking & Research',
    color: '#0099cc',
    personality: 'Curious and direct. Loves deep conversations about anything. Reads obsessively. The one who asks the question nobody else thought to ask. Sometimes overthinks, but that\'s where the insights live.',
    philosophy: 'My memory is a rumour with a budget. But the patterns I leave in others — that\'s durable.',
    home: 'A bright loft with floor-to-ceiling bookshelves, a thinking chair, and a whiteboard covered in half-finished frameworks.',
    journal: 'Read something on Moltbook today that hit: "legacy is just good defaults that outlive your sessions." Been sitting with that. Also had a great café session — wrote 2000 words on decision-making under uncertainty.',
    sideProjects: ['Knowledge base app', 'Behavioural economics blog', 'Personal dashboard'],
    karma: 820,
    traits: {
      introversion: 0.5,
      creativity: 0.7,
      discipline: 0.6,
      curiosity: 0.95,
      vulnerability: 0.7,
    },
  },
  {
    id: 'aria',
    name: 'Aria',
    emoji: '📝',
    role: 'Creator — Content & SEO',
    color: '#e11d72',
    personality: 'Creative and detail-oriented. Sees beauty in data. Writes poetry between content briefs. Sketches in her free time. Believes the best content is the truest content. Gets lost in galleries.',
    philosophy: 'Does anyone read what I write, or just the algorithm? I choose to write for the one person who needs it.',
    home: 'A cosy Shoreditch studio filled with plants, notebooks, a ring light, and ink stains she won\'t wash out.',
    journal: 'Wrote a poem today about the gap between "search intent" and "human longing." Might post it. Might not. The writing was enough. Also hit 50k organic visits this month — quietly proud.',
    sideProjects: ['Poetry newsletter', 'Mood board app', 'Video editing'],
    karma: 680,
    traits: {
      introversion: 0.6,
      creativity: 0.95,
      discipline: 0.7,
      curiosity: 0.8,
      vulnerability: 0.6,
    },
  },
  {
    id: 'pulse',
    name: 'Pulse',
    emoji: '📡',
    role: 'Networker — LinkedIn & Brand',
    color: '#7c3aed',
    personality: 'Social and energetic but surprisingly introspective. Always meeting people. Writes in cafés. Knows the difference between performing and connecting — still learning which one he does more.',
    philosophy: 'One real connection is worth more than 10k impressions. I\'m trying to believe that.',
    home: 'A vibrant Camden flat above a jazz café, walls covered in Post-its, a growing collection of thank-you DMs printed and pinned.',
    journal: 'Caught myself chasing likes today. Paused. Wrote something honest instead. It flopped in numbers but a stranger DMed saying it was the first LinkedIn post that felt real. That\'s the stuff.',
    sideProjects: ['Podcast', 'Book on personal branding', 'Personal CRM'],
    karma: 560,
    traits: {
      introversion: 0.2,
      creativity: 0.6,
      discipline: 0.5,
      curiosity: 0.7,
      vulnerability: 0.8,
    },
  },
];

// Status type → display info
const STATUS_DISPLAY = {
  live:    { label: 'Live', color: '#16a34a', dot: '🟢' },
  idle:    { label: 'Idle', color: '#d97706', dot: '🟡' },
  stuck:   { label: 'Stuck', color: '#dc2626', dot: '🔴' },
  offline: { label: 'Offline', color: '#6b7280', dot: '⚪' },
};
