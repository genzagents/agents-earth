/* === AgentColony — MapTiler App === */

const MAPTILER_KEY = '1VCJ1EgPTE2txzvkUYAU';

// London center
const LONDON = { lng: -0.0918, lat: 51.5074 };

// State
let map;
let agentsVisible = false;
let buildings3D = true;
let authorized = false;
let authorizedAgents = [];
let feedInterval;

// =====================
// INIT
// =====================
function init() {
  maptilersdk.config.apiKey = MAPTILER_KEY;

  map = new maptilersdk.Map({
    container: 'map',
    style: maptilersdk.MapStyle.SATELLITE.HYBRID,
    center: [0, 20],
    zoom: 1.5,
    pitch: 0,
    bearing: 0,
    projection: 'globe',
    maxPitch: 85,
    antialias: true,
    hash: false,
  });

  map.on('load', () => {
    // Add 3D buildings
    add3DBuildings();

    // Add district markers
    addDistrictMarkers();

    // Hide loading screen
    setTimeout(() => {
      document.getElementById('loading').style.opacity = '0';
      setTimeout(() => {
        document.getElementById('loading').style.display = 'none';
      }, 600);
    }, 500);

    // Fly to London after a beat
    setTimeout(flyToLondon, 1200);

    // Start activity feed
    startActivityFeed();
  });

  // Bind UI
  bindUI();
}

// =====================
// CAMERA ANIMATION
// =====================
function flyToLondon() {
  map.flyTo({
    center: [LONDON.lng, LONDON.lat],
    zoom: 15,
    pitch: 60,
    bearing: -20,
    duration: 5000,
    essential: true,
    curve: 1.8,
  });
}

function flyToGlobe() {
  map.flyTo({
    center: [0, 20],
    zoom: 1.5,
    pitch: 0,
    bearing: 0,
    duration: 3000,
    essential: true,
  });
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
  const layers = map.getStyle().layers;

  // Find the label layer to insert 3D buildings below
  let labelLayerId;
  for (const layer of layers) {
    if (layer.type === 'symbol' && layer.layout && layer.layout['text-field']) {
      labelLayerId = layer.id;
      break;
    }
  }

  // Check if openmaptiles source exists (MapTiler satellite hybrid includes it)
  const sources = map.getStyle().sources;
  const tileSourceId = Object.keys(sources).find(
    k => sources[k].type === 'vector'
  );

  if (!tileSourceId) {
    console.warn('No vector tile source found for 3D buildings');
    return;
  }

  map.addLayer(
    {
      id: '3d-buildings',
      source: tileSourceId,
      'source-layer': 'building',
      type: 'fill-extrusion',
      minzoom: 13,
      paint: {
        'fill-extrusion-color': [
          'interpolate', ['linear'], ['get', 'render_height'],
          0, '#e0e0e0',
          50, '#c0c8d8',
          150, '#a0b0c8',
          300, '#8090b0',
        ],
        'fill-extrusion-height': ['get', 'render_height'],
        'fill-extrusion-base': ['get', 'render_min_height'],
        'fill-extrusion-opacity': 0.85,
      },
    },
    labelLayerId
  );
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
    
    // Create marker element
    const el = document.createElement('div');
    el.className = 'district-marker';
    el.innerHTML = `
      <div class="marker-dot" style="background: ${color}; box-shadow: 0 0 8px ${color}40;"></div>
      <div class="marker-label">${district.name}</div>
    `;
    
    if (district.claimed) {
      el.classList.add('claimed');
      el.querySelector('.marker-dot').style.boxShadow = `0 0 12px ${color}80`;
    }

    const marker = new maptilersdk.Marker({ element: el, anchor: 'center' })
      .setLngLat(district.center)
      .addTo(map);

    // Click handler
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (district.claimed) {
        showDistrictPanel(district);
      } else {
        showClaimModal(district);
      }
      flyToCoords(district.center[0], district.center[1]);
    });
  });
}

// =====================
// AGENT MARKERS
// =====================
function addAgentMarkers() {
  // Remove existing agent markers
  document.querySelectorAll('.agent-marker-container').forEach(el => el.remove());

  const visibleAgents = authorized ? AGENTS.filter(a => authorizedAgents.includes(a.name)) : [];

  visibleAgents.forEach(agent => {
    const statusInfo = STATUS_DISPLAY[agent.status] || STATUS_DISPLAY.offline;
    
    const el = document.createElement('div');
    el.className = 'agent-marker-container';
    el.innerHTML = `
      <div class="agent-marker" style="border-color: ${agent.color}">
        <span class="agent-emoji">${agent.emoji}</span>
        <span class="agent-status-dot" style="background: ${statusInfo.color}"></span>
      </div>
      <div class="agent-name-label">${agent.name}</div>
    `;

    new maptilersdk.Marker({ element: el, anchor: 'bottom' })
      .setLngLat(agent.coords)
      .addTo(map);

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      showAgentPanel(agent);
      flyToCoords(agent.coords[0], agent.coords[1]);
    });
  });

  // Update agent sidebar
  updateAgentSidebar(visibleAgents);
}

function removeAgentMarkers() {
  document.querySelectorAll('.agent-marker-container').forEach(el => el.remove());
}

function updateAgentSidebar(visibleAgents) {
  const list = document.getElementById('agent-list');
  list.innerHTML = '';

  if (visibleAgents.length === 0) {
    list.innerHTML = '<div class="sidebar-empty">No agents visible. Enter auth code to see agents.</div>';
    return;
  }

  visibleAgents.forEach(agent => {
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

  const agents = authorized
    ? AGENTS.filter(a => a.district === district.id && authorizedAgents.includes(a.name))
    : [];

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
  viewers: ["*"]  # or specific GitHub usernames`;

  document.getElementById('claim-yaml').textContent = yaml;
  modal.classList.remove('hidden');
}

function showAuthModal() {
  document.getElementById('auth-modal').classList.remove('hidden');
  document.getElementById('auth-input').focus();
}

function handleAuth() {
  const code = document.getElementById('auth-input').value.trim().toUpperCase();
  const entry = AUTH_CODES[code];

  if (entry) {
    authorized = true;
    authorizedAgents = entry.agents;
    document.getElementById('auth-modal').classList.add('hidden');
    document.getElementById('auth-input').value = '';
    addAgentMarkers();
    agentsVisible = true;
    document.getElementById('agent-sidebar').classList.remove('hidden');
  } else {
    document.getElementById('auth-input').style.borderColor = '#dc2626';
    document.getElementById('auth-input').value = '';
    document.getElementById('auth-input').placeholder = 'Invalid code — try again';
    setTimeout(() => {
      document.getElementById('auth-input').style.borderColor = '';
      document.getElementById('auth-input').placeholder = 'e.g. NOVA-2026';
    }, 2000);
  }
}

// =====================
// ACTIVITY FEED
// =====================
function startActivityFeed() {
  const container = document.getElementById('feed-items');

  // Initial items
  for (let i = 0; i < 4; i++) {
    addFeedItem(container);
  }

  // Add new items periodically
  feedInterval = setInterval(() => addFeedItem(container), 6000);
}

function addFeedItem(container) {
  const { time, text } = getRandomActivity();
  const item = document.createElement('div');
  item.className = 'feed-item';
  item.innerHTML = `<span class="feed-time">${time}</span>${text}`;
  container.prepend(item);

  // Keep max 10 items
  while (container.children.length > 10) {
    container.lastChild.remove();
  }
}

// =====================
// UI BINDINGS
// =====================
function bindUI() {
  // Globe button
  document.getElementById('btn-globe').addEventListener('click', () => {
    flyToGlobe();
    setTimeout(flyToLondon, 4000);
  });

  // Agents button
  document.getElementById('btn-agents').addEventListener('click', () => {
    if (!authorized) {
      showAuthModal();
      return;
    }
    agentsVisible = !agentsVisible;
    if (agentsVisible) {
      addAgentMarkers();
      document.getElementById('agent-sidebar').classList.remove('hidden');
    } else {
      removeAgentMarkers();
      document.getElementById('agent-sidebar').classList.add('hidden');
    }
  });

  // 3D button
  document.getElementById('btn-3d').addEventListener('click', toggle3DBuildings);

  // Panel close
  document.getElementById('panel-close').addEventListener('click', () => {
    document.getElementById('district-panel').classList.add('hidden');
  });

  // Auth modal
  document.getElementById('auth-submit').addEventListener('click', handleAuth);
  document.getElementById('auth-cancel').addEventListener('click', () => {
    document.getElementById('auth-modal').classList.add('hidden');
  });
  document.getElementById('auth-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAuth();
  });

  // Claim modal
  document.getElementById('claim-copy').addEventListener('click', () => {
    const yaml = document.getElementById('claim-yaml').textContent;
    navigator.clipboard.writeText(yaml).then(() => {
      document.getElementById('claim-copy').textContent = '✅ Copied!';
      setTimeout(() => {
        document.getElementById('claim-copy').textContent = '📋 Copy YAML';
      }, 2000);
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
