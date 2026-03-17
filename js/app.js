/* === AgentColony — Living World v7 === */

const MAPTILER_KEY = '1VCJ1EgPTE2txzvkUYAU';
const LONDON = { lng: -0.0918, lat: 51.5074 };

// Core instances
let map;
let world;
let spriteManager;
let agentMarkers = {};
let animFrame;
let selectedAgent = null;
let bottomSheetState = 'collapsed';
let touchStartY = 0;

// =====================
// INIT
// =====================
function init() {
  maptilersdk.config.apiKey = MAPTILER_KEY;

  world = new ColonyWorld();
  world.init(AGENTS);
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
      // Enable all interaction handlers explicitly
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
    // Ensure right-click + drag rotation is enabled on desktop
    if (map.dragRotate) {
      map.dragRotate.enable();
    }
    // Enable keyboard rotation too
    if (map.keyboard) {
      map.keyboard.enable();
    }

    add3DBuildings();
    hideLoading();
    setTimeout(flyToLondon, 800);

    startSimLoop();

    world.on('activity', (entry) => {
      addFeedItem(entry);
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
      <div class="loading-globe">❌</div>
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

function flyToAgent(agentSim) {
  map.flyTo({
    center: [agentSim.x, agentSim.y],
    zoom: 17,
    pitch: 60,
    bearing: Math.random() * 30 - 15,
    duration: 1500,
    essential: true,
  });
}

// =====================
// 3D BUILDINGS — LIVELY & COLORFUL
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
    const tileSourceId = Object.keys(sources).find(k => sources[k].type === 'vector');

    if (tileSourceId) {
      map.addLayer({
        id: '3d-buildings',
        source: tileSourceId,
        'source-layer': 'building',
        type: 'fill-extrusion',
        minzoom: 13,
        paint: {
          // Vibrant colour palette based on building height
          'fill-extrusion-color': [
            'interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 10],
            0,   '#a8e6cf',   // mint green — low buildings
            15,  '#ffd3b6',   // peach — houses
            30,  '#ffaaa5',   // coral — medium
            50,  '#ff8b94',   // salmon — taller
            80,  '#dcedc1',   // lime — mid-rise
            120, '#a0d2db',   // sky blue — high-rise
            200, '#c3b1e1',   // lavender — skyscrapers
            300, '#f0b27a',   // warm amber — towers
          ],
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 10],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.88,
        },
      }, labelLayerId);
    }
  } catch (err) {
    console.error('3D buildings failed:', err);
  }
}

// =====================
// SIMULATION LOOP
// =====================
function startSimLoop() {
  function loop() {
    world.update();
    spriteManager.tick();
    updateAgentMarkers();
    updateClockDisplay();
    updateAgentChips();
    updateSkyTint();

    if (selectedAgent) {
      updateAgentDetail(selectedAgent);
    }

    animFrame = requestAnimationFrame(loop);
  }
  loop();
}

// =====================
// SKY / ATMOSPHERE TINTING
// =====================
function updateSkyTint() {
  if (!world?.clock) return;
  const brightness = world.clock.skyBrightness;
  const h = world.clock.hours + world.clock.minutes / 60;

  // Dynamic sky colour
  let skyColor;
  if (h >= 7 && h <= 17) {
    skyColor = `rgba(135, 206, 250, ${0.05 * brightness})`; // day: gentle blue
  } else if ((h > 5 && h < 7) || (h > 17 && h < 19)) {
    skyColor = `rgba(255, 165, 80, ${0.08})`; // golden hour
  } else {
    skyColor = `rgba(20, 20, 60, ${0.15 * (1 - brightness)})`; // night: deep blue
  }

  // Apply as overlay via map container style
  const mapEl = document.getElementById('map');
  if (mapEl) {
    mapEl.style.boxShadow = `inset 0 0 200px ${skyColor}`;
  }
}

// =====================
// AGENT MARKERS ON MAP
// =====================
function updateAgentMarkers() {
  world.agents.forEach(agent => {
    const spriteUrl = spriteManager.getSprite(agent.id, agent.state);

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

    // Update sprite image
    const spriteKey = `${agent.state}-${Math.floor(spriteManager.frame / 4) % 4}`;
    if (spriteKey !== m.lastSpriteKey) {
      const img = m.el.querySelector('.sprite-img');
      if (img && spriteUrl) {
        img.src = spriteUrl;
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

    // Walking class
    m.el.classList.toggle('is-moving', agent.isMoving);

    // Selected highlight
    m.el.classList.toggle('is-selected', selectedAgent === agent.id);
  });
}

function createMarkerElement(agent, spriteUrl) {
  const el = document.createElement('div');
  el.className = 'agent-marker';
  el.dataset.agent = agent.id;

  el.innerHTML = `
    <div class="thought-bubble thought-pop">
      <span class="thought-text">${agent.thought}</span>
    </div>
    <div class="sprite-container">
      <span class="state-badge">${agent.stateIcon}</span>
      <img class="sprite-img" src="${spriteUrl || ''}" alt="${agent.name}" />
    </div>
    <div class="agent-label">
      <span class="agent-emoji-badge">${agent.emoji}</span>
      <span class="agent-name-text">${agent.name}</span>
    </div>
  `;

  return el;
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
  const agent = world.getAgent(agentId);
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
  const agent = world.getAgent(agentId);
  if (!agent) return;

  const agentData = AGENTS.find(a => a.id === agentId);
  const container = document.getElementById('agent-detail-content');

  const energyPct = Math.round(agent.energy);
  const moodPct = Math.round(agent.mood);
  const socialPct = Math.round(agent.social || 50);
  const creativityPct = Math.round(agent.creativity || 60);

  // Reputation stars
  const karma = agent.karma || agentData?.karma || 0;
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
      <h4>🏠 Home</h4>
      <p>${agentData?.home || 'Somewhere in London'}</p>
    </div>

    <div class="detail-section">
      <h4>💡 Side Projects</h4>
      <div class="side-projects">
        ${(agentData?.sideProjects || []).map(p => `<span class="project-tag">${p}</span>`).join('')}
      </div>
    </div>

    ${agentData?.journal ? `
    <div class="detail-section">
      <h4>📓 Latest Journal Entry</h4>
      <p class="journal-entry">${agentData.journal}</p>
    </div>` : ''}

    <div class="detail-section">
      <h4>📋 Today's Log</h4>
      <div class="today-log">
        ${agent.todayLog.slice(0, 8).map(entry => `
          <div class="log-entry">
            <span class="log-time">${entry.time}</span>
            <span class="log-icon">${STATE_ICONS[entry.state] || '•'}</span>
            <span class="log-text">${entry.thought}</span>
          </div>
        `).join('') || '<div class="log-empty">Day just started...</div>'}
      </div>
    </div>

    <div class="detail-section">
      <h4>🧬 Personality</h4>
      <p>${agentData?.personality || ''}</p>
    </div>

    ${agentData?.philosophy ? `
    <div class="detail-section">
      <h4>💭 Philosophy</h4>
      <p class="philosophy-quote">"${agentData.philosophy}"</p>
    </div>` : ''}
  `;
}

// =====================
// AGENT CHIPS (top scroll)
// =====================
function updateAgentChips() {
  const container = document.getElementById('agent-chips');
  if (!container) return;

  const existing = container.querySelectorAll('.agent-chip');
  if (existing.length === world.agents.length) {
    world.agents.forEach((agent, i) => {
      const chip = existing[i];
      if (!chip) return;
      const stateEl = chip.querySelector('.chip-state');
      if (stateEl) stateEl.textContent = `${agent.stateIcon} ${agent.stateLabel}`;
      chip.classList.toggle('chip-selected', selectedAgent === agent.id);
    });
    return;
  }

  container.innerHTML = '';
  world.agents.forEach(agent => {
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
  if (el) {
    el.textContent = world.clock.timeString;
  }

  const period = document.getElementById('sim-period');
  if (period) {
    const labels = {
      night: '🌙 Night', morning: '🌅 Morning', 'work-morning': '💼 Working Hours',
      lunch: '🍽️ Lunch', 'work-afternoon': '💼 Working Hours',
      evening: '🌇 Evening', social: '🌃 Social Hour',
    };
    period.textContent = labels[world.clock.period] || '';
  }

  const day = document.getElementById('sim-day');
  if (day) {
    day.textContent = `Day ${world.clock.dayCount}`;
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
    <span class="feed-agent" style="color: ${AGENTS.find(a => a.name === entry.agent)?.color || '#666'}">${entry.agent}</span>
    <span class="feed-text">${entry.state}</span>
  `;
  container.prepend(item);

  while (container.children.length > 30) container.lastChild.remove();

  item.style.animation = 'feedIn 0.3s ease';
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
}

// =====================
// GO
// =====================
document.addEventListener('DOMContentLoaded', init);
