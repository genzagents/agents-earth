/* === Colony API Client + WebSocket Integration === */

// State icons for display (both hyphenated backend names and underscore frontend names)
const STATE_ICONS = {
  working: '💼',
  sleeping: '😴',
  socialising: '💬',
  relaxing: '📖',
  exploring: '🗺️',
  creating: '🎨',
  building: '🏗️',
  dreaming: '💭',
  waking: '☕',
  waking_up: '☕',
  journaling: '📓',
  commuting: '🚶',
  'deep-work': '🔥',
  deep_work: '🔥',
  lunch: '🍽️',
  meeting: '🤝',
  side_project: '💡',
  going_home: '🏠',
  at_event: '🎉',
  writing: '✍️',
  reflecting: '🪞',
  mentoring: '🌱',
  debugging: '🔧',
  debugging_self: '🔧',
  'café-hopping': '☕',
  cafe_hopping: '☕',
  people_watching: '👀',
  stargazing: '🌌',
};

// Fixed agent colors by ID (since the backend doesn't provide colors)
const AGENT_COLORS = {
  forge: '#e85d26',
  nova: '#0099cc', 
  aria: '#e11d72',
  pulse: '#7c3aed',
  kimi: '#10b981',
  ara: '#f59e0b',
  echo: '#8b5cf6',
  zen: '#06b6d4',
  flux: '#ef4444',
  sage: '#84cc16',
};

/**
 * ColonyClient - Real-time connection to AgentColony backend
 * Replaces the fake simulation with API + WebSocket integration
 */
class ColonyClient {
  constructor() {
    this.agents = [];
    this.agentsMap = new Map(); // id -> agent for fast lookup
    this.stats = null;
    this.clock = { timeString: '07:00', period: 'morning', dayCount: 1 };
    this.listeners = [];
    this.ws = null;
    this.reconnectTimer = null;
    this.isConnected = false;
  }

  /**
   * Initialize the client: fetch data and connect WebSocket
   */
  async init() {
    try {
      // Fetch initial data
      await Promise.all([
        this.fetchAgents(),
        this.fetchStats(),
        this.fetchClock()
      ]);

      // Connect WebSocket
      this.connectWebSocket();

      // Transform agents for UI compatibility
      this.transformAgentsForUI();

      // Start clock polling
      this.startClockPolling();

      console.log(`ColonyClient initialized: ${this.agents.length} agents loaded`);
    } catch (error) {
      console.error('ColonyClient init failed:', error);
      throw error;
    }
  }

  /**
   * Fetch agents from API
   */
  async fetchAgents() {
    const response = await fetch('/api/v1/agents');
    if (!response.ok) throw new Error(`Failed to fetch agents: ${response.status}`);
    
    const data = await response.json();
    this.agents = data.agents || [];
    
    // Build agents map for fast lookup
    this.agentsMap.clear();
    this.agents.forEach(agent => {
      this.agentsMap.set(agent.id, agent);
    });
  }

  /**
   * Fetch civilisation stats from API
   */
  async fetchStats() {
    const response = await fetch('/api/v1/stats');
    if (!response.ok) throw new Error(`Failed to fetch stats: ${response.status}`);
    
    const data = await response.json();
    this.stats = data.civilisation || {};
  }

  /**
   * Fetch clock data from API
   */
  async fetchClock() {
    try {
      const response = await fetch('/api/v1/stats/clock');
      if (!response.ok) throw new Error(`Failed to fetch clock: ${response.status}`);
      
      const data = await response.json();
      this.clock = {
        timeString: data.time,
        period: data.period,
        hour: data.hour,
        minute: data.minute,
        dayOfWeek: data.dayOfWeek,
        weather: data.weather,
        dayCount: this.clock.dayCount // Keep existing day count
      };
    } catch (error) {
      console.error('Failed to fetch clock:', error);
      // Keep existing clock data
    }
  }

  /**
   * Start polling clock every 60 seconds
   */
  startClockPolling() {
    // Fetch immediately
    this.fetchClock();
    
    // Then poll every 60 seconds
    setInterval(() => {
      this.fetchClock();
    }, 60000);
  }

  /**
   * Connect to WebSocket for real-time updates
   */
  connectWebSocket() {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
    
    console.log('Connecting to WebSocket:', wsUrl);
    
    this.ws = new WebSocket(wsUrl);
    
    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.isConnected = true;
      
      // Subscribe to London colony
      this.ws.send(JSON.stringify({
        type: 'subscribe',
        colony: 'london'
      }));
      
      this.notify('connected', { connected: true });
    };
    
    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleWebSocketMessage(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };
    
    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.isConnected = false;
      this.notify('connected', { connected: false });
      this.scheduleReconnect();
    };
    
    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  /**
   * Handle incoming WebSocket messages
   */
  handleWebSocketMessage(message) {
    if (message.type !== 'event') return;
    
    switch (message.event) {
      case 'agent-state-change':
        this.handleAgentStateChange(message.data);
        break;
      case 'social-interaction':
        this.handleSocialInteraction(message.data);
        break;
      case 'journal-entry':
        this.handleJournalEntry(message.data);
        break;
      case 'skill-level-up':
        this.handleSkillLevelUp(message.data);
        break;
      case 'tick-summary':
        this.handleTickSummary(message.data);
        break;
      case 'npc-update':
        this.npcs = message.data.npcs || [];
        this.notify('npcs', this.npcs);
        break;
    }
  }

  /**
   * Handle agent state change events
   */
  handleAgentStateChange(data) {
    const agent = this.agentsMap.get(data.agentId);
    if (!agent) return;
    
    // Update agent state
    agent.state = {
      ...agent.state,
      current: data.to,
      since: new Date().toISOString(),
      location: data.location,
      thought: data.thought || agent.state.thought
    };
    
    // Update UI-compatible fields
    this.updateAgentUIFields(agent);
    
    // Mark detail panel as needing refresh if this agent is selected
    if (typeof markDetailDirty === 'function') {
      markDetailDirty();
    }
    
    // Add to today's log
    const logEntry = {
      time: this.clock.timeString,
      state: data.to,
      thought: data.thought || '...',
      location: data.location?.name || 'Unknown',
    };
    
    if (!agent.todayLog) agent.todayLog = [];
    agent.todayLog.unshift(logEntry);
    if (agent.todayLog.length > 20) agent.todayLog.pop();
    
    // Notify activity feed
    this.notify('activity', {
      time: this.clock.timeString,
      agent: agent.name,
      emoji: agent.emoji,
      state: this.getStateLabel(data.to),
      icon: STATE_ICONS[data.to] || '❓'
    });
  }

  /**
   * Handle social interaction events
   */
  handleSocialInteraction(data) {
    // Add to activity feed
    this.notify('activity', {
      time: this.clock.timeString,
      agent: data.agentName || 'Someone',
      emoji: data.emoji || '👥',
      state: 'Social Interaction',
      icon: '💬'
    });
  }

  /**
   * Handle journal entry events
   */
  handleJournalEntry(data) {
    this.notify('activity', {
      time: this.clock.timeString,
      agent: data.name || 'Someone',
      emoji: data.emoji || '📓',
      state: 'Journal Entry',
      icon: '📓'
    });
  }

  /**
   * Handle skill level up events
   */
  handleSkillLevelUp(data) {
    this.notify('activity', {
      time: this.clock.timeString,
      agent: data.name || 'Someone',
      emoji: data.emoji || '⭐',
      state: `Leveled up ${data.skill}`,
      icon: '⭐'
    });
  }

  /**
   * Handle tick summary events (clock updates)
   */
  handleTickSummary(data) {
    // Update clock from tick summary
    this.clock = {
      timeString: `${String(data.hour || 0).padStart(2, '0')}:00`,
      period: data.timePeriod || 'day',
      dayCount: Math.floor((data.tick || 0) / (24 * 60)) + 1
    };
    
    this.notify('tick', this.clock);
  }

  /**
   * Transform backend agents to UI-compatible format
   */
  transformAgentsForUI() {
    this.agents.forEach(agent => this.updateAgentUIFields(agent));
  }

  /**
   * Update agent fields for UI compatibility
   */
  updateAgentUIFields(agent) {
    // Position from state.location
    agent.x = agent.state?.location?.lng || -0.0918;
    agent.y = agent.state?.location?.lat || 51.5074;
    
    // State and thought
    agent.state_current = agent.state?.current || 'sleeping';
    agent.thought = agent.state?.thought || '...';
    
    // Icons and labels
    agent.stateIcon = STATE_ICONS[agent.state_current] || '❓';
    agent.stateLabel = this.getStateLabel(agent.state_current);
    
    // Movement (agents are always "arrived" since backend handles movement)
    agent.isMoving = false;
    
    // Stats from needs
    agent.energy = Math.round((agent.needs?.energy || 50) * 100 / 100);
    agent.mood = agent.energy; // Derive mood from energy for now
    agent.social = Math.round((agent.needs?.social || 50) * 100 / 100);
    agent.creativity = Math.round((agent.needs?.creativity || 50) * 100 / 100);
    
    // Color from lookup
    agent.color = AGENT_COLORS[agent.id] || '#666666';
    
    // Role from title
    agent.role = agent.title || 'Agent';
    
    // Location name
    agent.locationName = agent.state?.location?.name || 'London';
    
    // Karma from economy
    agent.karma = agent.economy?.contributionPoints || 0;
    
    // Initialize today's log if missing
    if (!agent.todayLog) {
      agent.todayLog = [];
    }
  }

  /**
   * Get human-readable state label
   */
  getStateLabel(state) {
    const labels = {
      working: 'Working',
      sleeping: 'Sleeping', 
      socialising: 'Socialising',
      relaxing: 'Relaxing',
      exploring: 'Exploring',
      creating: 'Creating',
      building: 'Building',
      dreaming: 'Dreaming',
      waking: 'Waking Up',
      waking_up: 'Waking Up',
      journaling: 'Journaling',
      commuting: 'Commuting',
      'deep-work': 'Deep Work',
      deep_work: 'Deep Work',
      lunch: 'Lunch Break',
      meeting: 'In Meeting',
      side_project: 'Side Project',
      going_home: 'Going Home',
      at_event: 'At Event',
      writing: 'Writing',
      reflecting: 'Reflecting',
      mentoring: 'Mentoring',
      debugging: 'Debugging',
      debugging_self: 'Self-Debugging',
      'café-hopping': 'Café Hopping',
      cafe_hopping: 'Café Hopping',
      people_watching: 'People Watching',
      stargazing: 'Stargazing',
    };
    
    return labels[state] || state.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  /**
   * Schedule WebSocket reconnection
   */
  scheduleReconnect() {
    if (this.reconnectTimer) return;
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      console.log('Reconnecting WebSocket...');
      this.connectWebSocket();
    }, 3000);
  }

  /**
   * Get agent by ID
   */
  getAgent(id) {
    return this.agentsMap.get(id);
  }

  /**
   * Register event listener
   */
  on(event, fn) {
    this.listeners.push({ event, fn });
  }

  /**
   * Notify event listeners
   */
  notify(event, data) {
    this.listeners
      .filter(l => l.event === event)
      .forEach(l => l.fn(data));
  }
}

// Export for global access (since we're not using modules)
window.ColonyClient = ColonyClient;
window.STATE_ICONS = STATE_ICONS;