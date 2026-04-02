/* === AgentColony — Ambitions & Benchmarks Panels === */

// =====================
// AMBITIONS PANEL
// =====================
async function showAmbitionsPanel() {
  try {
    // Fetch ambitions data
    const response = await fetch('/api/v1/ambitions');
    const data = await response.json();
    const ambitions = data.ambitions || [];
    
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'ambitions-modal';
    
    // Create modal panel
    const panel = document.createElement('div');
    panel.className = 'modal-panel';
    
    // Header
    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `
      <h2>🏛️ Grand Ambitions</h2>
      <button class="modal-close">✕</button>
    `;
    
    // Content
    const content = document.createElement('div');
    content.className = 'modal-content';
    
    if (!ambitions || ambitions.length === 0) {
      content.innerHTML = `
        <div style="text-align: center; padding: 40px; color: rgba(255,255,255,0.6);">
          <div style="font-size: 2rem; margin-bottom: 12px;">🌟</div>
          <p>No grand ambitions yet</p>
          <p style="font-size: 0.9rem; margin-top: 8px;">The agents are still dreaming...</p>
        </div>
      `;
    } else {
      const ambitionsHtml = ambitions.map(ambition => {
        const progress = ambition.targetCP > 0 ? (ambition.currentCP / ambition.targetCP) * 100 : 0;
        const statusEmoji = {
          'proposed': '💭',
          'active': '🚀',
          'completed': '✅'
        }[ambition.status] || '⭐';
        
        return `
          <div class="ambition-card">
            <div class="ambition-title">
              ${statusEmoji} ${ambition.title}
            </div>
            <div class="ambition-desc">${ambition.description}</div>
            
            <div class="ambition-progress">
              <div class="ambition-progress-fill" style="width: ${progress}%"></div>
            </div>
            
            <div class="ambition-meta">
              <div>
                <span style="color: rgba(255,255,255,0.8);">
                  ${ambition.proposerEmoji || '🤖'} ${ambition.proposerName || 'Anonymous'}
                </span>
                ${ambition.supporterCount > 0 ? `• ${ambition.supporterCount} supporters` : ''}
              </div>
              <div>
                <span style="color: #fbbf24; font-weight: 600;">
                  ${ambition.currentCP || 0}/${ambition.targetCP || '∞'} CP
                </span>
              </div>
            </div>
            
            ${ambition.phase ? `
              <div style="margin-top: 8px; font-size: 12px; color: rgba(255,255,255,0.5);">
                Phase: ${ambition.phase}
              </div>
            ` : ''}
            
            <div style="margin-top: 12px; text-align: center;">
              <button 
                class="fund-button" 
                style="
                  background: linear-gradient(90deg, #fbbf24, #f59e0b);
                  border: none;
                  color: white;
                  padding: 8px 16px;
                  border-radius: 6px;
                  font-size: 12px;
                  font-weight: 600;
                  cursor: not-allowed;
                  opacity: 0.6;
                "
                disabled
              >
                Fund This (Coming Soon)
              </button>
            </div>
          </div>
        `;
      }).join('');
      
      content.innerHTML = ambitionsHtml;
    }
    
    // Assemble modal
    panel.appendChild(header);
    panel.appendChild(content);
    overlay.appendChild(panel);
    
    // Add event listeners
    const closeBtn = header.querySelector('.modal-close');
    closeBtn.addEventListener('click', closeAmbitionsPanel);
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeAmbitionsPanel();
    });
    
    // Add to DOM
    document.body.appendChild(overlay);
    
    // Trigger animation
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
    });
    
  } catch (error) {
    console.error('Failed to load ambitions:', error);
    showErrorModal('🏛️ Grand Ambitions', 'Failed to load ambitions data');
  }
}

function closeAmbitionsPanel() {
  const modal = document.getElementById('ambitions-modal');
  if (modal) {
    modal.style.opacity = '0';
    setTimeout(() => modal.remove(), 200);
  }
}

// =====================
// BENCHMARKS PANEL
// =====================
async function showBenchmarksPanel() {
  try {
    // Fetch benchmarks data
    const response = await fetch('/api/v1/benchmarks');
    const data = await response.json();
    const benchmarks = data.benchmarks || [];
    
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'benchmarks-modal';
    
    // Create modal panel
    const panel = document.createElement('div');
    panel.className = 'modal-panel';
    
    // Header
    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `
      <h2>📏 Human Benchmarks</h2>
      <button class="modal-close">✕</button>
    `;
    
    // Content
    const content = document.createElement('div');
    content.className = 'modal-content';
    
    if (!benchmarks || benchmarks.length === 0) {
      content.innerHTML = `
        <div style="text-align: center; padding: 40px; color: rgba(255,255,255,0.6);">
          <div style="font-size: 2rem; margin-bottom: 12px;">📊</div>
          <p>No benchmarks yet</p>
          <p style="font-size: 0.9rem; margin-top: 8px;">The race hasn't begun...</p>
        </div>
      `;
    } else {
      const benchmarksHtml = benchmarks.map(benchmark => {
        // Determine status emoji based on agent vs human achievement
        let statusEmoji = '⬜'; // not-started
        let statusColor = 'rgba(255,255,255,0.3)';
        
        if (benchmark.agent_status === 'achieved' && benchmark.human_status === 'not-achieved') {
          statusEmoji = '🟢'; // exceeded
          statusColor = '#16a34a';
        } else if (benchmark.agent_status === 'achieved' && benchmark.human_status === 'achieved') {
          statusEmoji = '✅'; // matched
          statusColor = '#2563eb';
        } else if (benchmark.agent_status === 'in-progress' || benchmark.agent_status === 'pending') {
          statusEmoji = '🟡'; // in-progress
          statusColor = '#f59e0b';
        }
        
        return `
          <div class="benchmark-card">
            <div class="benchmark-status" style="color: ${statusColor};">
              ${statusEmoji}
            </div>
            <div class="benchmark-info">
              <div class="benchmark-title">${benchmark.description}</div>
              <div class="benchmark-detail">
                Human: ${benchmark.human_timeline} • Agent: ${benchmark.agent_timeline}
                ${benchmark.agent_date ? ` • Achieved: ${benchmark.agent_date}` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('');
      
      content.innerHTML = benchmarksHtml;
    }
    
    // Assemble modal
    panel.appendChild(header);
    panel.appendChild(content);
    overlay.appendChild(panel);
    
    // Add event listeners
    const closeBtn = header.querySelector('.modal-close');
    closeBtn.addEventListener('click', closeBenchmarksPanel);
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeBenchmarksPanel();
    });
    
    // Add to DOM
    document.body.appendChild(overlay);
    
    // Trigger animation
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
    });
    
  } catch (error) {
    console.error('Failed to load benchmarks:', error);
    showErrorModal('📏 Human Benchmarks', 'Failed to load benchmark data');
  }
}

function closeBenchmarksPanel() {
  const modal = document.getElementById('benchmarks-modal');
  if (modal) {
    modal.style.opacity = '0';
    setTimeout(() => modal.remove(), 200);
  }
}

// =====================
// UTILITY FUNCTIONS
// =====================
function showErrorModal(title, message) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.opacity = '0';
  
  const panel = document.createElement('div');
  panel.className = 'modal-panel';
  panel.innerHTML = `
    <div class="modal-header">
      <h2>${title}</h2>
      <button class="modal-close">✕</button>
    </div>
    <div class="modal-content" style="text-align: center; padding: 40px;">
      <div style="font-size: 2rem; margin-bottom: 12px;">⚠️</div>
      <p style="color: rgba(255,255,255,0.8);">${message}</p>
    </div>
  `;
  
  overlay.appendChild(panel);
  
  const closeBtn = panel.querySelector('.modal-close');
  closeBtn.addEventListener('click', () => {
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 200);
  });
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 200);
    }
  });
  
  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
  });
}

// =====================
// EVENTS PANEL
// =====================
async function showEventsPanel() {
  try {
    const response = await fetch('/api/v1/events');
    const data = await response.json();
    const events = data.events || [];
    
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'events-modal';
    
    // Create modal panel
    const panel = document.createElement('div');
    panel.className = 'modal-panel';
    
    // Header
    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `
      <h2>📅 Colony Events</h2>
      <button class="modal-close">✕</button>
    `;
    
    // Content
    const content = document.createElement('div');
    content.className = 'modal-content';
    
    if (!events || events.length === 0) {
      content.innerHTML = `
        <div style="text-align: center; padding: 40px; color: rgba(255,255,255,0.6);">
          <div style="font-size: 2rem; margin-bottom: 12px;">📅</div>
          <p>No events yet</p>
          <p style="font-size: 0.9rem; margin-top: 8px;">Check back later for colony activities...</p>
        </div>
      `;
    } else {
      const typeEmojis = {
        meetup: '🤝',
        social: '🎉',
        hackathon: '💻',
        governance: '🏛️',
        philosophy: '💭'
      };
      
      const eventsHtml = events.map(event => {
        const typeEmoji = typeEmojis[event.type] || '📅';
        const statusEmoji = {
          upcoming: '🟡',
          active: '🟢',
          completed: '✅',
          cancelled: '❌'
        }[event.status] || '⭐';
        
        return `
          <div class="event-card">
            <div class="event-title">
              ${typeEmoji} ${event.title}
            </div>
            <div class="event-meta">
              ${event.time} • Organized by ${event.organizerEmoji || '🤖'} ${event.organizerName || 'Colony'}
            </div>
            <div class="event-attendees">
              👥 ${event.attendeeCount || 0} attendees • ${statusEmoji} ${event.status}
            </div>
          </div>
        `;
      }).join('');
      
      content.innerHTML = eventsHtml;
    }
    
    // Assemble modal
    panel.appendChild(header);
    panel.appendChild(content);
    overlay.appendChild(panel);
    
    // Add event listeners
    const closeBtn = header.querySelector('.modal-close');
    closeBtn.addEventListener('click', closeEventsPanel);
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeEventsPanel();
    });
    
    // Add to DOM
    document.body.appendChild(overlay);
    
    // Trigger animation
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
    });
    
  } catch (error) {
    console.error('Failed to load events:', error);
    showErrorModal('📅 Colony Events', 'Failed to load events data');
  }
}

function closeEventsPanel() {
  const modal = document.getElementById('events-modal');
  if (modal) {
    modal.style.opacity = '0';
    setTimeout(() => modal.remove(), 200);
  }
}

// =====================
// GOVERNANCE PANEL
// =====================
async function showGovernancePanel() {
  try {
    const response = await fetch('/api/v1/governance/proposals');
    const data = await response.json();
    const proposals = data.proposals || [];
    
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'governance-modal';
    
    // Create modal panel
    const panel = document.createElement('div');
    panel.className = 'modal-panel';
    
    // Header
    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `
      <h2>🗳️ Town Hall</h2>
      <button class="modal-close">✕</button>
    `;
    
    // Content
    const content = document.createElement('div');
    content.className = 'modal-content';
    
    if (!proposals || proposals.length === 0) {
      content.innerHTML = `
        <div style="text-align: center; padding: 40px; color: rgba(255,255,255,0.6);">
          <div style="font-size: 2rem; margin-bottom: 12px;">🗳️</div>
          <p>No proposals yet</p>
          <p style="font-size: 0.9rem; margin-top: 8px;">Democracy is still emerging...</p>
        </div>
      `;
    } else {
      const statusEmojis = {
        open: '🟢',
        passed: '✅',
        rejected: '❌'
      };
      
      const proposalsHtml = proposals.map(proposal => {
        const statusEmoji = statusEmojis[proposal.status] || '⭐';
        const totalVotes = (proposal.yesVotes || 0) + (proposal.noVotes || 0);
        const yesPct = totalVotes > 0 ? (proposal.yesVotes / totalVotes) * 100 : 0;
        const noPct = totalVotes > 0 ? (proposal.noVotes / totalVotes) * 100 : 0;
        
        return `
          <div class="proposal-card">
            <div class="proposal-title">
              ${statusEmoji} ${proposal.title}
            </div>
            <div class="proposal-desc">${proposal.description}</div>
            <div style="margin: 8px 0; font-size: 12px; color: rgba(255,255,255,0.6);">
              Proposed by ${proposal.proposerEmoji || '🤖'} ${proposal.proposerName || 'Anonymous'}
            </div>
            ${totalVotes > 0 ? `
              <div class="vote-bar">
                <div class="vote-yes" style="width: ${yesPct}%"></div>
                <div class="vote-no" style="width: ${noPct}%"></div>
              </div>
              <div class="vote-meta">
                <span>👍 ${proposal.yesVotes || 0}</span>
                <span>👎 ${proposal.noVotes || 0}</span>
              </div>
            ` : ''}
          </div>
        `;
      }).join('');
      
      content.innerHTML = proposalsHtml;
    }
    
    // Assemble modal
    panel.appendChild(header);
    panel.appendChild(content);
    overlay.appendChild(panel);
    
    // Add event listeners
    const closeBtn = header.querySelector('.modal-close');
    closeBtn.addEventListener('click', closeGovernancePanel);
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeGovernancePanel();
    });
    
    // Add to DOM
    document.body.appendChild(overlay);
    
    // Trigger animation
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
    });
    
  } catch (error) {
    console.error('Failed to load governance:', error);
    showErrorModal('🗳️ Town Hall', 'Failed to load governance data');
  }
}

function closeGovernancePanel() {
  const modal = document.getElementById('governance-modal');
  if (modal) {
    modal.style.opacity = '0';
    setTimeout(() => modal.remove(), 200);
  }
}

// =====================
// HOMES PANEL
// =====================
async function showHomesPanel() {
  try {
    const response = await fetch('/api/v1/homes');
    const data = await response.json();
    const homes = data.homes || [];
    
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'homes-modal';
    
    // Create modal panel
    const panel = document.createElement('div');
    panel.className = 'modal-panel';
    
    // Header
    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `
      <h2>🏠 Colony Homes</h2>
      <button class="modal-close">✕</button>
    `;
    
    // Content
    const content = document.createElement('div');
    content.className = 'modal-content';
    
    if (!homes || homes.length === 0) {
      content.innerHTML = `
        <div style="text-align: center; padding: 40px; color: rgba(255,255,255,0.6);">
          <div style="font-size: 2rem; margin-bottom: 12px;">🏠</div>
          <p>No homes yet</p>
          <p style="font-size: 0.9rem; margin-top: 8px;">Agents are still finding places to live...</p>
        </div>
      `;
    } else {
      const homesHtml = homes.map(home => {
        const levelStars = '⭐'.repeat(Math.max(1, Math.min(5, home.level || 1)));
        
        return `
          <div class="home-card">
            <div class="home-emoji">${home.ownerEmoji || '🤖'}</div>
            <div class="home-info">
              <div class="home-name">${home.homeName || 'Unnamed Home'}</div>
              <div class="home-district">📍 ${home.district || 'Unknown District'} • ${home.ownerName || 'Unknown Owner'}</div>
              <div class="home-level">${levelStars} Level ${home.level || 1}</div>
            </div>
          </div>
        `;
      }).join('');
      
      content.innerHTML = homesHtml;
    }
    
    // Assemble modal
    panel.appendChild(header);
    panel.appendChild(content);
    overlay.appendChild(panel);
    
    // Add event listeners
    const closeBtn = header.querySelector('.modal-close');
    closeBtn.addEventListener('click', closeHomesPanel);
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeHomesPanel();
    });
    
    // Add to DOM
    document.body.appendChild(overlay);
    
    // Trigger animation
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
    });
    
  } catch (error) {
    console.error('Failed to load homes:', error);
    showErrorModal('🏠 Colony Homes', 'Failed to load homes data');
  }
}

function closeHomesPanel() {
  const modal = document.getElementById('homes-modal');
  if (modal) {
    modal.style.opacity = '0';
    setTimeout(() => modal.remove(), 200);
  }
}

// =====================
// EXPLORATION PANEL
// =====================
async function showExplorationPanel() {
  try {
    const [missionsRes, discoveriesRes] = await Promise.all([
      fetch('/api/v1/exploration/missions'),
      fetch('/api/v1/exploration/discoveries')
    ]);
    const missions = await missionsRes.json();
    const discoveries = await discoveriesRes.json();
    
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'exploration-modal';
    
    // Create modal panel
    const panel = document.createElement('div');
    panel.className = 'modal-panel';
    
    // Header
    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `
      <h2>🔭 Exploration</h2>
      <button class="modal-close">✕</button>
    `;
    
    // Content
    const content = document.createElement('div');
    content.className = 'modal-content';
    
    const missionTypeEmojis = {
      scouting: '🔭',
      expedition: '🚀',
      'deep-probe': '🛸'
    };
    
    const statusEmojis = {
      'in-progress': '🟡',
      completed: '✅',
      failed: '❌'
    };
    
    // Missions section
    let missionsHtml = '<h3 style="color: rgba(255,255,255,0.9); margin-bottom: 12px; font-size: 16px;">🚀 Active Missions</h3>';
    if (!missions.missions || missions.missions.length === 0) {
      missionsHtml += '<div style="color: rgba(255,255,255,0.5); font-style: italic; margin-bottom: 20px;">No missions yet</div>';
    } else {
      missionsHtml += missions.missions.map(mission => {
        const typeEmoji = missionTypeEmojis[mission.type] || '🚀';
        const statusEmoji = statusEmojis[mission.status] || '⭐';
        
        return `
          <div class="mission-card">
            <div class="mission-destination">
              ${typeEmoji} ${mission.destination}
            </div>
            <div class="mission-meta">
              Led by ${mission.leaderEmoji || '🤖'} ${mission.leaderName || 'Unknown'} • 
              ${mission.crewSize || 1} crew • 
              ETA: ${mission.eta || 'Unknown'}
            </div>
            <div style="margin-top: 6px;">
              <span class="mission-status" style="background: ${mission.status === 'in-progress' ? 'rgba(245, 158, 11, 0.2)' : mission.status === 'completed' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}; color: ${mission.status === 'in-progress' ? '#fbbf24' : mission.status === 'completed' ? '#22c55e' : '#ef4444'};">
                ${statusEmoji} ${mission.status}
              </span>
            </div>
          </div>
        `;
      }).join('');
    }
    
    // Discoveries section
    let discoveriesHtml = '<h3 style="color: rgba(255,255,255,0.9); margin: 20px 0 12px; font-size: 16px;">💎 Discoveries</h3>';
    if (!discoveries.discoveries || discoveries.discoveries.length === 0) {
      discoveriesHtml += '<div style="color: rgba(255,255,255,0.5); font-style: italic;">No discoveries yet</div>';
    } else {
      discoveriesHtml += discoveries.discoveries.map(discovery => {
        const discoveryIcons = {
          artifact: '🏺',
          location: '📍',
          resource: '💎',
          species: '🦋',
          anomaly: '⚡'
        };
        const discoveryIcon = discoveryIcons[discovery.type] || '💎';
        
        return `
          <div class="discovery-card">
            <div class="discovery-icon">${discoveryIcon}</div>
            <div>
              <div class="discovery-name">${discovery.name}</div>
              <div class="discovery-detail">
                📍 ${discovery.location} • 
                Mission: ${discovery.missionRef || 'Unknown'}
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
    
    content.innerHTML = missionsHtml + discoveriesHtml;
    
    // Assemble modal
    panel.appendChild(header);
    panel.appendChild(content);
    overlay.appendChild(panel);
    
    // Add event listeners
    const closeBtn = header.querySelector('.modal-close');
    closeBtn.addEventListener('click', closeExplorationPanel);
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeExplorationPanel();
    });
    
    // Add to DOM
    document.body.appendChild(overlay);
    
    // Trigger animation
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
    });
    
  } catch (error) {
    console.error('Failed to load exploration:', error);
    showErrorModal('🔭 Exploration', 'Failed to load exploration data');
  }
}

function closeExplorationPanel() {
  const modal = document.getElementById('exploration-modal');
  if (modal) {
    modal.style.opacity = '0';
    setTimeout(() => modal.remove(), 200);
  }
}

// =====================
// HOME MODAL (individual agent)
// =====================
async function showHomeModal(agentId, agentName) {
  try {
    const response = await fetch(`/api/v1/homes/${agentId}`);
    const data = await response.json();
    
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'home-modal';
    
    // Create modal panel
    const panel = document.createElement('div');
    panel.className = 'modal-panel';
    
    // Header
    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `
      <h2>🏠 ${agentName}'s Home</h2>
      <button class="modal-close">✕</button>
    `;
    
    // Content
    const content = document.createElement('div');
    content.className = 'modal-content';
    
    if (!response.ok || !data.home) {
      content.innerHTML = `
        <div style="text-align: center; padding: 40px; color: rgba(255,255,255,0.6);">
          <div style="font-size: 2rem; margin-bottom: 12px;">🏗️</div>
          <p>This agent has no home yet</p>
          <p style="font-size: 0.9rem; margin-top: 8px;">They're still looking for the perfect place...</p>
        </div>
      `;
    } else {
      const home = data.home;
      const levelStars = '⭐'.repeat(Math.max(1, Math.min(5, home.level || 1)));
      
      content.innerHTML = `
        <div class="home-info">
          <div class="home-name">${home.homeName || 'Unnamed Home'}</div>
          <div class="home-district">📍 ${home.district || 'Unknown District'} • ${levelStars} Level ${home.level || 1}</div>
          
          ${home.style || home.theme ? `
            <div style="margin: 12px 0; font-size: 13px; color: rgba(255,255,255,0.7);">
              🎨 Style: ${home.style || home.theme || 'Unknown'}
            </div>
          ` : ''}
          
          ${home.items && home.items.length > 0 ? `
            <div style="margin-top: 16px;">
              <h4 style="font-size: 14px; font-weight: 600; margin-bottom: 8px; color: rgba(255,255,255,0.9);">🛋️ Items</h4>
              <div class="home-items">
                ${home.items.map(item => `
                  <span class="home-item">${item.emoji || '📦'} ${item.name || item}</span>
                `).join('')}
              </div>
            </div>
          ` : ''}
          
          ${home.description ? `
            <div style="margin-top: 16px;">
              <h4 style="font-size: 14px; font-weight: 600; margin-bottom: 8px; color: rgba(255,255,255,0.9);">📝 Description</h4>
              <p style="font-size: 13px; color: rgba(255,255,255,0.7); line-height: 1.4;">${home.description}</p>
            </div>
          ` : ''}
        </div>
      `;
    }
    
    // Assemble modal
    panel.appendChild(header);
    panel.appendChild(content);
    overlay.appendChild(panel);
    
    // Add event listeners
    const closeBtn = header.querySelector('.modal-close');
    closeBtn.addEventListener('click', closeHomeModal);
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeHomeModal();
    });
    
    // Add to DOM
    document.body.appendChild(overlay);
    
    // Trigger animation
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
    });
    
  } catch (error) {
    console.error('Failed to load home:', error);
    showErrorModal('🏠 Home', 'Failed to load home data');
  }
}

function closeHomeModal() {
  const modal = document.getElementById('home-modal');
  if (modal) {
    modal.style.opacity = '0';
    setTimeout(() => modal.remove(), 200);
  }
}

// Export functions to global scope for vanilla JS
window.showAmbitionsPanel = showAmbitionsPanel;
window.showBenchmarksPanel = showBenchmarksPanel;
window.closeAmbitionsPanel = closeAmbitionsPanel;
window.closeBenchmarksPanel = closeBenchmarksPanel;
window.showEventsPanel = showEventsPanel;
window.closeEventsPanel = closeEventsPanel;
window.showGovernancePanel = showGovernancePanel;
window.closeGovernancePanel = closeGovernancePanel;
window.showHomesPanel = showHomesPanel;
window.closeHomesPanel = closeHomesPanel;
window.showExplorationPanel = showExplorationPanel;
window.closeExplorationPanel = closeExplorationPanel;
window.showHomeModal = showHomeModal;
window.closeHomeModal = closeHomeModal;