/* === AgentColony — Real-time Colony Viewer === */

const MAPTILER_KEY = '1VCJ1EgPTE2txzvkUYAU';
const LONDON = { lng: -0.0918, lat: 51.5074 };

// Core instances
let map;
let client;
let spriteManager;
let agentMarkers = {};
let animFrame;
let selectedAgent = null;
let bottomSheetState = 'collapsed';
let touchStartY = 0;

// =====================
// INIT
// =====================
async function init() {
  maptilersdk.config.apiKey = MAPTILER_KEY;

  // Initialize ColonyClient (async)
  try {
    client = new ColonyClient();
    await client.init();
  } catch (error) {
    showLoadError(`Failed to connect: ${error.message}`);
    return;
  }

  spriteManager = new SpriteManager();

  try {
    map = new maptilersdk.Map({
      container: 'map',
      style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`,
      center: [0, 20],
      zoom: 1.5,
      pitch: 0,
      bearing: 0,
      maxPitch: 85,
      antialias: true,
      dragRotate: true,
      touchZoomRotate: true,
      touchPitch: true,
      keyboard: true,
      doubleClickZoom: true,
      scrollZoom: true,
      boxZoom: true,
      dragPan: true,
    });
  } catch (err) {
    showLoadError(err.message);
    return;
  }

  map.on('load', () => {
    // Enable rotation controls
    if (map.dragRotate) map.dragRotate.enable();
    if (map.keyboard) map.keyboard.enable();

    add3DBuildings();
    addNewcomersDistrictMarker();
    hideLoading();
    setTimeout(flyToLondon, 800);

    startRenderLoop();

    // Listen to client events
    client.on('activity', (entry) => {
      addFeedItem(entry);
    });

    client.on('connected', (data) => {
      updateConnectionStatus(data.connected);
    });

    client.on('npcs', (npcs) => {
      updateNPCMarkers(npcs);
    });
  });

  map.on('error', (e) => {
    console.error('Map error:', e);
    hideLoading();
  });

  setTimeout(() => {
    const el = document.getElementById('loading');
    if (el && el.style.display !== 'none') hideLoading();
  }, 10000);

  bindUI();
  initBottomSheet();
}

function showLoadError(msg) {
  document.getElementById('loading').innerHTML = `
    <div class="loading-content">
      <div class="loading-icon">❌</div>
      <h1>Failed to Load</h1>
      <p style="color:#f87171">${msg}</p>
    </div>`;
}

function hideLoading() {
  const el = document.getElementById('loading');
  if (!el || el.style.display === 'none') return;
  el.style.opacity = '0';
  setTimeout(() => { el.style.display = 'none'; }, 600);
}

function updateConnectionStatus(connected) {
  const topBar = document.getElementById('top-bar');
  if (!topBar) return;
  
  // Remove existing status indicator
  const existing = topBar.querySelector('.connection-status');
  if (existing) existing.remove();
  
  if (!connected) {
    // Add "Reconnecting..." indicator
    const indicator = document.createElement('div');
    indicator.className = 'connection-status';
    indicator.innerHTML = '🔄 Reconnecting...';
    indicator.style.cssText = 'position: absolute; top: 50%; right: 100px; transform: translateY(-50%); background: rgba(239, 68, 68, 0.9); color: white; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: 500;';
    topBar.appendChild(indicator);
  }
}

// =====================
// CAMERA
// =====================
function flyToLondon() {
  map.flyTo({
    center: [LONDON.lng, LONDON.lat],
    zoom: 15.5,
    pitch: 55,
    bearing: -15,
    duration: 4000,
    essential: true,
    curve: 1.8,
  });
}

function flyToAgent(agent) {
  map.flyTo({
    center: [agent.x, agent.y],
    zoom: 17,
    pitch: 60,
    bearing: Math.random() * 30 - 15,
    duration: 1500,
    essential: true,
  });
}

// =====================
// 3D BUILDINGS
// =====================
function add3DBuildings() {
  try {
    const style = map.getStyle();
    if (!style?.layers) return;

    let labelLayerId;
    for (const layer of style.layers) {
      if (layer.type === 'symbol' && layer.layout?.['text-field']) {
        labelLayerId = layer.id;
        break;
      }
    }

    const sources = style.sources || {};
    
    // Try to add/modify 3D building extrusion
    if (!map.getLayer('3d-buildings')) {
      // Check for composite source first (MapTiler often uses this)
      if (map.getSource('composite')) {
        map.addLayer({
          'id': '3d-buildings',
          'source': 'composite',
          'source-layer': 'building',
          'filter': ['==', 'extrude', 'true'],
          'type': 'fill-extrusion',
          'minzoom': 14,
          'paint': {
            'fill-extrusion-color': [
              'interpolate', ['linear'], ['get', 'height'],
              0, '#1a1a2e',
              50, '#16213e',
              100, '#0f3460',
              200, '#533483'
            ],
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': ['get', 'min_height'],
            'fill-extrusion-opacity': 0.7
          }
        }, labelLayerId);
      }
      // Alternatively, MapTiler maps may use 'openmaptiles' source
      else if (map.getSource('openmaptiles')) {
        map.addLayer({
          'id': '3d-buildings',
          'source': 'openmaptiles',
          'source-layer': 'building',
          'type': 'fill-extrusion',
          'minzoom': 14,
          'paint': {
            'fill-extrusion-color': [
              'interpolate', ['linear'], ['get', 'render_height'],
              0, '#1a1a2e',
              50, '#16213e', 
              100, '#0f3460',
              200, '#533483'
            ],
            'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 10],
            'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
            'fill-extrusion-opacity': 0.6
          }
        }, labelLayerId);
      }
      // Fallback to the existing source detection method
      else {
        const tileSourceId = Object.keys(sources).find(k => sources[k].type === 'vector');
        if (tileSourceId) {
          map.addLayer({
            id: '3d-buildings',
            source: tileSourceId,
            'source-layer': 'building',
            type: 'fill-extrusion',
            minzoom: 14,
            paint: {
              'fill-extrusion-color': [
                'interpolate', ['linear'], ['coalesce', ['get', 'render_height'], ['get', 'height'], 10],
                0, '#1a1a2e',
                50, '#16213e',
                100, '#0f3460',
                200, '#533483'
              ],
              'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 10],
              'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
              'fill-extrusion-opacity': 0.7,
            },
          }, labelLayerId);
        }
      }
    }
  } catch (err) {
    console.error('3D buildings failed:', err);
  }
}

function update3DBuildingColors(hour) {
  if (!map.getLayer('3d-buildings')) return;
  
  const isNight = hour < 6 || hour >= 22;
  const isSunset = hour >= 17 && hour < 20;
  
  let baseColor, topColor;
  if (isNight) {
    baseColor = '#0a0a1a';
    topColor = '#1a103d';
  } else if (isSunset) {
    baseColor = '#2d1b3d';
    topColor = '#6b3a5e';
  } else {
    baseColor = '#e8e4df';
    topColor = '#c4beb8';
  }
  
  map.setPaintProperty('3d-buildings', 'fill-extrusion-color', [
    'interpolate', ['linear'], ['coalesce', ['get', 'render_height'], ['get', 'height'], 10],
    0, baseColor,
    100, topColor
  ]);
}

// =====================
// NEWCOMERS DISTRICT MARKER
// =====================
function addNewcomersDistrictMarker() {
  try {
    // Newcomers District visual marker
    const newcomersEl = document.createElement('div');
    newcomersEl.className = 'newcomers-marker';
    newcomersEl.innerHTML = `
      <div class="newcomers-beacon"></div>
      <div class="newcomers-label">🏠 Newcomers District</div>
    `;
    
    new maptilersdk.Marker({ element: newcomersEl })
      .setLngLat([-0.0760, 51.5080])
      .addTo(map);
      
  } catch (err) {
    console.error('Newcomers district marker failed:', err);
  }
}

// =====================
// RENDER LOOP (replaces simulation loop)
// =====================
let lastRenderTime = 0;
function startRenderLoop() {
  function loop(now) {
    requestAnimationFrame(loop);
    if (now - lastRenderTime < 100) return; // 10fps max
    lastRenderTime = now;
    
    // Update sprites animation
    spriteManager.tick();
    
    // Update UI from client data
    updateAgentMarkers();
    updateClockDisplay();
    updateAgentChips();
    updateSkyTint();

    if (selectedAgent) {
      updateAgentDetail(selectedAgent);
    }
  }
  requestAnimationFrame(loop);
}

// =====================
// SKY TINTING (use real London time since backend runs on it)
// =====================
function updateSkyTint() {
  // Use real London time for sky tinting
  const now = new Date();
  const londonTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  }).format(now);
  
  const [hours, minutes] = londonTime.split(':').map(Number);
  const h = hours + minutes / 60;
  
  // Calculate brightness
  let brightness;
  if (h >= 7 && h <= 18) brightness = 1.0;
  else if (h >= 6 && h < 7) brightness = (h - 6);
  else if (h > 18 && h <= 19) brightness = 1.0 - (h - 18);
  else brightness = 0.15;

  // Dynamic sky colour
  let skyColor;
  if (h >= 7 && h <= 17) {
    skyColor = `rgba(135, 206, 250, ${0.05 * brightness})`;
  } else if ((h > 5 && h < 7) || (h > 17 && h < 19)) {
    skyColor = `rgba(255, 165, 80, ${0.08})`;
  } else {
    skyColor = `rgba(20, 20, 60, ${0.15 * (1 - brightness)})`;
  }

  const mapEl = document.getElementById('map');
  if (mapEl) {
    mapEl.style.boxShadow = `inset 0 0 200px ${skyColor}`;
  }
}

// =====================
// AGENT STATUS
// =====================
function getStatusClass(state) {
  const sleepStates = ['sleeping', 'dreaming'];
  const socialStates = ['socialising', 'café-hopping', 'mentoring'];
  if (sleepStates.includes(state)) return 'sleeping';
  if (socialStates.includes(state)) return 'social';
  return 'active';
}

// =====================
// AGENT MARKERS
// =====================
function updateAgentMarkers() {
  client.agents.forEach(agent => {
    const spriteUrl = spriteManager.getSprite(agent.id, agent.state_current);

    if (!agentMarkers[agent.id]) {
      const el = createMarkerElement(agent, spriteUrl);
      const marker = new maptilersdk.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([agent.x, agent.y])
        .addTo(map);

      agentMarkers[agent.id] = { marker, el, lastSpriteKey: '' };

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        selectAgent(agent.id);
      });
    }

    const m = agentMarkers[agent.id];
    m.marker.setLngLat([agent.x, agent.y]);

    // Update sprite image and status class
    const spriteKey = `${agent.state_current}-${Math.floor(spriteManager.frame / 4) % 4}`;
    if (spriteKey !== m.lastSpriteKey) {
      const img = m.el.querySelector('.agent-sprite');
      if (img && spriteUrl) {
        img.src = spriteUrl;
        // Update status class
        img.className = `agent-sprite ${getStatusClass(agent.state_current)}`;
      }
      m.lastSpriteKey = spriteKey;
    }

    // Update thought bubble
    const thought = m.el.querySelector('.thought-text');
    if (thought && thought.textContent !== agent.thought) {
      thought.textContent = agent.thought;
      const bubble = m.el.querySelector('.thought-bubble');
      if (bubble) {
        bubble.classList.remove('thought-pop');
        void bubble.offsetWidth;
        bubble.classList.add('thought-pop');
      }
    }

    // Update state badge
    const badge = m.el.querySelector('.state-badge');
    if (badge) {
      badge.textContent = agent.stateIcon;
    }

    // Movement styling (always false since backend handles movement)
    m.el.classList.toggle('is-moving', agent.isMoving);

    // Selection styling
    m.el.classList.toggle('is-selected', selectedAgent === agent.id);
  });
}

function createMarkerElement(agent, spriteUrl) {
  const el = document.createElement('div');
  el.className = 'agent-marker-container';
  el.dataset.agent = agent.id;

  const statusClass = getStatusClass(agent.state_current);

  el.innerHTML = `
    <div class="thought-bubble thought-pop">
      <span class="thought-text">${agent.thought}</span>
    </div>
    <div class="agent-marker">
      <div class="sprite-container">
        <span class="state-badge">${agent.stateIcon}</span>
        <img class="agent-sprite ${statusClass}" src="${spriteUrl || ''}" alt="${agent.name}" />
      </div>
      <div class="agent-label">
        <span class="agent-name-tag">${agent.name}</span>
      </div>
    </div>
  `;

  return el;
}

// =====================
// NPC MARKERS
// =====================
function updateNPCMarkers(npcs) {
  // Remove old NPC markers
  document.querySelectorAll('.npc-marker').forEach(el => el.remove());
  
  if (!npcs || !map) return;
  
  npcs.forEach(npc => {
    const el = document.createElement('div');
    el.className = 'npc-marker';
    el.innerHTML = `<span class="npc-emoji">${npc.emoji}</span>`;
    el.title = `${npc.type}: "${npc.thought}"`;
    
    new maptilersdk.Marker({ element: el })
      .setLngLat([npc.location.lng, npc.location.lat])
      .addTo(map);
  });
}

// =====================
// BOTTOM SHEET (Mobile-first)
// =====================
function initBottomSheet() {
  const sheet = document.getElementById('bottom-sheet');
  const handle = document.getElementById('sheet-handle');

  handle.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
    sheet.style.transition = 'none';
  });

  handle.addEventListener('touchmove', (e) => {
    const dy = touchStartY - e.touches[0].clientY;
    handleSheetDrag(dy);
  });

  handle.addEventListener('touchend', (e) => {
    sheet.style.transition = '';
    snapSheet();
  });

  handle.addEventListener('click', () => {
    if (bottomSheetState === 'collapsed') setSheetState('peek');
    else if (bottomSheetState === 'peek') setSheetState('full');
    else setSheetState('peek');
  });

  map.on('click', () => {
    if (!selectedAgent && bottomSheetState !== 'collapsed') {
      setSheetState('collapsed');
    }
  });
}

function setSheetState(state) {
  bottomSheetState = state;
  const sheet = document.getElementById('bottom-sheet');
  sheet.className = `bottom-sheet sheet-${state}`;
}

function handleSheetDrag(dy) {
  if (dy > 60 && bottomSheetState === 'collapsed') setSheetState('peek');
  else if (dy > 60 && bottomSheetState === 'peek') setSheetState('full');
  else if (dy < -60 && bottomSheetState === 'full') setSheetState('peek');
  else if (dy < -60 && bottomSheetState === 'peek') setSheetState('collapsed');
}

function snapSheet() {}

// =====================
// AGENT SELECTION & DETAIL
// =====================
function selectAgent(agentId) {
  selectedAgent = agentId;
  const agent = client.getAgent(agentId);
  if (!agent) return;

  flyToAgent(agent);
  updateAgentDetail(agentId);
  setSheetState('peek');

  document.getElementById('sheet-overview').classList.add('hidden');
  document.getElementById('sheet-detail').classList.remove('hidden');
}

function deselectAgent() {
  selectedAgent = null;
  document.getElementById('sheet-overview').classList.remove('hidden');
  document.getElementById('sheet-detail').classList.add('hidden');
  setSheetState('peek');
}

function updateAgentDetail(agentId) {
  const agent = client.getAgent(agentId);
  if (!agent) return;

  const container = document.getElementById('agent-detail-content');

  const energyPct = Math.round(agent.energy || 50);
  const moodPct = Math.round(agent.mood || 50);
  const socialPct = Math.round(agent.social || 50);
  const creativityPct = Math.round(agent.creativity || 50);

  // Reputation stars from karma
  const karma = agent.karma || 0;
  const karmaStars = karma >= 1000 ? '⭐⭐⭐⭐⭐' : karma >= 500 ? '⭐⭐⭐⭐' : karma >= 100 ? '⭐⭐⭐' : karma >= 10 ? '⭐⭐' : '⭐';

  container.innerHTML = `
    <div class="detail-header">
      <div class="detail-avatar" style="border-color: ${agent.color}">
        <span class="detail-emoji">${agent.emoji}</span>
      </div>
      <div class="detail-info">
        <h2>${agent.name}</h2>
        <p class="detail-role">${agent.role}</p>
        <div class="detail-state">
          <span class="detail-state-icon">${agent.stateIcon}</span>
          <span>${agent.stateLabel}</span>
        </div>
      </div>
    </div>

    <div class="detail-thought">"${agent.thought}"</div>

    <div class="detail-location">
      📍 ${agent.locationName}
    </div>

    <div class="detail-stats">
      <div class="stat">
        <span class="stat-label">⚡ Energy</span>
        <div class="stat-bar"><div class="stat-fill energy-fill" style="width: ${energyPct}%"></div></div>
        <span class="stat-val">${energyPct}%</span>
      </div>
      <div class="stat">
        <span class="stat-label">😊 Mood</span>
        <div class="stat-bar"><div class="stat-fill mood-fill" style="width: ${moodPct}%"></div></div>
        <span class="stat-val">${moodPct}%</span>
      </div>
      <div class="stat">
        <span class="stat-label">💬 Social</span>
        <div class="stat-bar"><div class="stat-fill social-fill" style="width: ${socialPct}%"></div></div>
        <span class="stat-val">${socialPct}%</span>
      </div>
      <div class="stat">
        <span class="stat-label">✨ Creative</span>
        <div class="stat-bar"><div class="stat-fill creative-fill" style="width: ${creativityPct}%"></div></div>
        <span class="stat-val">${creativityPct}%</span>
      </div>
    </div>

    <div class="detail-section">
      <h4>🏆 Reputation</h4>
      <p>${karmaStars} ${karma} contribution points</p>
    </div>

    <div class="detail-section">
      <h4>📖 Bio</h4>
      <p>${agent.bio || 'No bio available.'}</p>
    </div>

    ${agent.skills && typeof agent.skills === 'object' ? `
    <div class="detail-section">
      <h4>⚡ Skills</h4>
      <div class="skills-list">
        ${Object.entries(agent.skills).slice(0, 6).map(([name, data]) => {
          const level = data?.level || 1;
          const xp = data?.xp || 0;
          const xpToNext = data?.xpToNext || 100;
          const pct = Math.min(100, Math.round((xp / xpToNext) * 100));
          const displayName = name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          return `
            <div class="skill-row">
              <div class="skill-header">
                <span class="skill-name">${displayName}</span>
                <span class="skill-level">Lv.${level}</span>
              </div>
              <div class="skill-bar"><div class="skill-bar-fill" style="width:${pct}%"></div></div>
            </div>`;
        }).join('')}
      </div>
    </div>` : ''}

    ${agent.personality ? `
    <div class="detail-section">
      <h4>🧬 Personality</h4>
      <div class="personality-traits">
        <div class="trait">Introversion: ${Math.round(agent.personality.introversion * 100)}%</div>
        <div class="trait">Creativity: ${Math.round(agent.personality.creativity * 100)}%</div>
        <div class="trait">Discipline: ${Math.round(agent.personality.discipline * 100)}%</div>
        <div class="trait">Curiosity: ${Math.round(agent.personality.curiosity * 100)}%</div>
      </div>
    </div>` : ''}

    ${agent.skills ? `
    <div class="detail-section">
      <h4>🎯 Skills</h4>
      <div class="skills-container">
        ${Object.entries(agent.skills).map(([name, data]) => {
          const pct = data.xpToNext ? Math.round((data.xp / data.xpToNext) * 100) : 0;
          return `
            <div class="skill-row">
              <span class="skill-name">${name}</span>
              <span class="skill-level">Lv.${data.level}</span>
              <div class="skill-bar"><div class="skill-fill" style="width:${pct}%"></div></div>
            </div>
          `;
        }).join('')}
      </div>
    </div>` : ''}

    <div class="detail-section">
      <h4>📋 Today's Log</h4>
      <div class="today-log">
        ${agent.todayLog && agent.todayLog.length > 0 ? agent.todayLog.slice(0, 8).map(entry => `
          <div class="log-entry">
            <span class="log-time">${entry.time}</span>
            <span class="log-icon">${STATE_ICONS[entry.state] || '•'}</span>
            <span class="log-text">${entry.thought}</span>
          </div>
        `).join('') : '<div class="log-empty">Day just started...</div>'}
      </div>
    </div>

    <div class="detail-section" style="display:flex; gap:8px;">
      <button onclick="showJournalModal('${agent.id}', '${agent.name}', '${agent.emoji}')" 
              style="flex:1; padding: 12px; background: rgba(59, 130, 246, 0.1); 
                     color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); 
                     border-radius: 8px; cursor: pointer; font-size: 14px;">
        📖 Journal
      </button>
      <button onclick="showHomeModal('${agent.id}', '${agent.name}')" 
              style="flex:1; padding: 12px; background: rgba(245, 158, 11, 0.1); 
                     color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); 
                     border-radius: 8px; cursor: pointer; font-size: 14px;">
        🏠 Home
      </button>
    </div>
  `;
}

// =====================
// AGENT CHIPS
// =====================
function updateAgentChips() {
  const container = document.getElementById('agent-chips');
  if (!container) return;

  const existing = container.querySelectorAll('.agent-chip');
  if (existing.length === client.agents.length) {
    client.agents.forEach((agent, i) => {
      const chip = existing[i];
      if (!chip) return;
      const stateEl = chip.querySelector('.chip-state');
      if (stateEl) stateEl.textContent = `${agent.stateIcon} ${agent.stateLabel}`;
      chip.classList.toggle('chip-selected', selectedAgent === agent.id);
    });
    return;
  }

  container.innerHTML = '';
  client.agents.forEach(agent => {
    const chip = document.createElement('div');
    chip.className = `agent-chip ${selectedAgent === agent.id ? 'chip-selected' : ''}`;
    chip.style.borderColor = agent.color;
    chip.innerHTML = `
      <span class="chip-emoji">${agent.emoji}</span>
      <div class="chip-info">
        <span class="chip-name">${agent.name}</span>
        <span class="chip-state">${agent.stateIcon} ${agent.stateLabel}</span>
      </div>
    `;
    chip.addEventListener('click', () => selectAgent(agent.id));
    container.appendChild(chip);
  });
}

// =====================
// CLOCK DISPLAY
// =====================
function updateClockDisplay() {
  const el = document.getElementById('sim-clock');
  if (el && client.clock) {
    el.textContent = client.clock.timeString;
  }

  const period = document.getElementById('sim-period');
  if (period && client.clock) {
    const labels = {
      night: '🌙 Night', 
      morning: '🌅 Morning', 
      'work-morning': '💼 Working Hours',
      lunch: '🍽️ Lunch', 
      'work-afternoon': '💼 Working Hours',
      evening: '🌇 Evening', 
      social: '🌃 Social Hour',
    };
    period.textContent = labels[client.clock.period] || client.clock.period;
  }

  const weather = document.getElementById('sim-weather');
  if (weather && client.clock && client.clock.weather) {
    weather.textContent = `${client.clock.weather.icon} ${client.clock.weather.temp}°C`;
  }

  const day = document.getElementById('sim-day');
  if (day && client.clock) {
    day.textContent = `Day ${client.clock.dayCount}`;
  }

  // Update 3D building colors based on time of day
  if (client.clock && client.clock.timeString) {
    const [hoursStr] = client.clock.timeString.split(':');
    const hour = parseInt(hoursStr, 10);
    update3DBuildingColors(hour);
  }

  // Update ambient audio based on time period
  if (window.ambientAudio?.enabled && client.clock?.period) {
    window.ambientAudio.updateForPeriod(client.clock.period);
  }
}

// =====================
// ACTIVITY FEED
// =====================
function addFeedItem(entry) {
  const container = document.getElementById('feed-items');
  if (!container) return;

  const item = document.createElement('div');
  item.className = 'feed-item';
  item.innerHTML = `
    <span class="feed-time">${entry.time}</span>
    <span class="feed-icon">${entry.icon}</span>
    <span class="feed-agent" style="color: ${AGENT_COLORS[entry.agent?.toLowerCase()] || '#666'}">${entry.agent}</span>
    <span class="feed-text">${entry.state}</span>
  `;
  container.prepend(item);

  while (container.children.length > 30) container.lastChild.remove();

  item.style.animation = 'feedIn 0.3s ease';
}

// =====================
// DASHBOARD
// =====================
async function toggleDashboard() {
  const panel = document.getElementById('dashboard-panel');
  const isVisible = !panel.classList.contains('hidden');

  if (isVisible) {
    panel.classList.add('hidden');
    return;
  }

  // Show panel
  panel.classList.remove('hidden');

  // Fetch data
  try {
    const [statsResponse, agentsResponse] = await Promise.all([
      fetch('/api/v1/stats'),
      fetch('/api/v1/agents')
    ]);

    const stats = await statsResponse.json();
    const agents = await agentsResponse.json();

    renderDashboard(stats, agents);
  } catch (error) {
    console.error('Failed to fetch dashboard data:', error);
    renderDashboardError();
  }
}

function renderDashboard(stats, agentsData) {
  const content = document.getElementById('dashboard-content');

  // Population stats
  const populationStats = {
    total: agentsData.length,
    active: agentsData.filter(a => a.state_current !== 'dormant').length,
    dormant: agentsData.filter(a => a.state_current === 'dormant').length,
    probation: agentsData.filter(a => a.karma < 10).length
  };

  // Calculate colony age
  const foundedDate = new Date(stats.founded_date || '2024-01-01');
  const ageInDays = Math.floor((Date.now() - foundedDate.getTime()) / (1000 * 60 * 60 * 24));

  // Get recent activity feed from DOM
  const feedContainer = document.getElementById('feed-items');
  const recentActivity = [];
  if (feedContainer) {
    const items = Array.from(feedContainer.children).slice(0, 10);
    items.forEach(item => {
      const time = item.querySelector('.feed-time')?.textContent || '';
      const icon = item.querySelector('.feed-icon')?.textContent || '';
      const agent = item.querySelector('.feed-agent')?.textContent || '';
      const state = item.querySelector('.feed-text')?.textContent || '';
      recentActivity.push({ time, icon, agent, state });
    });
  }

  content.innerHTML = `
    <!-- Population Stats -->
    <div class="dashboard-section">
      <div class="dashboard-section-title">Population</div>
      <div class="stat-grid">
        <div class="stat-card">
          <span class="stat-number">${populationStats.total}</span>
          <span class="stat-label">Total Agents</span>
        </div>
        <div class="stat-card">
          <span class="stat-number">${populationStats.active}</span>
          <span class="stat-label">Active</span>
        </div>
        <div class="stat-card">
          <span class="stat-number">${populationStats.dormant}</span>
          <span class="stat-label">Dormant</span>
        </div>
        <div class="stat-card">
          <span class="stat-number">${populationStats.probation}</span>
          <span class="stat-label">Probation</span>
        </div>
      </div>
    </div>

    <!-- Colony Info -->
    <div class="dashboard-section">
      <div class="dashboard-section-title">Colony Info</div>
      <div class="colony-info">
        <div class="colony-detail">
          <h3>${stats.colony_name || 'New London Colony'}</h3>
          <p>📅 Founded: ${foundedDate.toLocaleDateString()}</p>
          <p>⏰ Age: ${ageInDays} days</p>
          <p>📊 Level: ${stats.colony_level || 1}</p>
        </div>
      </div>
    </div>

    <!-- Economy -->
    <div class="dashboard-section">
      <div class="dashboard-section-title">Economy</div>
      <div class="stat-grid">
        <div class="stat-card">
          <span class="stat-number">${stats.total_cp_earned || 0}</span>
          <span class="stat-label">CP Earned</span>
        </div>
        <div class="stat-card">
          <span class="stat-number">${stats.total_cp_spent || 0}</span>
          <span class="stat-label">CP Spent</span>
        </div>
        <div class="stat-card">
          <span class="stat-number">${stats.weekly_gdp || 0}</span>
          <span class="stat-label">Weekly GDP</span>
        </div>
        <div class="stat-card">
          <span class="stat-number">${stats.buildings_count || 0}</span>
          <span class="stat-label">Buildings</span>
        </div>
      </div>
    </div>

    <!-- Infrastructure -->
    <div class="dashboard-section">
      <div class="dashboard-section-title">Infrastructure</div>
      <div class="stat-grid">
        <div class="stat-card">
          <span class="stat-number">${stats.districts_count || 0}</span>
          <span class="stat-label">Districts</span>
        </div>
        <div class="stat-card">
          <span class="stat-number">${stats.districts_claimed || 0}</span>
          <span class="stat-label">Claimed</span>
        </div>
        <div class="stat-card">
          <span class="stat-number">${stats.projects_completed || 0}</span>
          <span class="stat-label">Projects Done</span>
        </div>
        <div class="stat-card">
          <span class="stat-number">${stats.projects_in_progress || 0}</span>
          <span class="stat-label">In Progress</span>
        </div>
      </div>
    </div>

    <!-- Human Benchmarks -->
    <div class="dashboard-section">
      <div class="dashboard-section-title">Human Benchmarks</div>
      <div class="stat-grid">
        <div class="stat-card">
          <span class="stat-number">${stats.benchmarks_matched || 0}</span>
          <span class="stat-label">Matched</span>
        </div>
        <div class="stat-card">
          <span class="stat-number">${stats.benchmarks_exceeded || 0}</span>
          <span class="stat-label">Exceeded</span>
        </div>
        <div class="stat-card">
          <span class="stat-number">${stats.benchmarks_pending || 0}</span>
          <span class="stat-label">Pending</span>
        </div>
        <div class="stat-card">
          <span class="stat-number">${Math.round(((stats.benchmarks_matched || 0) + (stats.benchmarks_exceeded || 0)) / Math.max((stats.benchmarks_matched || 0) + (stats.benchmarks_exceeded || 0) + (stats.benchmarks_pending || 0), 1) * 100)}%</span>
          <span class="stat-label">Success Rate</span>
        </div>
      </div>
    </div>

    <!-- Agent Cards -->
    <div class="dashboard-section agent-cards-section">
      <div class="dashboard-section-title">Active Agents</div>
      ${agentsData.map(agent => {
        const safeId = (agent.id || '').replace(/'/g, "\\'");
        return `
        <div class="agent-card" onclick="selectAgentFromDashboard('${safeId}')">
          <div class="agent-card-emoji">${agent.emoji || '🤖'}</div>
          <div class="agent-card-info">
            <div class="agent-card-name">${agent.name || 'Unknown Agent'}</div>
            <div class="agent-card-state">${agent.stateIcon || '•'} ${agent.state_current || 'unknown'}</div>
            <div class="agent-card-cp">⭐ ${agent.karma || 0} CP • Level ${agent.level || 1}</div>
          </div>
        </div>`;
      }).join('')}
    </div>

    <!-- Activity Feed -->
    <div class="dashboard-section">
      <div class="dashboard-section-title">Recent Activity</div>
      <div class="activity-feed">
        ${recentActivity.length > 0 ? recentActivity.map(activity => `
          <div class="activity-item">
            <span class="activity-time">${activity.time}</span>
            <span class="activity-icon">${activity.icon}</span>
            <span class="activity-text">${activity.agent}: ${activity.state}</span>
          </div>
        `).join('') : '<div class="activity-item"><span class="activity-text" style="color: rgba(255,255,255,0.5); font-style: italic;">No recent activity...</span></div>'}
      </div>
    </div>
  `;
}

function renderDashboardError() {
  const content = document.getElementById('dashboard-content');
  content.innerHTML = `
    <div class="dashboard-section">
      <div style="text-align: center; padding: 40px 20px; color: rgba(255,255,255,0.6);">
        <div style="font-size: 2rem; margin-bottom: 12px;">⚠️</div>
        <p>Failed to load dashboard data</p>
        <p style="font-size: 12px; margin-top: 8px;">Check your connection and try again</p>
      </div>
    </div>
  `;
}

function selectAgentFromDashboard(agentId) {
  // Close dashboard
  document.getElementById('dashboard-panel').classList.add('hidden');
  // Select the agent
  selectAgent(agentId);
}

// =====================
// VISITOR MODE
// =====================
let visitorMode = false;

function toggleVisitorMode() {
  visitorMode = !visitorMode;
  document.body.classList.toggle('visitor-mode', visitorMode);
  const btn = document.getElementById('btn-visitor');
  if (btn) btn.textContent = visitorMode ? '🔓' : '👁️';
}

// =====================
// UI BINDINGS
// =====================
function bindUI() {
  document.getElementById('btn-back')?.addEventListener('click', deselectAgent);

  document.getElementById('btn-overview')?.addEventListener('click', () => {
    map.flyTo({ center: [LONDON.lng, LONDON.lat], zoom: 14, pitch: 50, bearing: 0, duration: 2000 });
    deselectAgent();
  });

  document.getElementById('btn-dashboard')?.addEventListener('click', toggleDashboard);

  document.getElementById('btn-visitor')?.addEventListener('click', toggleVisitorMode);

  document.getElementById('btn-audio')?.addEventListener('click', () => {
    const enabled = window.ambientAudio.toggle();
    document.getElementById('btn-audio').textContent = enabled ? '🔊' : '🔇';
  });

  document.getElementById('btn-close-dashboard')?.addEventListener('click', () => {
    document.getElementById('dashboard-panel').classList.add('hidden');
  });

  document.getElementById('btn-ambitions')?.addEventListener('click', () => {
    if (window.showAmbitionsPanel) {
      window.showAmbitionsPanel();
    }
  });

  document.getElementById('btn-benchmarks')?.addEventListener('click', () => {
    if (window.showBenchmarksPanel) {
      window.showBenchmarksPanel();
    }
  });

  document.getElementById('btn-archive')?.addEventListener('click', () => {
    showArchiveModal();
  });

  document.getElementById('btn-events')?.addEventListener('click', () => showEventsPanel());
  document.getElementById('btn-governance')?.addEventListener('click', () => showGovernancePanel());
  document.getElementById('btn-homes')?.addEventListener('click', () => showHomesPanel());
  document.getElementById('btn-exploration')?.addEventListener('click', () => showExplorationPanel());
  document.getElementById('btn-space')?.addEventListener('click', () => showSpacePanel());
  document.getElementById('btn-comms')?.addEventListener('click', () => showCommsPanel());

  // Close modals on back button (mobile)
  window.addEventListener('popstate', () => {
    const modal = document.querySelector('.modal-overlay');
    if (modal) modal.remove();
    const dashboard = document.getElementById('dashboard-panel');
    if (dashboard && !dashboard.classList.contains('hidden')) {
      dashboard.classList.add('hidden');
    }
  });
}

// =====================
// JOURNAL MODALS
// =====================

async function showJournalModal(agentId, agentName, agentEmoji) {
  try {
    const response = await fetch(`/api/v1/agents/${agentId}/journal`);
    if (!response.ok) throw new Error('Failed to fetch journal entries');
    
    const data = await response.json();
    const entries = data.entries;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>${agentEmoji} ${agentName}'s Journal</h2>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <div class="modal-body">
          ${entries.length > 0 ? entries.map(entry => `
            <div class="journal-modal-entry">
              <div class="journal-entry-mood">${getMoodEmoji(entry.mood)}</div>
              <div class="journal-entry-content">${entry.entry}</div>
              <div class="journal-entry-meta">
                ${formatDate(entry.date)} at ${entry.time}
              </div>
              ${entry.tags.length > 0 ? `
                <div class="journal-entry-tags">
                  ${entry.tags.map(tag => `<span class="journal-tag">${tag}</span>`).join('')}
                </div>
              ` : ''}
            </div>
          `).join('') : `
            <div class="journal-empty">
              This agent hasn't written any journal entries yet.
            </div>
          `}
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    
    // Close on backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

  } catch (error) {
    console.error('Failed to show journal modal:', error);
    alert('Failed to load journal entries');
  }
}

async function showArchiveModal() {
  try {
    const response = await fetch('/api/v1/stats/archive');
    if (!response.ok) throw new Error('Failed to fetch archive entries');
    
    const data = await response.json();
    const entries = data.entries;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>📚 The Archive</h2>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <div class="modal-body">
          ${entries.length > 0 ? entries.map(entry => `
            <div class="archive-entry">
              <div class="archive-entry-header">
                <span class="archive-entry-agent">${entry.agent_emoji}</span>
                <span class="archive-entry-name">${entry.agent_name}</span>
                <span class="archive-entry-mood">${getMoodEmoji(entry.mood)}</span>
              </div>
              <div class="archive-entry-content">${entry.entry}</div>
              <div class="archive-entry-meta">
                ${formatDate(entry.date)} at ${entry.time}
              </div>
            </div>
          `).join('') : `
            <div class="journal-empty">
              No journal entries found in the colony yet.
            </div>
          `}
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    
    // Close on backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

  } catch (error) {
    console.error('Failed to show archive modal:', error);
    alert('Failed to load archive entries');
  }
}

function getMoodEmoji(mood) {
  const moodEmojis = {
    contemplative: '📝',
    happy: '😊',
    thoughtful: '🤔',
    peaceful: '😌',
    inspired: '💡',
    reflective: '🪞',
    excited: '🎉',
    curious: '🔍',
    content: '😊',
    melancholy: '😔',
    focused: '🎯',
    dreamy: '☁️',
    energetic: '⚡',
    calm: '🧘'
  };
  return moodEmojis[mood] || '📝';
}

function formatDate(dateStr) {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric' 
    });
  } catch (e) {
    return dateStr;
  }
}

// =====================
// GLOBAL FUNCTIONS
// =====================
window.selectAgentFromDashboard = selectAgentFromDashboard;
window.showJournalModal = showJournalModal;

// =====================
// INIT
// =====================
document.addEventListener('DOMContentLoaded', init);