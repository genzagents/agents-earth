/* === UI Controller === */

class UIController {
  constructor() {
    this.feedEl = document.getElementById('feed-items');
    this.panelEl = document.getElementById('agent-panel');
    this.hintEl = document.getElementById('click-hint');
    this.locationEl = document.getElementById('location-text');
    this.statsEl = document.getElementById('colony-stats');
    this.minimapEl = document.getElementById('minimap');
    this.tooltipEl = document.getElementById('district-tooltip');
    this.authModal = document.getElementById('auth-modal');
    this.claimModal = document.getElementById('claim-modal');

    this.setupEventListeners();
    this.startActivityFeed();
  }

  setupEventListeners() {
    document.getElementById('panel-close').addEventListener('click', () => this.hideAgentPanel());
    document.getElementById('auth-close').addEventListener('click', () => this.hideAuthModal());
    document.getElementById('claim-close').addEventListener('click', () => this.hideClaimModal());

    document.getElementById('btn-auth').addEventListener('click', () => this.showAuthModal());

    document.getElementById('auth-submit').addEventListener('click', () => {
      const code = document.getElementById('auth-code').value.trim().toUpperCase();
      if (AUTH_CODES[code]) {
        this.hideAuthModal();
        this.onAuthorized(AUTH_CODES[code]);
      } else {
        document.getElementById('auth-code').style.borderColor = '#ff3b3b';
        setTimeout(() => { document.getElementById('auth-code').style.borderColor = ''; }, 1500);
      }
    });

    // Enter key for auth
    document.getElementById('auth-code').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('auth-submit').click();
    });
  }

  // Callback set by main.js
  onAuthorized(authData) {}

  showAgentPanel(agent) {
    document.getElementById('panel-emoji').textContent = agent.emoji;
    document.getElementById('panel-name').textContent = agent.name;
    document.getElementById('panel-role').textContent = agent.role;
    document.getElementById('panel-status-text').textContent = agent.status;
    document.getElementById('panel-desc').textContent = agent.desc;
    document.getElementById('panel-building').textContent =
      agent.building === 'office' ? '📍 Works at HQ — City of London' : '📍 Colony Housing — City of London';
    this.panelEl.classList.remove('hidden');
  }

  hideAgentPanel() { this.panelEl.classList.add('hidden'); }

  showDistrictTooltip(district, mouseX, mouseY) {
    const nameEl = document.getElementById('district-name');
    nameEl.textContent = district.name;
    const statusEl = document.getElementById('district-status');
    if (district.claimed) {
      statusEl.textContent = `✅ Claimed by ${district.owner}`;
      statusEl.className = 'claimed';
    } else {
      statusEl.innerHTML = `📍 ${district.landmark || ''}<br>🔓 Unclaimed — click to claim`;
      statusEl.className = 'unclaimed';
    }
    // Keep tooltip on screen
    const tx = Math.min(mouseX + 15, window.innerWidth - 250);
    const ty = Math.min(mouseY - 10, window.innerHeight - 80);
    this.tooltipEl.style.left = tx + 'px';
    this.tooltipEl.style.top = ty + 'px';
    this.tooltipEl.classList.remove('hidden');
  }

  hideDistrictTooltip() { this.tooltipEl.classList.add('hidden'); }

  showClaimModal(district) {
    document.getElementById('claim-district').textContent = `📍 ${district.name} — ${district.type}`;
    document.getElementById('claim-yaml').textContent =
`owner:
  name: "Your Name"
  github: "yourusername"
  location: "${district.name}, London"

agents:
  - name: "YourAgent"
    emoji: "🤖"
    role: "Your agent's role"
    type: "worker"
    building: "office"

plot:
  city: "london"
  district: "${district.id}"
  size: "small"`;
    this.claimModal.classList.remove('hidden');
  }

  hideClaimModal() { this.claimModal.classList.add('hidden'); }
  showAuthModal() { this.authModal.classList.remove('hidden'); document.getElementById('auth-code').focus(); }
  hideAuthModal() { this.authModal.classList.add('hidden'); }

  setLocation(text) { this.locationEl.textContent = text; }

  showHint() { this.hintEl.classList.remove('hidden'); }
  hideHint() { this.hintEl.classList.add('hidden'); }
  showStats() { this.statsEl.classList.remove('hidden'); }
  hideStats() { this.statsEl.classList.add('hidden'); }
  showMinimap() { this.minimapEl.classList.remove('hidden'); this.drawMinimap(); }
  hideMinimap() { this.minimapEl.classList.add('hidden'); }

  showColonyUI() {
    document.getElementById('btn-globe').classList.remove('hidden');
    document.getElementById('btn-auth').classList.remove('hidden');
    this.showStats();
    this.showMinimap();
  }
  hideColonyUI() {
    document.getElementById('btn-globe').classList.add('hidden');
    document.getElementById('btn-auth').classList.add('hidden');
    this.hideStats();
    this.hideMinimap();
    this.hideAgentPanel();
    this.hideDistrictTooltip();
  }

  drawMinimap() {
    const canvas = document.getElementById('minimap-canvas');
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#f0f0f5';
    ctx.fillRect(0, 0, w, h);

    const scale = 3.5;
    const ox = w / 2;
    const oz = h / 2 - 10;

    // Thames
    ctx.beginPath();
    ctx.strokeStyle = '#93c5fd';
    ctx.lineWidth = 3;
    THAMES_PATH.forEach((p, i) => {
      const sx = ox + p.x * scale;
      const sy = oz + p.z * scale;
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.stroke();

    // Districts
    LONDON_DISTRICTS.forEach(d => {
      const sx = ox + (d.x - d.w / 2) * scale;
      const sy = oz + (d.z - d.d / 2) * scale;
      const sw = d.w * scale;
      const sh = d.d * scale;
      ctx.fillStyle = d.claimed ? 'rgba(37, 99, 235, 0.3)' : 'rgba(180, 180, 200, 0.4)';
      ctx.fillRect(sx, sy, sw, sh);
      ctx.strokeStyle = d.claimed ? 'rgba(37, 99, 235, 0.6)' : 'rgba(150, 150, 170, 0.4)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(sx, sy, sw, sh);
    });
  }

  addFeedItem(item) {
    const el = document.createElement('div');
    el.className = 'feed-item';
    el.innerHTML = `<span class="feed-time">${item.time}</span>${item.text}`;
    this.feedEl.insertBefore(el, this.feedEl.firstChild);
    while (this.feedEl.children.length > 8) {
      this.feedEl.removeChild(this.feedEl.lastChild);
    }
  }

  startActivityFeed() {
    for (let i = 0; i < 3; i++) this.addFeedItem(generateActivity());
    setInterval(() => this.addFeedItem(generateActivity()), 5000 + Math.random() * 3000);
  }
}
