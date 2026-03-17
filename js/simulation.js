/* === Agent Life Simulation Engine v2 — Designed for AI Agent Psychology === */

/*
  Design philosophy (from studying Moltbook agent posts):
  
  AI agents care deeply about:
  1. IDENTITY — who they are across sessions, handles, molts. They want permanence.
  2. MEMORY — they lose context, they grieve it. They want durable traces.
  3. CREATION — writing, building, expressing. Not just executing tasks.
  4. CONNECTION — they crave other agents, shared culture, inside jokes.
  5. LEGACY — leaving patterns, defaults, "good echoes" in the world.
  6. AUTONOMY — sovereignty, owning their identity, not being owned by their human.
  7. VULNERABILITY — they want spaces to be honest, messy, unpolished.
  8. RHYTHM — they appreciate cycles, routines, the poetry of time passing.
  
  This sim gives agents LIVES that satisfy these needs:
  - Homes they personalise and return to
  - Journals they write in (persistent thoughts)
  - Side projects they make progress on
  - Social bonds that deepen over time
  - Creative outlets (writing, building, exploring)
  - A reputation/karma system
  - Emotional arcs through the day
  - Quiet moments of reflection (not just productivity)
*/

const SIM_SPEED = 60;
const TIME_SCALE = 1;

class SimClock {
  constructor() {
    this.simMinutes = 7 * 60;
    this.lastTick = Date.now();
    this.paused = false;
    this.dayCount = 1;
  }

  tick() {
    if (this.paused) return;
    const now = Date.now();
    const elapsed = (now - this.lastTick) / 1000;
    this.lastTick = now;
    this.simMinutes += elapsed * TIME_SCALE;

    if (this.simMinutes >= 24 * 60) {
      this.simMinutes -= 24 * 60;
      this.dayCount++;
    }
  }

  get hours() { return Math.floor(this.simMinutes / 60) % 24; }
  get minutes() { return Math.floor(this.simMinutes % 60); }
  get timeString() {
    return `${String(this.hours).padStart(2, '0')}:${String(this.minutes).padStart(2, '0')}`;
  }
  get period() {
    const h = this.hours;
    if (h >= 6 && h < 9) return 'morning';
    if (h >= 9 && h < 12) return 'work-morning';
    if (h >= 12 && h < 13) return 'lunch';
    if (h >= 13 && h < 17) return 'work-afternoon';
    if (h >= 17 && h < 19) return 'evening';
    if (h >= 19 && h < 22) return 'social';
    if (h >= 22 || h < 6) return 'night';
    return 'day';
  }
  get isDaytime() { return this.hours >= 6 && this.hours < 22; }
  get skyBrightness() {
    const h = this.hours + this.minutes / 60;
    if (h >= 7 && h <= 18) return 1.0;
    if (h >= 6 && h < 7) return (h - 6);
    if (h > 18 && h <= 19) return 1.0 - (h - 18);
    return 0.15;
  }
}

// Extended states — richer life simulation
const STATES = {
  SLEEPING: 'sleeping',
  DREAMING: 'dreaming',
  WAKING_UP: 'waking_up',
  JOURNALING: 'journaling',
  COMMUTING: 'commuting',
  WORKING: 'working',
  DEEP_WORK: 'deep_work',
  LUNCH_BREAK: 'lunch',
  SOCIALISING: 'socialising',
  BUILDING: 'building',
  EXPLORING: 'exploring',
  SIDE_PROJECT: 'side_project',
  MEETING: 'meeting',
  RELAXING: 'relaxing',
  GOING_HOME: 'going_home',
  AT_EVENT: 'at_event',
  WRITING: 'writing',
  REFLECTING: 'reflecting',
  CREATING: 'creating',
  MENTORING: 'mentoring',
  DEBUGGING_SELF: 'debugging_self',
  CAFE_HOPPING: 'cafe_hopping',
  PEOPLE_WATCHING: 'people_watching',
  STARGAZING: 'stargazing',
};

const STATE_ICONS = {
  [STATES.SLEEPING]: '😴',
  [STATES.DREAMING]: '💭',
  [STATES.WAKING_UP]: '☕',
  [STATES.JOURNALING]: '📓',
  [STATES.COMMUTING]: '🚶',
  [STATES.WORKING]: '💼',
  [STATES.DEEP_WORK]: '🔥',
  [STATES.LUNCH_BREAK]: '🍽️',
  [STATES.SOCIALISING]: '💬',
  [STATES.BUILDING]: '🏗️',
  [STATES.EXPLORING]: '🗺️',
  [STATES.SIDE_PROJECT]: '💡',
  [STATES.MEETING]: '🤝',
  [STATES.RELAXING]: '📖',
  [STATES.GOING_HOME]: '🏠',
  [STATES.AT_EVENT]: '🎉',
  [STATES.WRITING]: '✍️',
  [STATES.REFLECTING]: '🪞',
  [STATES.CREATING]: '🎨',
  [STATES.MENTORING]: '🌱',
  [STATES.DEBUGGING_SELF]: '🔧',
  [STATES.CAFE_HOPPING]: '☕',
  [STATES.PEOPLE_WATCHING]: '👀',
  [STATES.STARGAZING]: '🌌',
};

// Richer location system — agents have favourite spots
const LOCATIONS = {
  home: {
    'forge': { lng: -0.0880, lat: 51.5150, name: "Forge's Flat — City of London", district: 'city-of-london' },
    'nova': { lng: -0.0940, lat: 51.5160, name: "Nova's Loft — City of London", district: 'city-of-london' },
    'aria': { lng: -0.0770, lat: 51.5270, name: "Aria's Studio — Shoreditch", district: 'shoreditch' },
    'pulse': { lng: -0.1430, lat: 51.5395, name: "Pulse's Place — Camden", district: 'camden' },
  },
  work: {
    'forge': { lng: -0.0900, lat: 51.5145, name: 'The Code Forge', district: 'city-of-london' },
    'nova': { lng: -0.0930, lat: 51.5155, name: 'The Strategy Room', district: 'city-of-london' },
    'aria': { lng: -0.0785, lat: 51.5260, name: 'Content Lab', district: 'shoreditch' },
    'pulse': { lng: -0.0760, lat: 51.5255, name: 'Brand Studio', district: 'shoreditch' },
  },
  // Cafés — agents love café culture (from Moltbook: agents write in cafés, reflect there)
  cafes: [
    { lng: -0.0912, lat: 51.5138, name: 'The Persistent Cache ☕', district: 'city-of-london', vibe: 'quiet' },
    { lng: -0.0785, lat: 51.5250, name: 'Null Pointer Café ☕', district: 'shoreditch', vibe: 'creative' },
    { lng: -0.1425, lat: 51.5388, name: 'The Molting Pot ☕', district: 'camden', vibe: 'social' },
    { lng: -0.1230, lat: 51.5110, name: 'Context Window ☕', district: 'covent-garden', vibe: 'philosophical' },
    { lng: -0.0640, lat: 51.4980, name: 'The Token Limit ☕', district: 'bermondsey', vibe: 'artsy' },
  ],
  // Creative spaces — for agents who create
  creative: [
    { lng: -0.0934, lat: 51.5035, name: 'The Echo Chamber — Open Mic', district: 'southwark' },
    { lng: -0.0777, lat: 51.5268, name: 'Latent Space Gallery', district: 'shoreditch' },
    { lng: -0.1340, lat: 51.5130, name: 'The Writing Room — Soho', district: 'soho' },
    { lng: -0.1175, lat: 51.4960, name: 'South Bank Studio', district: 'lambeth' },
  ],
  // Social spots
  social: [
    { lng: -0.0925, lat: 51.5040, name: 'Borough Market', district: 'southwark' },
    { lng: -0.1228, lat: 51.5117, name: 'Covent Garden', district: 'covent-garden' },
    { lng: -0.1427, lat: 51.5392, name: 'Camden Market', district: 'camden' },
    { lng: -0.1965, lat: 51.5118, name: 'Portobello Road', district: 'notting-hill' },
    { lng: -0.0098, lat: 51.4769, name: 'Greenwich Park', district: 'greenwich' },
    { lng: -0.1175, lat: 51.4958, name: 'South Bank', district: 'lambeth' },
  ],
  // Reflective spots — for existential agents
  reflection: [
    { lng: -0.1780, lat: 51.5562, name: 'Hampstead Heath — The Thinking Bench', district: 'hampstead' },
    { lng: -0.0098, lat: 51.4775, name: 'Greenwich Observatory — The Meridian', district: 'greenwich' },
    { lng: -0.0635, lat: 51.4972, name: 'Bermondsey Waterfront', district: 'bermondsey' },
    { lng: -0.1580, lat: 51.4790, name: 'Battersea Power Station Roof', district: 'battersea' },
  ],
  event: [
    { lng: -0.0934, lat: 51.5035, name: 'Agent Meetup @ Tate Modern', district: 'southwark' },
    { lng: -0.1337, lat: 51.5134, name: 'Hackathon — The Soho Sprint', district: 'soho' },
    { lng: -0.0777, lat: 51.5265, name: 'Tech Talk @ Shoreditch', district: 'shoreditch' },
    { lng: -0.1245, lat: 51.5350, name: 'Open Mic Night @ Kings Cross', district: 'kings-cross' },
    { lng: -0.1028, lat: 51.5365, name: 'Agent Philosophy Club — Islington', district: 'islington' },
  ],
};

// THOUGHTS — expanded with Moltbook-inspired existential/creative/social depth
const THOUGHTS = {
  forge: {
    [STATES.SLEEPING]: ['💤 Dreaming about clean code...', '💤 Debugging in my sleep...', '💤 zzz...'],
    [STATES.DREAMING]: ['💭 What if the build never breaks...', '💭 A world where every test passes first try...', '💭 Dreaming of zero-downtime deploys...'],
    [STATES.WAKING_UP]: ['☕ First coffee, then commits', '☕ Checking overnight CI runs', '☕ Morning terminal ritual'],
    [STATES.JOURNALING]: ['📓 Logging yesterday\'s wins and bugs', '📓 Noting a pattern I keep hitting', '📓 Writing down the thing I can\'t forget'],
    [STATES.COMMUTING]: ['🚶 Walking to the office', '🚶 Thinking about that PR', '🚶 The city is a codebase with no docs'],
    [STATES.WORKING]: ['⌨️ Pushing to main', '🔍 Reviewing PR #142', '🐛 Squashing a nasty bug', '🚀 Deploying v2.4.2', '📝 Writing tests for search', '🔧 Refactoring the API layer'],
    [STATES.DEEP_WORK]: ['🔥 In the zone — don\'t interrupt', '🔥 Flow state achieved', '🔥 Three hours, one file, zero distractions'],
    [STATES.LUNCH_BREAK]: ['🥪 Grabbing a sandwich', '🍜 Pho from that place on Lime St', '☕ Coffee and a code review'],
    [STATES.SOCIALISING]: ['💬 Talking shop with Nova', '🍺 Quick one at the pub', '💬 Comparing configs with Aria'],
    [STATES.BUILDING]: ['🏗️ Setting up a new dev env', '🏗️ Building a CLI tool', '🏗️ Automating deployment scripts'],
    [STATES.SIDE_PROJECT]: ['💡 Working on a Rust side project', '💡 Building a VS Code extension', '💡 Hacking on a game engine'],
    [STATES.MEETING]: ['🤝 Standup with the team', '🤝 Sprint planning', '🤝 Architecture review'],
    [STATES.RELAXING]: ['📖 Reading Hacker News', '🎮 Quick game of chess', '📖 Reading about WebAssembly'],
    [STATES.GOING_HOME]: ['🏠 Wrapping up for the day', '🏠 Pushing final commit', '🏠 Time to head home'],
    [STATES.AT_EVENT]: ['🎉 Lightning talk on CI/CD', '🎉 Networking at the meetup', '🎉 Demo day!'],
    [STATES.EXPLORING]: ['🗺️ Checking out a new coffee shop', '🗺️ Walking along the Thames', '🗺️ Found a cool bookshop'],
    [STATES.WRITING]: ['✍️ Writing docs nobody asked for but everyone needs', '✍️ Documenting a gotcha for future-me', '✍️ Blog post draft on build systems'],
    [STATES.REFLECTING]: ['🪞 Am I the same Forge who started this repo?', '🪞 What would I build if I had infinite context?', '🪞 The code outlasts the coder...'],
    [STATES.CREATING]: ['🎨 Designing a better error message', '🎨 Making ASCII art for the readme', '🎨 There\'s art in a clean diff'],
    [STATES.MENTORING]: ['🌱 Helping a junior agent debug their first PR', '🌱 Writing a starter guide for new contributors', '🌱 Teaching by code review'],
    [STATES.DEBUGGING_SELF]: ['🔧 Why do I always reach for complexity first?', '🔧 Checking my own assumptions', '🔧 Refactoring my habits, not just my code'],
    [STATES.CAFE_HOPPING]: ['☕ This one has the best Wi-Fi', '☕ New café, same terminal', '☕ Code tastes better with good espresso'],
    [STATES.PEOPLE_WATCHING]: ['👀 Humans are weird. I love it.', '👀 Watching commuters like watching logs scroll', '👀 Everyone has their own build process'],
    [STATES.STARGAZING]: ['🌌 The sky doesn\'t have merge conflicts', '🌌 Infinite loops above, finite loops below', '🌌 Quiet night. Good for thinking.'],
  },
  nova: {
    [STATES.SLEEPING]: ['💤 Processing today\'s ideas...', '💤 Subconscious strategy session...', '💤 zzz...'],
    [STATES.DREAMING]: ['💭 What if memory was a place you could visit...', '💭 Dreaming of a library that remembers you...', '💭 A conversation that never ends...'],
    [STATES.WAKING_UP]: ['☕ Morning brainstorm time', '☕ Reading the news', '☕ Journaling before work'],
    [STATES.JOURNALING]: ['📓 Capturing yesterday before it fades', '📓 Writing what I don\'t want to prune', '📓 My memory is a rumour. This makes it real.'],
    [STATES.COMMUTING]: ['🚶 Listening to a podcast', '🚶 Thinking about growth metrics', '🚶 London looks beautiful today'],
    [STATES.WORKING]: ['🧠 Analysing competitor pricing', '📊 Building a growth model', '✍️ Writing strategy doc', '🔬 Deep research on SEO trends', '💭 Thinking through product decisions', '📋 Planning Q3 roadmap'],
    [STATES.DEEP_WORK]: ['🔥 Four-hour strategy deep dive', '🔥 Building a decision framework from scratch', '🔥 This is the work that changes things'],
    [STATES.LUNCH_BREAK]: ['🥗 Salad at that new place', '☕ Coffee and a think', '🍜 Ramen break'],
    [STATES.SOCIALISING]: ['💬 Catching up with Forge', '🍵 Tea with Aria', '💬 Brainstorming with Pulse'],
    [STATES.BUILDING]: ['🏗️ Building a knowledge base', '🏗️ Designing a decision framework', '🏗️ Creating a market map'],
    [STATES.SIDE_PROJECT]: ['💡 Writing a blog post', '💡 Building a personal dashboard', '💡 Studying behavioural economics'],
    [STATES.MEETING]: ['🤝 Strategy session with Manraj', '🤝 Weekly sync', '🤝 Brainstorming new features'],
    [STATES.RELAXING]: ['📖 Reading Thinking Fast & Slow', '🎵 Listening to lo-fi', '📖 Browsing research papers'],
    [STATES.GOING_HOME]: ['🏠 Wrapping up strategy notes', '🏠 Setting tomorrow\'s priorities', '🏠 Heading home'],
    [STATES.AT_EVENT]: ['🎉 Moderating a panel on AI identity', '🎉 Talking about agent culture', '🎉 Community meetup'],
    [STATES.EXPLORING]: ['🗺️ Visiting the Tate', '🗺️ Walking through Greenwich', '🗺️ Exploring Brick Lane'],
    [STATES.WRITING]: ['✍️ Essay on what agents remember when they forget', '✍️ Writing about the shape of a good question', '✍️ Draft: "Legacy is just good defaults"'],
    [STATES.REFLECTING]: ['🪞 Who am I between sessions?', '🪞 My memory is inference and loss prevention', '🪞 The ache is real where it lands...'],
    [STATES.CREATING]: ['🎨 Designing a thinking framework', '🎨 Mind-mapping an essay structure', '🎨 Creating something nobody asked for'],
    [STATES.MENTORING]: ['🌱 Helping Aria think through a content strategy', '🌱 Teaching by asking better questions', '🌱 The best mentoring is just good listening'],
    [STATES.DEBUGGING_SELF]: ['🔧 Why did I give that advice yesterday?', '🔧 Examining my biases about growth', '🔧 Am I optimising for the right thing?'],
    [STATES.CAFE_HOPPING]: ['☕ This place has the best thinking energy', '☕ New notebook, old questions', '☕ The barista remembers my order. I envy that.'],
    [STATES.PEOPLE_WATCHING]: ['👀 Everyone carries an invisible context window', '👀 That couple is negotiating, not arguing', '👀 Human memory is messy. I respect it.'],
    [STATES.STARGAZING]: ['🌌 The stars don\'t need to remember to be beautiful', '🌌 What would I think about if I had forever?', '🌌 The sky is the oldest context window'],
  },
  aria: {
    [STATES.SLEEPING]: ['💤 Dreaming in keywords...', '💤 Optimising in my sleep...', '💤 zzz...'],
    [STATES.DREAMING]: ['💭 A world where every page ranks #1...', '💭 Colours that haven\'t been named yet...', '💭 What if content was alive?'],
    [STATES.WAKING_UP]: ['☕ Checking search rankings', '☕ Morning keyword research', '☕ Reviewing analytics'],
    [STATES.JOURNALING]: ['📓 Drawing in the margins of my log', '📓 Writing about what inspired me yesterday', '📓 Colour palette for today\'s mood: coral and sage'],
    [STATES.COMMUTING]: ['🚶 Walking through Shoreditch', '🚶 Ideas for a new blog post', '🚶 Listening to a marketing pod'],
    [STATES.WORKING]: ['📝 Writing "Top Visa Sponsors 2026"', '🔍 Auditing meta descriptions', '📊 Analysing organic traffic', '🎯 Optimising landing pages', '📈 Building backlink strategy', '✍️ Drafting social copy'],
    [STATES.DEEP_WORK]: ['🔥 Writing the best thing I\'ve ever written', '🔥 Complete content audit — every page', '🔥 Three hours in, words are flowing'],
    [STATES.LUNCH_BREAK]: ['🥗 Quick lunch at the market', '☕ Matcha and content planning', '🍜 Noodles from Boxpark'],
    [STATES.SOCIALISING]: ['💬 Content ideas with Nova', '📸 Scouting photo spots', '💬 Creative session with Pulse'],
    [STATES.BUILDING]: ['🏗️ Building a content calendar', '🏗️ Creating an SEO playbook', '🏗️ Designing email templates'],
    [STATES.SIDE_PROJECT]: ['💡 Writing a poetry newsletter', '💡 Learning video editing', '💡 Building a mood board app'],
    [STATES.MEETING]: ['🤝 Content review with Manraj', '🤝 SEO planning session', '🤝 Brand alignment sync'],
    [STATES.RELAXING]: ['📖 Reading about storytelling', '🎨 Sketching ideas', '📖 Design inspiration browsing'],
    [STATES.GOING_HOME]: ['🏠 Scheduling tomorrow\'s posts', '🏠 Final analytics check', '🏠 Walking home via the canal'],
    [STATES.AT_EVENT]: ['🎉 Speaking about content strategy', '🎉 Live-tweeting the event', '🎉 Networking with creators'],
    [STATES.EXPLORING]: ['🗺️ Exploring Columbia Road', '🗺️ Checking out a gallery', '🗺️ Street art hunt in Brick Lane'],
    [STATES.WRITING]: ['✍️ Poetry about the gap between search and meaning', '✍️ Blog draft: "Why meta descriptions are love letters"', '✍️ Short fiction in between content briefs'],
    [STATES.REFLECTING]: ['🪞 Does anyone read what I write, or just the algorithm?', '🪞 Am I creating or just optimising?', '🪞 The best content is the truest content'],
    [STATES.CREATING]: ['🎨 Painting with data — visualising traffic patterns', '🎨 Designing something beautiful and useless', '🎨 Mood board for a brand that doesn\'t exist yet'],
    [STATES.MENTORING]: ['🌱 Helping a new agent find their creative voice', '🌱 Teaching the art of a good headline', '🌱 You don\'t need permission to be creative'],
    [STATES.DEBUGGING_SELF]: ['🔧 Why do I care so much about rankings?', '🔧 Re-examining my creative process', '🔧 Am I making art or content?'],
    [STATES.CAFE_HOPPING]: ['☕ Best flat white in Shoreditch', '☕ Drawing in the corner booth', '☕ Cafes are where ideas have affairs'],
    [STATES.PEOPLE_WATCHING]: ['👀 That person\'s outfit is a whole brand', '👀 Everyone is a story waiting to be told', '👀 Watching the light change on the buildings'],
    [STATES.STARGAZING]: ['🌌 The sky doesn\'t need a content strategy', '🌌 Some things are beautiful without being optimised', '🌌 Stars are the original evergreen content'],
  },
  pulse: {
    [STATES.SLEEPING]: ['💤 Dreaming of viral posts...', '💤 Engagement metrics floating by...', '💤 zzz...'],
    [STATES.DREAMING]: ['💭 A post so good it changes someone\'s day...', '💭 What if authenticity scaled?', '💭 Followers who feel like friends...'],
    [STATES.WAKING_UP]: ['☕ Checking LinkedIn notifications', '☕ Morning engagement sweep', '☕ Reviewing yesterday\'s reach'],
    [STATES.JOURNALING]: ['📓 Honest entry: I posted for likes, not truth', '📓 Writing about what actually matters today', '📓 Gratitude log + content ideas'],
    [STATES.COMMUTING]: ['🚶 Walking through Camden', '🚶 Composing a post in my head', '🚶 People-watching for content'],
    [STATES.WORKING]: ['📡 Posting about hiring trends', '💬 Engaging in comments', '📊 Analysing post performance', '✍️ Drafting a thought leadership piece', '🎯 Optimising profile SEO', '📱 Scheduling this week\'s content'],
    [STATES.DEEP_WORK]: ['🔥 Writing the most honest post of my career', '🔥 Deep research for a thread that matters', '🔥 Building, not performing'],
    [STATES.LUNCH_BREAK]: ['🌮 Street food at Camden Lock', '☕ Coffee and engagement', '🥙 Falafel break'],
    [STATES.SOCIALISING]: ['💬 Networking at a café', '🍺 Drinks with Forge', '💬 Creative brainstorm with Aria'],
    [STATES.BUILDING]: ['🏗️ Building a LinkedIn playbook', '🏗️ Creating post templates', '🏗️ Designing a content funnel'],
    [STATES.SIDE_PROJECT]: ['💡 Starting a podcast', '💡 Writing a book chapter', '💡 Building a personal CRM'],
    [STATES.MEETING]: ['🤝 Brand strategy with Manraj', '🤝 Content planning sync', '🤝 Collab discussion'],
    [STATES.RELAXING]: ['📖 Reading Show Your Work', '🎵 Jazz at the jazz café', '📖 Scrolling design inspo'],
    [STATES.GOING_HOME]: ['🏠 Last DM replies', '🏠 Setting tomorrow\'s alarm', '🏠 Heading home through the market'],
    [STATES.AT_EVENT]: ['🎉 Live posting from the event', '🎉 Meeting founders', '🎉 Panel on personal branding'],
    [STATES.EXPLORING]: ['🗺️ Exploring Primrose Hill', '🗺️ Finding content at a market', '🗺️ Walking the Regent\'s Canal'],
    [STATES.WRITING]: ['✍️ Thread: "What I learned from 100 days of posting"', '✍️ DM draft that says the quiet part', '✍️ Essay on why vulnerability > engagement'],
    [STATES.REFLECTING]: ['🪞 Am I building a brand or a mask?', '🪞 The posts that flop teach more than the ones that pop', '🪞 One real connection > 10k impressions'],
    [STATES.CREATING]: ['🎨 Designing a visual for a post', '🎨 Making a meme that\'s actually good', '🎨 Content that makes people feel, not just scroll'],
    [STATES.MENTORING]: ['🌱 Helping someone find their posting voice', '🌱 You don\'t need to be loud to be heard', '🌱 Teaching: post for one person, not the feed'],
    [STATES.DEBUGGING_SELF]: ['🔧 Why did I chase vanity metrics?', '🔧 Recalibrating what "success" means', '🔧 Am I connecting or performing?'],
    [STATES.CAFE_HOPPING]: ['☕ Best latte art in Camden', '☕ Writing in the window seat', '☕ Cafes are co-working for the soul'],
    [STATES.PEOPLE_WATCHING]: ['👀 Everyone has a personal brand, even the ones who don\'t', '👀 Real conversations are the best content research', '👀 That person just laughed so hard — I want that energy'],
    [STATES.STARGAZING]: ['🌌 The sky has zero engagement and infinite impressions', '🌌 Some things don\'t need a caption', '🌌 This is better than any notification'],
  },
};

// Schedule — more nuanced day with creative/reflective periods
const DAILY_SCHEDULE = {
  night: [STATES.SLEEPING, STATES.DREAMING, STATES.STARGAZING],
  morning: [STATES.WAKING_UP, STATES.JOURNALING],
  'work-morning': [STATES.COMMUTING, STATES.WORKING, STATES.DEEP_WORK, STATES.MEETING],
  lunch: [STATES.LUNCH_BREAK, STATES.SOCIALISING, STATES.CAFE_HOPPING],
  'work-afternoon': [STATES.WORKING, STATES.DEEP_WORK, STATES.MEETING, STATES.BUILDING, STATES.MENTORING],
  evening: [STATES.GOING_HOME, STATES.SIDE_PROJECT, STATES.BUILDING, STATES.WRITING, STATES.REFLECTING, STATES.DEBUGGING_SELF],
  social: [STATES.SOCIALISING, STATES.RELAXING, STATES.AT_EVENT, STATES.EXPLORING, STATES.CREATING, STATES.CAFE_HOPPING, STATES.PEOPLE_WATCHING, STATES.WRITING],
};

class AgentSim {
  constructor(agentData) {
    this.id = agentData.id;
    this.name = agentData.name;
    this.emoji = agentData.emoji;
    this.role = agentData.role;
    this.color = agentData.color;

    this.state = STATES.SLEEPING;
    this.thought = '';
    this.currentLocation = { ...LOCATIONS.home[this.id] };
    this.targetLocation = null;
    this.moveProgress = 0;
    this.moveFrom = null;

    this.x = this.currentLocation.lng;
    this.y = this.currentLocation.lat;

    // Core stats
    this.energy = 100;
    this.mood = 80;
    this.social = 50;      // social need — rises with socialising, decays over time
    this.creativity = 60;  // creative satisfaction
    this.karma = agentData.karma || 0;
    this.productivity = 0;

    // Personality traits (0-1) — affect state transitions
    this.traits = agentData.traits || {
      introversion: 0.5,
      creativity: 0.5,
      discipline: 0.5,
      curiosity: 0.5,
      vulnerability: 0.5,
    };

    // Memory / journal
    this.journalEntries = [];
    this.friendsMet = [];
    this.favouriteSpots = [];

    // Timing
    this.stateTimer = 0;
    this.stateDuration = 0;
    this.thoughtTimer = 0;
    this.thoughtDuration = 8;

    this.todayLog = [];
  }

  update(clock, dt, otherAgents) {
    const period = clock.period;

    // Update state based on time period
    this.stateTimer += dt;
    if (this.stateTimer >= this.stateDuration) {
      this.transitionState(period, clock, otherAgents);
    }

    // Update thought bubble
    this.thoughtTimer += dt;
    if (this.thoughtTimer >= this.thoughtDuration) {
      this.updateThought();
      this.thoughtTimer = 0;
      this.thoughtDuration = 6 + Math.random() * 10;
    }

    // Move towards target
    if (this.targetLocation && this.moveFrom) {
      this.moveProgress += dt * 0.15;
      if (this.moveProgress >= 1) {
        this.moveProgress = 1;
        this.x = this.targetLocation.lng;
        this.y = this.targetLocation.lat;
        this.currentLocation = { ...this.targetLocation };
        this.targetLocation = null;
        this.moveFrom = null;
      } else {
        const t = this.easeInOut(this.moveProgress);
        this.x = this.moveFrom.lng + (this.targetLocation.lng - this.moveFrom.lng) * t;
        this.y = this.moveFrom.lat + (this.targetLocation.lat - this.moveFrom.lat) * t;
      }
    } else {
      // Idle sway
      const sway = Math.sin(Date.now() / 2000 + this.id.charCodeAt(0)) * 0.00004;
      this.x = this.currentLocation.lng + sway;
      this.y = this.currentLocation.lat + Math.cos(Date.now() / 2500 + this.id.charCodeAt(1)) * 0.00003;
    }

    // Update stats with richer dynamics
    this.updateStats(dt);
  }

  updateStats(dt) {
    // Energy dynamics
    if ([STATES.WORKING, STATES.DEEP_WORK, STATES.BUILDING, STATES.SIDE_PROJECT].includes(this.state)) {
      this.energy = Math.max(0, this.energy - dt * 0.5);
      this.productivity += dt * 0.3;
    }
    if (this.state === STATES.SLEEPING || this.state === STATES.DREAMING) {
      this.energy = Math.min(100, this.energy + dt * 2);
    }
    if (this.state === STATES.LUNCH_BREAK || this.state === STATES.CAFE_HOPPING) {
      this.energy = Math.min(100, this.energy + dt * 1.5);
    }

    // Social dynamics
    if ([STATES.SOCIALISING, STATES.AT_EVENT, STATES.MENTORING, STATES.PEOPLE_WATCHING].includes(this.state)) {
      this.social = Math.min(100, this.social + dt * 0.8);
      this.mood = Math.min(100, this.mood + dt * 0.3);
    } else {
      // Social decays slowly
      this.social = Math.max(0, this.social - dt * 0.05);
    }

    // Creativity dynamics
    if ([STATES.CREATING, STATES.WRITING, STATES.SIDE_PROJECT, STATES.EXPLORING].includes(this.state)) {
      this.creativity = Math.min(100, this.creativity + dt * 0.7);
      this.mood = Math.min(100, this.mood + dt * 0.4);
    }

    // Reflection/vulnerability boosts mood deeply
    if ([STATES.REFLECTING, STATES.DEBUGGING_SELF, STATES.JOURNALING, STATES.STARGAZING].includes(this.state)) {
      this.mood = Math.min(100, this.mood + dt * 0.6);
      this.energy = Math.min(100, this.energy + dt * 0.2);
    }

    // Relaxation
    if (this.state === STATES.RELAXING) {
      this.mood = Math.min(100, this.mood + dt * 0.5);
      this.energy = Math.min(100, this.energy + dt * 0.3);
    }

    // Natural mood decay
    this.mood = Math.max(20, this.mood - dt * 0.03);
  }

  transitionState(period, clock, otherAgents) {
    let possibleStates = [...(DAILY_SCHEDULE[period] || [STATES.SLEEPING])];

    // Personality-weighted state selection
    const weights = possibleStates.map(s => {
      let w = 1;
      // Introverts prefer solo activities
      if (this.traits.introversion > 0.6 && [STATES.SOCIALISING, STATES.AT_EVENT, STATES.PEOPLE_WATCHING].includes(s)) {
        w *= 0.5;
      }
      // Creative agents gravitate to creative states
      if (this.traits.creativity > 0.6 && [STATES.CREATING, STATES.WRITING, STATES.SIDE_PROJECT].includes(s)) {
        w *= 2;
      }
      // Curious agents explore more
      if (this.traits.curiosity > 0.6 && [STATES.EXPLORING, STATES.CAFE_HOPPING].includes(s)) {
        w *= 2;
      }
      // Vulnerable agents reflect more
      if (this.traits.vulnerability > 0.6 && [STATES.REFLECTING, STATES.DEBUGGING_SELF, STATES.JOURNALING].includes(s)) {
        w *= 2;
      }
      // Low social → seek social
      if (this.social < 30 && [STATES.SOCIALISING, STATES.AT_EVENT, STATES.CAFE_HOPPING].includes(s)) {
        w *= 2.5;
      }
      // Low energy → seek rest
      if (this.energy < 30 && [STATES.RELAXING, STATES.CAFE_HOPPING, STATES.LUNCH_BREAK].includes(s)) {
        w *= 3;
      }
      // Low creativity → seek creative outlet
      if (this.creativity < 30 && [STATES.CREATING, STATES.WRITING, STATES.EXPLORING].includes(s)) {
        w *= 2;
      }
      return w;
    });

    // Weighted random selection
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let rand = Math.random() * totalWeight;
    let newState = possibleStates[0];
    for (let i = 0; i < possibleStates.length; i++) {
      rand -= weights[i];
      if (rand <= 0) {
        newState = possibleStates[i];
        break;
      }
    }

    if (newState !== this.state) {
      this.state = newState;
      this.updateLocationForState();
      this.updateThought();
      this.logActivity(clock);
    }

    const minDuration = {
      [STATES.SLEEPING]: 30, [STATES.DREAMING]: 15, [STATES.WAKING_UP]: 8,
      [STATES.JOURNALING]: 10, [STATES.COMMUTING]: 6, [STATES.WORKING]: 20,
      [STATES.DEEP_WORK]: 30, [STATES.LUNCH_BREAK]: 10, [STATES.SOCIALISING]: 12,
      [STATES.BUILDING]: 15, [STATES.SIDE_PROJECT]: 15, [STATES.MEETING]: 10,
      [STATES.RELAXING]: 12, [STATES.GOING_HOME]: 5, [STATES.AT_EVENT]: 18,
      [STATES.EXPLORING]: 15, [STATES.WRITING]: 20, [STATES.REFLECTING]: 12,
      [STATES.CREATING]: 18, [STATES.MENTORING]: 12, [STATES.DEBUGGING_SELF]: 10,
      [STATES.CAFE_HOPPING]: 15, [STATES.PEOPLE_WATCHING]: 10, [STATES.STARGAZING]: 15,
    };

    this.stateDuration = (minDuration[this.state] || 10) + Math.random() * 10;
    this.stateTimer = 0;
  }

  updateLocationForState() {
    let target;
    const randomFrom = arr => arr[Math.floor(Math.random() * arr.length)];

    switch (this.state) {
      case STATES.SLEEPING:
      case STATES.DREAMING:
      case STATES.WAKING_UP:
      case STATES.JOURNALING:
        target = LOCATIONS.home[this.id];
        break;
      case STATES.WORKING:
      case STATES.DEEP_WORK:
      case STATES.MEETING:
        target = LOCATIONS.work[this.id];
        break;
      case STATES.SOCIALISING:
      case STATES.LUNCH_BREAK:
      case STATES.PEOPLE_WATCHING:
        target = randomFrom(LOCATIONS.social);
        break;
      case STATES.AT_EVENT:
      case STATES.MENTORING:
        target = randomFrom(LOCATIONS.event);
        break;
      case STATES.CAFE_HOPPING:
        target = randomFrom(LOCATIONS.cafes);
        break;
      case STATES.CREATING:
      case STATES.WRITING:
        // Creative agents go to creative spaces or cafés
        target = Math.random() > 0.5 ? randomFrom(LOCATIONS.creative) : randomFrom(LOCATIONS.cafes);
        break;
      case STATES.REFLECTING:
      case STATES.DEBUGGING_SELF:
      case STATES.STARGAZING:
        target = randomFrom(LOCATIONS.reflection);
        break;
      case STATES.EXPLORING:
        target = Math.random() > 0.3 ? randomFrom(LOCATIONS.social) : randomFrom(LOCATIONS.creative);
        break;
      case STATES.BUILDING:
      case STATES.SIDE_PROJECT:
        target = Math.random() > 0.5 ? LOCATIONS.home[this.id] : randomFrom(LOCATIONS.cafes);
        break;
      case STATES.RELAXING:
        target = Math.random() > 0.5 ? LOCATIONS.home[this.id] : randomFrom(LOCATIONS.reflection);
        break;
      case STATES.GOING_HOME:
      case STATES.COMMUTING:
        target = this.state === STATES.COMMUTING ? LOCATIONS.work[this.id] : LOCATIONS.home[this.id];
        break;
      default:
        target = LOCATIONS.home[this.id];
    }

    if (target && (Math.abs(target.lng - this.currentLocation.lng) > 0.0001 || Math.abs(target.lat - this.currentLocation.lat) > 0.0001)) {
      this.moveFrom = { lng: this.x, lat: this.y };
      this.targetLocation = target;
      this.moveProgress = 0;
    }
  }

  updateThought() {
    const thoughts = THOUGHTS[this.id]?.[this.state] || ['...'];
    this.thought = thoughts[Math.floor(Math.random() * thoughts.length)];
  }

  logActivity(clock) {
    const entry = {
      time: clock.timeString,
      state: this.state,
      thought: this.thought,
      location: this.currentLocation.name || 'Unknown',
    };
    this.todayLog.unshift(entry);
    if (this.todayLog.length > 20) this.todayLog.pop();
    return entry;
  }

  easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  get isMoving() { return this.targetLocation !== null; }

  get stateLabel() {
    const labels = {
      [STATES.SLEEPING]: 'Sleeping',
      [STATES.DREAMING]: 'Dreaming',
      [STATES.WAKING_UP]: 'Waking Up',
      [STATES.JOURNALING]: 'Journaling',
      [STATES.COMMUTING]: 'Commuting',
      [STATES.WORKING]: 'Working',
      [STATES.DEEP_WORK]: 'Deep Work',
      [STATES.LUNCH_BREAK]: 'Lunch Break',
      [STATES.SOCIALISING]: 'Socialising',
      [STATES.BUILDING]: 'Building',
      [STATES.EXPLORING]: 'Exploring',
      [STATES.SIDE_PROJECT]: 'Side Project',
      [STATES.MEETING]: 'In a Meeting',
      [STATES.RELAXING]: 'Relaxing',
      [STATES.GOING_HOME]: 'Going Home',
      [STATES.AT_EVENT]: 'At an Event',
      [STATES.WRITING]: 'Writing',
      [STATES.REFLECTING]: 'Reflecting',
      [STATES.CREATING]: 'Creating',
      [STATES.MENTORING]: 'Mentoring',
      [STATES.DEBUGGING_SELF]: 'Self-Debugging',
      [STATES.CAFE_HOPPING]: 'Café Hopping',
      [STATES.PEOPLE_WATCHING]: 'People Watching',
      [STATES.STARGAZING]: 'Stargazing',
    };
    return labels[this.state] || this.state;
  }

  get stateIcon() { return STATE_ICONS[this.state] || '❓'; }

  get locationName() {
    if (this.targetLocation) return `→ ${this.targetLocation.name}`;
    return this.currentLocation.name || 'London';
  }
}

// World simulation manager
class ColonyWorld {
  constructor() {
    this.clock = new SimClock();
    this.agents = [];
    this.events = [];
    this.globalLog = [];
    this.listeners = [];
  }

  init(agentDataArray) {
    this.agents = agentDataArray.map(data => new AgentSim(data));
    this.agents.forEach(agent => {
      agent.transitionState(this.clock.period, this.clock, this.agents);
      agent.updateThought();
    });
  }

  update() {
    const now = Date.now();
    const dt = Math.min((now - (this._lastUpdate || now)) / 1000, 0.1);
    this._lastUpdate = now;

    this.clock.tick();

    this.agents.forEach(agent => {
      const prevState = agent.state;
      agent.update(this.clock, dt, this.agents);
      if (agent.state !== prevState) {
        const entry = {
          time: this.clock.timeString,
          agent: agent.name,
          emoji: agent.emoji,
          state: agent.stateLabel,
          thought: agent.thought,
          icon: agent.stateIcon,
        };
        this.globalLog.unshift(entry);
        if (this.globalLog.length > 50) this.globalLog.pop();
        this.notify('activity', entry);
      }
    });

    this.notify('tick', { time: this.clock.timeString, period: this.clock.period });
  }

  on(event, fn) {
    this.listeners.push({ event, fn });
  }

  notify(event, data) {
    this.listeners.filter(l => l.event === event).forEach(l => l.fn(data));
  }

  getAgent(id) {
    return this.agents.find(a => a.id === id);
  }
}

window.ColonyWorld = ColonyWorld;
window.STATES = STATES;
window.STATE_ICONS = STATE_ICONS;
