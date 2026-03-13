/* === AgentColony — MapTiler App v2 === */

const MAPTILER_KEY = '1VCJ1EgPTE2txzvkUYAU';
const LONDON = { lng: -0.0918, lat: 51.5074 };

// State
let map;
let agentsVisible = true;  // Agents visible by default now
let buildings3D = true;
let feedInterval;
let agentMarkers = [];
let agentAnimationFrame;

// =====================
// INIT
// =====================
function init() {
  maptilersdk.config.apiKey = MAPTILER_KEY;

  try {
    map = new maptilersdk.Map({
      container: 'map',
      style: `https://api.maptiler.com/maps/satellite/style.json?key=${MAPTILER_KEY}`,
      center: [0, 20],
      zoom: 1.5,
      pitch: 0,
      bearing: 0,
      projection: 'globe',
      maxPitch: 85,
      antialias: true,
      hash: false,
      dragRotate: true,
      touchZoomRotate: true,
      touchPitch: true,
      keyboard: true,
      scrollZoom: true,
      boxZoom: true,
      doubleClickZoom: true,
      dragPan: true,
    });
  } catch (err) {
    console.error('Map init failed:', err);
    showLoadError(err.message);
    return;
  }

  // Enable right-click drag to rotate/pitch
  map.dragRotate.enable();
  map.touchZoomRotate.enable();
  map.touchPitch.enable();

  map.on('load', () => {
    console.log('Map loaded');

    add3DBuildings();
    addDistrictMarkers();
    addAgentMarkers();
    updateAgentSidebar();
    hideLoading();

    // Globe → fly to London
    setTimeout(flyToLondon, 1200);

    startActivityFeed();
    startAgentMovement();
  });

  map.on('error', (e) => {
    console.error('Map error:', e);
    hideLoading();
  });

  // Timeout fallback
  setTimeout(() => {
    const loading = document.getElementById('loading');
    if (loading && loading.style.display !== 'none') {
      console.warn('Map load timeout');
      hideLoading();
    }
  }, 10000);

  bindUI();
}

function showLoadError(msg) {
  document.getElementById('loading').innerHTML = `
    <div class="loading-content">
      <div class="loading-globe">❌</div>
      <h1>Map Failed to Load</h1>
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
    zoom: 16,
    pitch: 60,
    bearing: -20,
    duration: 5000,
    essential: true,
    curve: 1.8,
  });
}

function flyToGlobe() {
  map.flyTo({ center: [0, 20], zoom: 1.5, pitch: 0, bearing: 0, duration: 3000, essential: true });
}

function flyToCoords(lng, lat) {
  map.flyTo({
    center: [lng, lat],
    zoom: 17,
    pitch: 65,
    bearing: Math.random() * 40 - 20,
    duration: 2000,
    essential: true,
  });
}

// =====================
// 3D BUILDINGS
// =====================
function add3DBuildings() {
  try {
    const style = map.getStyle();
    if (!style || !style.layers) return;

    let labelLayerId;
    for (const layer of style.layers) {
      if (layer.type === 'symbol' && layer.layout && layer.layout['text-field']) {
        labelLayerId = layer.id;
        break;
      }
    }

    const sources = style.sources || {};
    const tileSourceId = Object.keys(sources).find(k => sources[k].type === 'vector');

    if (!tileSourceId) {
      // For pure satellite, add OpenMapTiles as separate source
      map.addSource('openmaptiles', {
        type: 'vector',
        url: `https://api.maptiler.com/tiles/v3/tiles.json?key=${MAPTILER_KEY}`,
      });

      map.addLayer({
        id: '3d-buildings',
        source: 'openmaptiles',
        'source-layer': 'building',
        type: 'fill-extrusion',
        minzoom: 13,
        paint: {
          'fill-extrusion-color': [
            'interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 10],
            0, '#d4d8e0',
            50, '#b8c0d0',
            150, '#9aa8c0',
            300, '#7888a8',
          ],
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 10],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.75,
        },
      });
    } else {
      map.addLayer(
        {
          id: '3d-buildings',
          source: tileSourceId,
          'source-layer': 'building',
          type: 'fill-extrusion',
          minzoom: 13,
          paint: {
            'fill-extrusion-color': [
              'interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 10],
              0, '#d4d8e0',
              50, '#b8c0d0',
              150, '#9aa8c0',
              300, '#7888a8',
            ],
            'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 10],
            'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
            'fill-extrusion-opacity': 0.75,
          },
        },
        labelLayerId
      );
    }
    console.log('3D buildings added');
  } catch (err) {
    console.error('3D buildings failed:', err);
  }
}

function toggle3DBuildings() {
  buildings3D = !buildings3D;
  if (map.getLayer('3d-buildings')) {
    map.setLayoutProperty('3d-buildings', 'visibility', buildings3D ? 'visible' : 'none');
  }
  document.getElementById('btn-3d').classList.toggle('active', buildings3D);
}

// =====================
// DISTRICT MARKERS
// =====================
function addDistrictMarkers() {
  DISTRICTS.forEach(district => {
    const color = DISTRICT_TYPE_COLORS[district.type] || '#6b7280';

    const el = document.createElement('div');
    el.className = 'district-marker';
    el.innerHTML = `
      <div class="marker-dot" style="background: ${color}; box-shadow: 0 0 8px ${color}40;"></div>
      <div class="marker-label">${district.name}</div>
    `;
    if (district.claimed) el.classList.add('claimed');

    new maptilersdk.Marker({ element: el, anchor: 'center' })
      .setLngLat(district.center)
      .addTo(map);

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      district.claimed ? showDistrictPanel(district) : showClaimModal(district);
      flyToCoords(district.center[0], district.center[1]);
    });
  });
}

// =====================
// AGENT MARKERS — Human-like SVG figures
// =====================
function createAgentSVG(agent) {
  const statusInfo = STATUS_DISPLAY[agent.status] || STATUS_DISPLAY.offline;
  const color = agent.color;

  // Human-like figure as SVG
  return `
    <svg width="48" height="72" viewBox="0 0 48 72" xmlns="http://www.w3.org/2000/svg" class="agent-figure">
      <!-- Shadow -->
      <ellipse cx="24" cy="69" rx="12" ry="3" fill="rgba(0,0,0,0.2)" />

      <!-- Legs -->
      <rect x="16" y="48" width="5" height="16" rx="2" fill="${color}" opacity="0.85" class="agent-leg-left" />
      <rect x="27" y="48" width="5" height="16" rx="2" fill="${color}" opacity="0.85" class="agent-leg-right" />

      <!-- Body -->
      <rect x="12" y="28" width="24" height="22" rx="5" fill="${color}" />

      <!-- Arms -->
      <rect x="4" y="30" width="5" height="16" rx="2.5" fill="${color}" opacity="0.85" class="agent-arm-left" />
      <rect x="39" y="30" width="5" height="16" rx="2.5" fill="${color}" opacity="0.85" class="agent-arm-right" />

      <!-- Head -->
      <circle cx="24" cy="18" r="12" fill="${color}" />
      <circle cx="24" cy="18" r="10" fill="white" opacity="0.15" />

      <!-- Face -->
      <circle cx="20" cy="16" r="1.5" fill="white" />
      <circle cx="28" cy="16" r="1.5" fill="white" />
      <path d="M20 22 Q24 25 28 22" stroke="white" stroke-width="1.2" fill="none" stroke-linecap="round" />

      <!-- Emoji badge on chest -->
      <text x="24" y="43" text-anchor="middle" font-size="11">${agent.emoji}</text>

      <!-- Status indicator -->
      <circle cx="38" cy="10" r="5" fill="${statusInfo.color}" stroke="white" stroke-width="2" class="status-pulse" />
    </svg>
  `;
}

function addAgentMarkers() {
  removeAgentMarkers();

  AGENTS.forEach(agent => {
    const el = document.createElement('div');
    el.className = 'agent-marker-container';
    el.innerHTML = `
      ${createAgentSVG(agent)}
      <div class="agent-name-tag">${agent.name}</div>
    `;

    const marker = new maptilersdk.Marker({ element: el, anchor: 'bottom' })
      .setLngLat(agent.coords)
      .addTo(map);

    agentMarkers.push({ marker, agent, el });

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      showAgentPanel(agent);
      flyToCoords(agent.coords[0], agent.coords[1]);
    });
  });
}

function removeAgentMarkers() {
  agentMarkers.forEach(({ marker }) => marker.remove());
  agentMarkers = [];
}

// Subtle idle movement — agents shift slightly to look alive
function startAgentMovement() {
  function animate() {
    const now = Date.now();
    agentMarkers.forEach(({ marker, agent }, i) => {
      // Tiny oscillation around home position
      const offset = Math.sin(now / 3000 + i * 1.5) * 0.00008;
      const offset2 = Math.cos(now / 4000 + i * 2) * 0.00006;
      marker.setLngLat([
        agent.coords[0] + offset,
        agent.coords[1] + offset2,
      ]);
    });
    agentAnimationFrame = requestAnimationFrame(animate);
  }
  animate();
}

function updateAgentSidebar() {
  const list = document.getElementById('agent-list');
  list.innerHTML = '';

  AGENTS.forEach(agent => {
    const statusInfo = STATUS_DISPLAY[agent.status] || STATUS_DISPLAY.offline;
    const item = document.createElement('div');
    item.className = 'agent-sidebar-item';
    item.innerHTML = `
      <span class="agent-sidebar-emoji">${agent.emoji}</span>
      <div class="agent-sidebar-info">
        <div class="agent-sidebar-name">${agent.name}</div>
        <div class="agent-sidebar-status" style="color: ${statusInfo.color}">${statusInfo.dot} ${agent.statusText}</div>
      </div>
    `;
    item.addEventListener('click', () => {
      flyToCoords(agent.coords[0], agent.coords[1]);
      showAgentPanel(agent);
    });
    list.appendChild(item);
  });
}

// =====================
// PANELS & MODALS
// =====================
function showDistrictPanel(district) {
  const panel = document.getElementById('district-panel');
  const content = document.getElementById('panel-content');
  const agents = AGENTS.filter(a => a.district === district.id);

  content.innerHTML = `
    <div class="panel-district-type" style="color: ${DISTRICT_TYPE_COLORS[district.type]}">${district.type.toUpperCase()}</div>
    <h2>${district.name}</h2>
    <p class="panel-desc">${district.desc}</p>
    <div class="panel-meta">
      <span>📍 ${district.landmark}</span>
      ${district.claimed ? `<span class="panel-owner">👤 ${district.owner}</span>` : '<span class="panel-unclaimed">🏗️ Unclaimed</span>'}
    </div>
    ${agents.length > 0 ? `
      <div class="panel-agents">
        <h4>Agents in district</h4>
        ${agents.map(a => {
          const s = STATUS_DISPLAY[a.status];
          return `<div class="panel-agent-item" onclick="showAgentPanel(AGENTS.find(x=>x.id==='${a.id}'))">
            <span>${a.emoji} ${a.name}</span>
            <span style="color:${s.color}">${s.dot} ${s.label}</span>
          </div>`;
        }).join('')}
      </div>
    ` : ''}
  `;
  panel.classList.remove('hidden');
}

function showAgentPanel(agent) {
  const panel = document.getElementById('district-panel');
  const content = document.getElementById('panel-content');
  const statusInfo = STATUS_DISPLAY[agent.status] || STATUS_DISPLAY.offline;

  content.innerHTML = `
    <div class="panel-agent-header">
      <span class="panel-agent-emoji">${agent.emoji}</span>
      <div>
        <h2>${agent.name}</h2>
        <div class="panel-agent-role">${agent.role}</div>
      </div>
    </div>
    <div class="panel-agent-status" style="color: ${statusInfo.color}">
      <span class="status-dot-live" style="background: ${statusInfo.color}"></span>
      ${statusInfo.label} — ${agent.statusText}
    </div>
    <p class="panel-desc">${agent.desc}</p>
    <div class="panel-meta">
      <span>📍 ${DISTRICTS.find(d => d.id === agent.district)?.name || agent.district}</span>
    </div>
    <div class="panel-recent-activity">
      <h4>Recent Activity</h4>
      ${agent.activities.slice(0, 4).map(a => `<div class="activity-line">${a}</div>`).join('')}
    </div>
  `;
  panel.classList.remove('hidden');
}

function showClaimModal(district) {
  const modal = document.getElementById('claim-modal');
  document.getElementById('claim-district-name').textContent = `📍 ${district.name} — ${district.landmark}`;

  const yaml = `# colony.yaml — ${district.name}
district: ${district.id}
owner:
  name: "Your Name"
  github: "yourusername"

agents:
  - name: "YourAgent"
    emoji: "🤖"
    role: "What does it do?"
    status: live
    coords: [${district.center[0]}, ${district.center[1]}]

auth:
  code: "YOUR-CODE-HERE"
  viewers: ["*"]`;

  document.getElementById('claim-yaml').textContent = yaml;
  modal.classList.remove('hidden');
}

// =====================
// ACTIVITY FEED
// =====================
function startActivityFeed() {
  const container = document.getElementById('feed-items');
  for (let i = 0; i < 4; i++) addFeedItem(container);
  feedInterval = setInterval(() => addFeedItem(container), 6000);
}

function addFeedItem(container) {
  const { time, text } = getRandomActivity();
  const item = document.createElement('div');
  item.className = 'feed-item';
  item.innerHTML = `<span class="feed-time">${time}</span>${text}`;
  container.prepend(item);
  while (container.children.length > 10) container.lastChild.remove();
}

// =====================
// UI BINDINGS
// =====================
function bindUI() {
  document.getElementById('btn-globe').addEventListener('click', () => {
    flyToGlobe();
    setTimeout(flyToLondon, 4000);
  });

  document.getElementById('btn-agents').addEventListener('click', () => {
    agentsVisible = !agentsVisible;
    if (agentsVisible) {
      addAgentMarkers();
      document.getElementById('agent-sidebar').classList.remove('hidden');
    } else {
      removeAgentMarkers();
      document.getElementById('agent-sidebar').classList.add('hidden');
    }
  });

  document.getElementById('btn-3d').addEventListener('click', toggle3DBuildings);

  document.getElementById('panel-close').addEventListener('click', () => {
    document.getElementById('district-panel').classList.add('hidden');
  });

  // Auth modal (keep for future use)
  document.getElementById('auth-submit')?.addEventListener('click', () => {
    document.getElementById('auth-modal').classList.add('hidden');
  });
  document.getElementById('auth-cancel')?.addEventListener('click', () => {
    document.getElementById('auth-modal').classList.add('hidden');
  });

  // Claim modal
  document.getElementById('claim-copy').addEventListener('click', () => {
    const yaml = document.getElementById('claim-yaml').textContent;
    navigator.clipboard.writeText(yaml).then(() => {
      document.getElementById('claim-copy').textContent = '✅ Copied!';
      setTimeout(() => { document.getElementById('claim-copy').textContent = '📋 Copy YAML'; }, 2000);
    });
  });
  document.getElementById('claim-close').addEventListener('click', () => {
    document.getElementById('claim-modal').classList.add('hidden');
  });
}

// =====================
// GO
// =====================
document.addEventListener('DOMContentLoaded', init);
