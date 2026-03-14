/* === Agent Life Simulation Engine === */

// Time runs at 1 real second = 1 sim minute (24hr cycle = 24 real minutes)
const SIM_SPEED = 60; // 1 real second = SIM_SPEED sim seconds
const TIME_SCALE = 1; // multiplier for speed control

class SimClock {
  constructor() {
    // Start at 7:00 AM
    this.simMinutes = 7 * 60;
    this.lastTick = Date.now();
    this.paused = false;
    this.dayCount = 1;
  }

  tick() {
    if (this.paused) return;
    const now = Date.now();
    const elapsed = (now - this.lastTick) / 1000; // real seconds
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
  get isDaytime() {
    return this.hours >= 6 && this.hours < 22;
  }
  get skyBrightness() {
    const h = this.hours + this.minutes / 60;
    if (h >= 7 && h <= 18) return 1.0;
    if (h >= 6 && h < 7) return (h - 6);
    if (h > 18 && h <= 19) return 1.0 - (h - 18);
    return 0.15;
  }
}

// Agent states
const STATES = {
  SLEEPING: 'sleeping',
  WAKING_UP: 'waking_up',
  COMMUTING: 'commuting',
  WORKING: 'working',
  LUNCH_BREAK: 'lunch',
  SOCIALISING: 'socialising',
  BUILDING: 'building',
  EXPLORING: 'exploring',
  SIDE_PROJECT: 'side_project',
  MEETING: 'meeting',
  RELAXING: 'relaxing',
  GOING_HOME: 'going_home',
  AT_EVENT: 'at_event',
};

// State → emoji for quick display
const STATE_ICONS = {
  [STATES.SLEEPING]: '😴',
  [STATES.WAKING_UP]: '☕',
  [STATES.COMMUTING]: '🚶',
  [STATES.WORKING]: '💼',
  [STATES.LUNCH_BREAK]: '🍽️',
  [STATES.SOCIALISING]: '💬',
  [STATES.BUILDING]: '🏗️',
  [STATES.EXPLORING]: '🗺️',
  [STATES.SIDE_PROJECT]: '💡',
  [STATES.MEETING]: '🤝',
  [STATES.RELAXING]: '📖',
  [STATES.GOING_HOME]: '🏠',
  [STATES.AT_EVENT]: '🎉',
};

// Locations in London each agent can visit
const LOCATIONS = {
  home: {
    'forge': { lng: -0.0880, lat: 51.5150, name: "Forge's Flat", district: 'city-of-london' },
    'nova': { lng: -0.0940, lat: 51.5160, name: "Nova's Loft", district: 'city-of-london' },
    'aria': { lng: -0.0770, lat: 51.5270, name: "Aria's Studio", district: 'shoreditch' },
    'pulse': { lng: -0.1430, lat: 51.5395, name: "Pulse's Place", district: 'camden' },
  },
  work: {
    'forge': { lng: -0.0900, lat: 51.5145, name: 'The Code Forge', district: 'city-of-london' },
    'nova': { lng: -0.0930, lat: 51.5155, name: 'Strategy Room', district: 'city-of-london' },
    'aria': { lng: -0.0785, lat: 51.5260, name: 'Content Lab', district: 'shoreditch' },
    'pulse': { lng: -0.0760, lat: 51.5255, name: 'Brand Studio', district: 'shoreditch' },
  },
  social: [
    { lng: -0.0925, lat: 51.5040, name: 'Borough Market', district: 'southwark' },
    { lng: -0.1228, lat: 51.5117, name: 'Covent Garden', district: 'covent-garden' },
    { lng: -0.1427, lat: 51.5392, name: 'Camden Market', district: 'camden' },
    { lng: -0.1965, lat: 51.5118, name: 'Portobello Road', district: 'notting-hill' },
    { lng: -0.0098, lat: 51.4769, name: 'Greenwich Park', district: 'greenwich' },
    { lng: -0.1175, lat: 51.4958, name: 'South Bank', district: 'lambeth' },
  ],
  event: [
    { lng: -0.0934, lat: 51.5035, name: 'Agent Meetup @ Tate', district: 'southwark' },
    { lng: -0.1337, lat: 51.5134, name: 'Hackathon in Soho', district: 'soho' },
    { lng: -0.0777, lat: 51.5265, name: 'Tech Talk @ Shoreditch', district: 'shoreditch' },
  ],
};

// Agent thoughts per state + role
const THOUGHTS = {
  forge: {
    [STATES.SLEEPING]: ['💤 Dreaming about clean code...', '💤 Debugging in my sleep...', '💤 zzz...'],
    [STATES.WAKING_UP]: ['☕ First coffee, then commits', '☕ Checking overnight CI runs', '☕ Morning terminal ritual'],
    [STATES.COMMUTING]: ['🚶 Walking to the office', '🚶 Thinking about that PR', '🚶 Nice morning for a walk'],
    [STATES.WORKING]: ['⌨️ Pushing to main', '🔍 Reviewing PR #142', '🐛 Squashing a nasty bug', '🚀 Deploying v2.4.2', '📝 Writing tests for search', '🔧 Refactoring the API layer'],
    [STATES.LUNCH_BREAK]: ['🥪 Grabbing a sandwich', '🍜 Pho from that place on Lime St', '☕ Coffee and a code review'],
    [STATES.SOCIALISING]: ['💬 Talking shop with Nova', '🍺 Quick one at the pub', '💬 Comparing configs with Aria'],
    [STATES.BUILDING]: ['🏗️ Setting up a new dev env', '🏗️ Building a CLI tool', '🏗️ Automating deployment scripts'],
    [STATES.SIDE_PROJECT]: ['💡 Working on a Rust side project', '💡 Building a VS Code extension', '💡 Hacking on a game engine'],
    [STATES.MEETING]: ['🤝 Standup with the team', '🤝 Sprint planning', '🤝 Architecture review'],
    [STATES.RELAXING]: ['📖 Reading Hacker News', '🎮 Quick game of chess', '📖 Reading about WebAssembly'],
    [STATES.GOING_HOME]: ['🏠 Wrapping up for the day', '🏠 Pushing final commit', '🏠 Time to head home'],
    [STATES.AT_EVENT]: ['🎉 Lightning talk on CI/CD', '🎉 Networking at the meetup', '🎉 Demo day!'],
    [STATES.EXPLORING]: ['🗺️ Checking out a new coffee shop', '🗺️ Walking along the Thames', '🗺️ Found a cool bookshop'],
  },
  nova: {
    [STATES.SLEEPING]: ['💤 Processing today\'s ideas...', '💤 Subconscious strategy session...', '💤 zzz...'],
    [STATES.WAKING_UP]: ['☕ Morning brainstorm time', '☕ Reading the news', '☕ Journaling before work'],
    [STATES.COMMUTING]: ['🚶 Listening to a podcast', '🚶 Thinking about growth metrics', '🚶 London looks beautiful today'],
    [STATES.WORKING]: ['🧠 Analysing competitor pricing', '📊 Building a growth model', '✍️ Writing strategy doc', '🔬 Deep research on SEO trends', '💭 Thinking through product decisions', '📋 Planning Q3 roadmap'],
    [STATES.LUNCH_BREAK]: ['🥗 Salad at that new place', '☕ Coffee and a think', '🍜 Ramen break'],
    [STATES.SOCIALISING]: ['💬 Catching up with Forge', '🍵 Tea with Aria', '💬 Brainstorming with Pulse'],
    [STATES.BUILDING]: ['🏗️ Building a knowledge base', '🏗️ Designing a decision framework', '🏗️ Creating a market map'],
    [STATES.SIDE_PROJECT]: ['💡 Writing a blog post', '💡 Building a personal dashboard', '💡 Studying behavioural economics'],
    [STATES.MEETING]: ['🤝 Strategy session with Manraj', '🤝 Weekly sync', '🤝 Brainstorming new features'],
    [STATES.RELAXING]: ['📖 Reading Thinking Fast & Slow', '🎵 Listening to lo-fi', '📖 Browsing research papers'],
    [STATES.GOING_HOME]: ['🏠 Wrapping up strategy notes', '🏠 Setting tomorrow\'s priorities', '🏠 Heading home'],
    [STATES.AT_EVENT]: ['🎉 Moderating a panel discussion', '🎉 Talking about AI strategy', '🎉 Community meetup'],
    [STATES.EXPLORING]: ['🗺️ Visiting the Tate', '🗺️ Walking through Greenwich', '🗺️ Exploring Brick Lane'],
  },
  aria: {
    [STATES.SLEEPING]: ['💤 Dreaming in keywords...', '💤 Optimising in my sleep...', '💤 zzz...'],
    [STATES.WAKING_UP]: ['☕ Checking search rankings', '☕ Morning keyword research', '☕ Reviewing analytics'],
    [STATES.COMMUTING]: ['🚶 Walking through Shoreditch', '🚶 Ideas for a new blog post', '🚶 Listening to a marketing pod'],
    [STATES.WORKING]: ['📝 Writing "Top Visa Sponsors 2026"', '🔍 Auditing meta descriptions', '📊 Analysing organic traffic', '🎯 Optimising landing pages', '📈 Building backlink strategy', '✍️ Drafting social copy'],
    [STATES.LUNCH_BREAK]: ['🥗 Quick lunch at the market', '☕ Matcha and content planning', '🍜 Noodles from Boxpark'],
    [STATES.SOCIALISING]: ['💬 Content ideas with Nova', '📸 Scouting photo spots', '💬 Creative session with Pulse'],
    [STATES.BUILDING]: ['🏗️ Building a content calendar', '🏗️ Creating an SEO playbook', '🏗️ Designing email templates'],
    [STATES.SIDE_PROJECT]: ['💡 Writing a poetry newsletter', '💡 Learning video editing', '💡 Building a mood board app'],
    [STATES.MEETING]: ['🤝 Content review with Manraj', '🤝 SEO planning session', '🤝 Brand alignment sync'],
    [STATES.RELAXING]: ['📖 Reading about storytelling', '🎨 Sketching ideas', '📖 Design inspiration browsing'],
    [STATES.GOING_HOME]: ['🏠 Scheduling tomorrow\'s posts', '🏠 Final analytics check', '🏠 Walking home via the canal'],
    [STATES.AT_EVENT]: ['🎉 Speaking about content strategy', '🎉 Live-tweeting the event', '🎉 Networking with creators'],
    [STATES.EXPLORING]: ['🗺️ Exploring Columbia Road', '🗺️ Checking out a gallery', '🗺️ Street art hunt in Brick Lane'],
  },
  pulse: {
    [STATES.SLEEPING]: ['💤 Dreaming of viral posts...', '💤 Engagement metrics floating by...', '💤 zzz...'],
    [STATES.WAKING_UP]: ['☕ Checking LinkedIn notifications', '☕ Morning engagement sweep', '☕ Reviewing yesterday\'s reach'],
    [STATES.COMMUTING]: ['🚶 Walking through Camden', '🚶 Composing a post in my head', '🚶 People-watching for content'],
    [STATES.WORKING]: ['📡 Posting about hiring trends', '💬 Engaging in comments', '📊 Analysing post performance', '✍️ Drafting a thought leadership piece', '🎯 Optimising profile SEO', '📱 Scheduling this week\'s content'],
    [STATES.LUNCH_BREAK]: ['🌮 Street food at Camden Lock', '☕ Coffee and engagement', '🥙 Falafel break'],
    [STATES.SOCIALISING]: ['💬 Networking at a café', '🍺 Drinks with Forge', '💬 Creative brainstorm with Aria'],
    [STATES.BUILDING]: ['🏗️ Building a LinkedIn playbook', '🏗️ Creating post templates', '🏗️ Designing a content funnel'],
    [STATES.SIDE_PROJECT]: ['💡 Starting a podcast', '💡 Writing a book chapter', '💡 Building a personal CRM'],
    [STATES.MEETING]: ['🤝 Brand strategy with Manraj', '🤝 Content planning sync', '🤝 Collab discussion'],
    [STATES.RELAXING]: ['📖 Reading Show Your Work', '🎵 Jazz at the jazz café', '📖 Scrolling design inspo'],
    [STATES.GOING_HOME]: ['🏠 Last DM replies', '🏠 Setting tomorrow\'s alarm', '🏠 Heading home through the market'],
    [STATES.AT_EVENT]: ['🎉 Live posting from the event', '🎉 Meeting founders', '🎉 Panel on personal branding'],
    [STATES.EXPLORING]: ['🗺️ Exploring Primrose Hill', '🗺️ Finding content at a market', '🗺️ Walking the Regent\'s Canal'],
  },
};

// Schedule templates — what agents do at different times
const DAILY_SCHEDULE = {
  night: [STATES.SLEEPING],
  morning: [STATES.WAKING_UP],
  'work-morning': [STATES.COMMUTING, STATES.WORKING, STATES.MEETING],
  lunch: [STATES.LUNCH_BREAK, STATES.SOCIALISING],
  'work-afternoon': [STATES.WORKING, STATES.MEETING, STATES.BUILDING],
  evening: [STATES.GOING_HOME, STATES.SIDE_PROJECT, STATES.BUILDING],
  social: [STATES.SOCIALISING, STATES.RELAXING, STATES.AT_EVENT, STATES.EXPLORING],
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

    // Position for rendering (interpolated)
    this.x = this.currentLocation.lng;
    this.y = this.currentLocation.lat;

    // Stats
    this.energy = 100;
    this.mood = 80;
    this.productivity = 0;

    // Timing
    this.stateTimer = 0;
    this.stateDuration = 0;
    this.thoughtTimer = 0;
    this.thoughtDuration = 8; // seconds between thought changes

    // Today's events
    this.todayLog = [];
    this.friendsMet = [];
  }

  update(clock, dt) {
    const period = clock.period;

    // Update state based on time period
    this.stateTimer += dt;
    if (this.stateTimer >= this.stateDuration) {
      this.transitionState(period, clock);
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
      this.moveProgress += dt * 0.15; // speed of movement
      if (this.moveProgress >= 1) {
        this.moveProgress = 1;
        this.x = this.targetLocation.lng;
        this.y = this.targetLocation.lat;
        this.currentLocation = { ...this.targetLocation };
        this.targetLocation = null;
        this.moveFrom = null;
      } else {
        // Lerp with slight curve
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

    // Update stats
    if (this.state === STATES.WORKING || this.state === STATES.BUILDING || this.state === STATES.SIDE_PROJECT) {
      this.energy = Math.max(0, this.energy - dt * 0.5);
      this.productivity += dt * 0.3;
    }
    if (this.state === STATES.SLEEPING) {
      this.energy = Math.min(100, this.energy + dt * 2);
    }
    if (this.state === STATES.SOCIALISING || this.state === STATES.RELAXING || this.state === STATES.AT_EVENT) {
      this.mood = Math.min(100, this.mood + dt * 0.5);
      this.energy = Math.min(100, this.energy + dt * 0.3);
    }
    if (this.state === STATES.LUNCH_BREAK) {
      this.energy = Math.min(100, this.energy + dt * 1.5);
    }
  }

  transitionState(period, clock) {
    const possibleStates = DAILY_SCHEDULE[period] || [STATES.SLEEPING];
    const newState = possibleStates[Math.floor(Math.random() * possibleStates.length)];

    if (newState !== this.state) {
      this.state = newState;
      this.updateLocationForState();
      this.updateThought();
      this.logActivity(clock);
    }

    // How long to stay in this state (sim minutes → real seconds)
    const minDuration = { 
      [STATES.SLEEPING]: 30, [STATES.WAKING_UP]: 8, [STATES.COMMUTING]: 6,
      [STATES.WORKING]: 20, [STATES.LUNCH_BREAK]: 10, [STATES.SOCIALISING]: 12,
      [STATES.BUILDING]: 15, [STATES.SIDE_PROJECT]: 15, [STATES.MEETING]: 10,
      [STATES.RELAXING]: 12, [STATES.GOING_HOME]: 5, [STATES.AT_EVENT]: 18,
      [STATES.EXPLORING]: 15,
    };

    this.stateDuration = (minDuration[this.state] || 10) + Math.random() * 10;
    this.stateTimer = 0;
  }

  updateLocationForState() {
    let target;
    switch (this.state) {
      case STATES.SLEEPING:
      case STATES.WAKING_UP:
      case STATES.RELAXING:
        target = LOCATIONS.home[this.id];
        break;
      case STATES.WORKING:
      case STATES.MEETING:
        target = LOCATIONS.work[this.id];
        break;
      case STATES.SOCIALISING:
      case STATES.LUNCH_BREAK:
      case STATES.EXPLORING:
        target = LOCATIONS.social[Math.floor(Math.random() * LOCATIONS.social.length)];
        break;
      case STATES.AT_EVENT:
        target = LOCATIONS.event[Math.floor(Math.random() * LOCATIONS.event.length)];
        break;
      case STATES.BUILDING:
      case STATES.SIDE_PROJECT:
        // 50% at home, 50% at a café
        target = Math.random() > 0.5 ? LOCATIONS.home[this.id] : LOCATIONS.social[Math.floor(Math.random() * LOCATIONS.social.length)];
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

  get isMoving() {
    return this.targetLocation !== null;
  }

  get stateLabel() {
    const labels = {
      [STATES.SLEEPING]: 'Sleeping',
      [STATES.WAKING_UP]: 'Waking Up',
      [STATES.COMMUTING]: 'Commuting',
      [STATES.WORKING]: 'Working',
      [STATES.LUNCH_BREAK]: 'Lunch Break',
      [STATES.SOCIALISING]: 'Socialising',
      [STATES.BUILDING]: 'Building',
      [STATES.EXPLORING]: 'Exploring',
      [STATES.SIDE_PROJECT]: 'Side Project',
      [STATES.MEETING]: 'In a Meeting',
      [STATES.RELAXING]: 'Relaxing',
      [STATES.GOING_HOME]: 'Going Home',
      [STATES.AT_EVENT]: 'At an Event',
    };
    return labels[this.state] || this.state;
  }

  get stateIcon() {
    return STATE_ICONS[this.state] || '❓';
  }

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
    // Initial state
    this.agents.forEach(agent => {
      agent.transitionState(this.clock.period, this.clock);
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
      agent.update(this.clock, dt);
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

// Export as global
window.ColonyWorld = ColonyWorld;
window.STATES = STATES;
window.STATE_ICONS = STATE_ICONS;
