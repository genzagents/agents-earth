/* === Main App Controller v3 === */

class AgentColonyApp {
  constructor() {
    this.canvas = document.getElementById('scene');
    this.mode = 'globe';
    this.clock = new THREE.Clock();
    this.authorized = false;

    this.initScene();
    this.initCamera();
    this.initRenderer();
    this.initLights();

    this.globe = new GlobeView(this.scene, this.camera);
    this.colony = new ColonyView(this.scene, this.camera);
    this.ui = new UIController();

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Click vs drag tracking
    this.mouseDownPos = { x: 0, y: 0 };
    this.mouseDownTime = 0;
    this.CLICK_THRESHOLD = 5;   // pixels of movement to distinguish click from drag
    this.CLICK_TIME = 300;       // max ms for a click

    this.ui.onAuthorized = (authData) => {
      this.authorized = true;
      this.colony.spawnAgents();
      this.ui.addFeedItem({
        time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        text: '🔑 Authorized — your agents are now visible'
      });
    };

    this.setupControls();
    this.setupEvents();
    this.animate();
  }

  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x0a0a1a);
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0a0a1a, 0.005);
  }

  initCamera() {
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 500);
    this.camera.position.set(0, 4, 16);
    this.camera.lookAt(0, 0, 0);
    this.orbitAngle = { theta: 0, phi: Math.PI / 6 };
    this.orbitRadius = 16;
    this.targetOrbitAngle = { theta: 0, phi: Math.PI / 6 };
    this.targetOrbitRadius = 16;
    this.panOffset = { x: 0, z: 0 };
    this.targetPanOffset = { x: 0, z: 0 };
  }

  initLights() {
    this.scene.add(new THREE.AmbientLight(0x444466, 0.6));
    const dir = new THREE.DirectionalLight(0x8888bb, 0.5);
    dir.position.set(10, 15, 10);
    this.scene.add(dir);
    const p = new THREE.PointLight(0x00f5ff, 0.2, 50);
    p.position.set(0, 12, 0);
    this.scene.add(p);
  }

  setupControls() {
    this.isDragging = false;
    this.isRightDrag = false;
    this.prevMouse = { x: 0, y: 0 };

    this.canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.isRightDrag = e.button === 2 || e.shiftKey;
      this.prevMouse = { x: e.clientX, y: e.clientY };
      this.mouseDownPos = { x: e.clientX, y: e.clientY };
      this.mouseDownTime = Date.now();
      document.body.classList.add('dragging');
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        const dx = e.clientX - this.prevMouse.x;
        const dy = e.clientY - this.prevMouse.y;

        if (this.isRightDrag && this.mode === 'colony') {
          const panSpeed = this.orbitRadius * 0.003;
          this.targetPanOffset.x -= dx * panSpeed * Math.cos(this.orbitAngle.theta) + dy * panSpeed * Math.sin(this.orbitAngle.theta) * 0.5;
          this.targetPanOffset.z += dx * panSpeed * Math.sin(this.orbitAngle.theta) - dy * panSpeed * Math.cos(this.orbitAngle.theta) * 0.5;
        } else {
          this.targetOrbitAngle.theta -= dx * 0.005;
          this.targetOrbitAngle.phi = Math.max(0.1, Math.min(Math.PI / 2.2, this.targetOrbitAngle.phi - dy * 0.005));
        }
        this.prevMouse = { x: e.clientX, y: e.clientY };
      }

      if (this.mode === 'colony') this.handleHover(e);
    });

    this.canvas.addEventListener('mouseup', (e) => {
      const dx = Math.abs(e.clientX - this.mouseDownPos.x);
      const dy = Math.abs(e.clientY - this.mouseDownPos.y);
      const dt = Date.now() - this.mouseDownTime;
      const wasClick = dx < this.CLICK_THRESHOLD && dy < this.CLICK_THRESHOLD && dt < this.CLICK_TIME;

      this.isDragging = false;
      document.body.classList.remove('dragging');

      if (wasClick) this.onClick(e);
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.isDragging = false;
      document.body.classList.remove('dragging');
      this.ui.hideDistrictTooltip();
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const minZ = this.mode === 'colony' ? 8 : 8;
      const maxZ = this.mode === 'colony' ? 55 : 25;
      this.targetOrbitRadius = Math.max(minZ, Math.min(maxZ, this.targetOrbitRadius + e.deltaY * 0.02));
    }, { passive: false });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Touch
    let touchDist = 0;
    let touchStart = { x: 0, y: 0, time: 0 };
    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        this.isDragging = true;
        this.prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, time: Date.now() };
      } else if (e.touches.length === 2) {
        touchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      }
    });
    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (e.touches.length === 1 && this.isDragging) {
        const dx = e.touches[0].clientX - this.prevMouse.x;
        const dy = e.touches[0].clientY - this.prevMouse.y;
        this.targetOrbitAngle.theta -= dx * 0.005;
        this.targetOrbitAngle.phi = Math.max(0.1, Math.min(Math.PI / 2.2, this.targetOrbitAngle.phi - dy * 0.005));
        this.prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        const nd = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        this.targetOrbitRadius = Math.max(8, Math.min(55, this.targetOrbitRadius - (nd - touchDist) * 0.05));
        touchDist = nd;
      }
    }, { passive: false });
    this.canvas.addEventListener('touchend', (e) => {
      if (e.changedTouches.length === 1) {
        const dx = Math.abs(e.changedTouches[0].clientX - touchStart.x);
        const dy = Math.abs(e.changedTouches[0].clientY - touchStart.y);
        const dt = Date.now() - touchStart.time;
        if (dx < this.CLICK_THRESHOLD && dy < this.CLICK_THRESHOLD && dt < this.CLICK_TIME) {
          this.onClick({ clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY });
        }
      }
      this.isDragging = false;
    });
  }

  setupEvents() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    document.getElementById('btn-globe').addEventListener('click', () => {
      if (this.mode === 'colony') this.transitionToGlobe();
    });
  }

  handleHover(e) {
    this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const hitboxes = this.colony.getDistrictMeshes().map(d => d.mesh);
    const intersects = this.raycaster.intersectObjects(hitboxes);

    if (intersects.length > 0) {
      this.ui.showDistrictTooltip(intersects[0].object.userData.district, e.clientX, e.clientY);
      this.canvas.style.cursor = 'pointer';
    } else {
      this.ui.hideDistrictTooltip();
      this.canvas.style.cursor = 'grab';
    }
  }

  onClick(e) {
    this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);

    if (this.mode === 'globe') {
      const marker = this.globe.getMarker();
      if (marker) {
        const intersects = this.raycaster.intersectObject(marker);
        if (intersects.length > 0) { this.transitionToColony(); return; }
      }
    } else if (this.mode === 'colony') {
      // Agents first
      if (this.authorized) {
        const agentMeshes = this.colony.getAgentMeshes();
        for (let i = 0; i < agentMeshes.length; i++) {
          if (!agentMeshes[i].visible) continue;
          const hits = this.raycaster.intersectObjects(agentMeshes[i].children, true);
          if (hits.length > 0) { this.ui.showAgentPanel(AGENTS[i]); return; }
        }
      }

      // Districts
      const hitboxes = this.colony.getDistrictMeshes().map(d => d.mesh);
      const districtHits = this.raycaster.intersectObjects(hitboxes);
      if (districtHits.length > 0) {
        const district = districtHits[0].object.userData.district;
        if (!district.claimed) {
          this.ui.showClaimModal(district);
        } else {
          this.targetPanOffset.x = district.x;
          this.targetPanOffset.z = district.z;
          this.targetOrbitRadius = 12;
        }
        return;
      }
      this.ui.hideAgentPanel();
    }
  }

  transitionToColony() {
    if (this.mode === 'transitioning') return;
    this.mode = 'transitioning';
    this.ui.hideHint();
    this.ui.setLocation('London Colony 🇬🇧 — ' + LONDON_DISTRICTS.length + ' Districts');

    const duration = 1500;
    const start = Date.now();
    const animate = () => {
      const t = Math.min((Date.now() - start) / duration, 1);
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      this.globe.group.traverse(c => {
        if (c.material && c.material.transparent) c.material.opacity *= (1 - ease * 0.05);
      });
      if (t < 1) { requestAnimationFrame(animate); }
      else {
        this.globe.hide();
        this.colony.show();
        this.mode = 'colony';
        this.targetOrbitAngle = { theta: -0.15, phi: Math.PI / 3.5 };
        this.targetOrbitRadius = 35;
        this.targetPanOffset = { x: 0, z: 0 };
        this.ui.showColonyUI();
        // Auto-show agents for demo
        if (!this.authorized) {
          this.authorized = true;
          this.colony.spawnAgents();
        }
      }
    };
    animate();
  }

  transitionToGlobe() {
    if (this.mode === 'transitioning') return;
    this.mode = 'transitioning';
    this.ui.hideColonyUI();
    this.ui.setLocation('Earth');
    this.colony.hide();
    this.globe.show();
    this.targetOrbitAngle = { theta: 0, phi: Math.PI / 6 };
    this.targetOrbitRadius = 16;
    this.targetPanOffset = { x: 0, z: 0 };
    this.mode = 'globe';
    this.ui.showHint();
  }

  updateCamera() {
    this.orbitAngle.theta += (this.targetOrbitAngle.theta - this.orbitAngle.theta) * 0.06;
    this.orbitAngle.phi += (this.targetOrbitAngle.phi - this.orbitAngle.phi) * 0.06;
    this.orbitRadius += (this.targetOrbitRadius - this.orbitRadius) * 0.06;
    this.panOffset.x += (this.targetPanOffset.x - this.panOffset.x) * 0.06;
    this.panOffset.z += (this.targetPanOffset.z - this.panOffset.z) * 0.06;

    const lookY = this.mode === 'colony' ? 1 : 0;
    this.camera.position.x = this.panOffset.x + this.orbitRadius * Math.sin(this.orbitAngle.phi) * Math.sin(this.orbitAngle.theta);
    this.camera.position.y = this.orbitRadius * Math.cos(this.orbitAngle.phi);
    this.camera.position.z = this.panOffset.z + this.orbitRadius * Math.sin(this.orbitAngle.phi) * Math.cos(this.orbitAngle.theta);
    this.camera.lookAt(this.panOffset.x, lookY, this.panOffset.z);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const time = this.clock.getElapsedTime();
    this.updateCamera();
    this.globe.update(time);
    this.colony.update(time);
    this.renderer.render(this.scene, this.camera);
  }
}

window.addEventListener('DOMContentLoaded', () => { window.app = new AgentColonyApp(); });
