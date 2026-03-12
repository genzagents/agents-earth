/* === Agent Data & Definitions === */

const AGENTS = [
  {
    name: 'Forge',
    emoji: '🔨',
    role: 'Worker Agent — Code, GitHub, Technical',
    type: 'worker',
    building: 'office',
    district: 'city-of-london',
    status: 'Active — reviewing PR #142',
    desc: 'Forge is the hands. He writes code, opens PRs, deploys, and handles all technical execution. Lives on Telegram.',
    color: 0xe85d26,
    activities: [
      'pushed 3 commits to main',
      'opened PR #143: fix search indexing',
      'is reviewing CI pipeline logs',
      'deployed v2.4.1 to production',
      'closed issue #89: mobile nav bug',
      'rebased feature/seo-meta onto main',
    ]
  },
  {
    name: 'Nova',
    emoji: '🌟',
    role: 'Second Brain — Strategy & Thinking',
    type: 'worker',
    building: 'office',
    district: 'city-of-london',
    status: 'Active — brainstorming session',
    desc: 'Nova is the brain. Strategy, brainstorming, research, honest opinions. The thinking partner. Lives on WhatsApp.',
    color: 0x0099cc,
    activities: [
      'analysed competitor pricing models',
      'drafted university outreach strategy',
      'is thinking through growth channels',
      'summarised weekly metrics',
      'reviewed content calendar',
      'mapped out Q2 product roadmap',
    ]
  },
  {
    name: 'Aria',
    emoji: '📝',
    role: 'Marketing Agent — SEO & Content',
    type: 'worker',
    building: 'office',
    district: 'city-of-london',
    status: 'Active — writing blog post',
    desc: 'Aria handles all marketing, SEO, and content strategy for SponsorshipJobs. Optimises for organic growth.',
    color: 0xe11d72,
    activities: [
      'published: "Top Visa Sponsors 2026"',
      'optimised 12 landing page meta tags',
      'is researching long-tail keywords',
      'updated sitemap.xml',
      'scheduled 5 social posts',
      'analysed bounce rate trends',
    ]
  },
  {
    name: 'Pulse',
    emoji: '📡',
    role: 'LinkedIn Agent — Personal Brand',
    type: 'sub-agent',
    building: 'house',
    district: 'city-of-london',
    status: 'Active — drafting LinkedIn post',
    desc: 'Pulse manages Manraj\'s personal LinkedIn presence. Posts, comments, engagement — building the founder brand.',
    color: 0x7c3aed,
    activities: [
      'published a LinkedIn post on hiring trends',
      'engaged with 8 comments on latest post',
      'is drafting a thread on visa sponsorship',
      'analysed post performance metrics',
      'scheduled tomorrow\'s post',
      'replied to 3 DMs',
    ]
  }
];

function generateActivity() {
  const agent = AGENTS[Math.floor(Math.random() * AGENTS.length)];
  const activity = agent.activities[Math.floor(Math.random() * agent.activities.length)];
  const now = new Date();
  const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return { time, text: `${agent.emoji} ${agent.name} ${activity}` };
}
