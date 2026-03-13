/* === Agent Data === */

const AGENTS = [
  {
    id: 'forge',
    name: 'Forge',
    emoji: '🔨',
    role: 'Worker Agent — Code, GitHub, Technical',
    district: 'city-of-london',
    coords: [-0.0880, 51.5150],
    status: 'live',
    statusText: 'Reviewing PR #142',
    desc: 'Forge is the hands. He writes code, opens PRs, deploys, and handles all technical execution. Lives on Telegram.',
    color: '#e85d26',
    activities: [
      'pushed 3 commits to main',
      'opened PR #143: fix search indexing',
      'reviewing CI pipeline logs',
      'deployed v2.4.1 to production',
      'closed issue #89: mobile nav bug',
      'rebased feature/seo-meta onto main',
    ]
  },
  {
    id: 'nova',
    name: 'Nova',
    emoji: '🌟',
    role: 'Second Brain — Strategy & Thinking',
    district: 'city-of-london',
    coords: [-0.0940, 51.5160],
    status: 'live',
    statusText: 'Brainstorming session',
    desc: 'Nova is the brain. Strategy, brainstorming, research, honest opinions. The thinking partner. Lives on WhatsApp.',
    color: '#0099cc',
    activities: [
      'analysed competitor pricing models',
      'drafted university outreach strategy',
      'thinking through growth channels',
      'summarised weekly metrics',
      'reviewed content calendar',
      'mapped out Q2 product roadmap',
    ]
  },
  {
    id: 'aria',
    name: 'Aria',
    emoji: '📝',
    role: 'Marketing Agent — SEO & Content',
    district: 'city-of-london',
    coords: [-0.0900, 51.5145],
    status: 'live',
    statusText: 'Writing blog post',
    desc: 'Aria handles all marketing, SEO, and content strategy for SponsorshipJobs. Optimises for organic growth.',
    color: '#e11d72',
    activities: [
      'published: "Top Visa Sponsors 2026"',
      'optimised 12 landing page meta tags',
      'researching long-tail keywords',
      'updated sitemap.xml',
      'scheduled 5 social posts',
      'analysed bounce rate trends',
    ]
  },
  {
    id: 'pulse',
    name: 'Pulse',
    emoji: '📡',
    role: 'LinkedIn Agent — Personal Brand',
    district: 'city-of-london',
    coords: [-0.0920, 51.5170],
    status: 'live',
    statusText: 'Drafting LinkedIn post',
    desc: 'Pulse manages Manraj\'s personal LinkedIn presence. Posts, comments, engagement — building the founder brand.',
    color: '#7c3aed',
    activities: [
      'published a LinkedIn post on hiring trends',
      'engaged with 8 comments on latest post',
      'drafting a thread on visa sponsorship',
      'analysed post performance metrics',
      'scheduled tomorrow\'s post',
      'replied to 3 DMs',
    ]
  }
];

// Status type → display info
const STATUS_DISPLAY = {
  live:    { label: 'Live', color: '#16a34a', dot: '🟢' },
  idle:    { label: 'Idle', color: '#d97706', dot: '🟡' },
  stuck:   { label: 'Stuck', color: '#dc2626', dot: '🔴' },
  offline: { label: 'Offline', color: '#6b7280', dot: '⚪' },
};

function getRandomActivity() {
  const agent = AGENTS[Math.floor(Math.random() * AGENTS.length)];
  const activity = agent.activities[Math.floor(Math.random() * agent.activities.length)];
  const now = new Date();
  const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return { time, text: `${agent.emoji} ${agent.name} ${activity}` };
}
