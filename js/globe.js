/* === Globe View — Realistic === */

class GlobeView {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.marker = null;
    this.markerPulse = null;
    this.visible = true;
    this.init();
  }

  init() {
    // Earth — realistic blue marble look
    const earthGeo = new THREE.SphereGeometry(5, 128, 128);
    const earthMat = new THREE.MeshPhongMaterial({
      color: 0x2244aa,
      emissive: 0x112244,
      specular: 0x446688,
      shininess: 25,
      transparent: false,
    });
    this.earth = new THREE.Mesh(earthGeo, earthMat);
    this.group.add(this.earth);

    // Ocean sheen layer
    const sheenGeo = new THREE.SphereGeometry(5.005, 128, 128);
    const sheenMat = new THREE.MeshPhongMaterial({
      color: 0x3366cc,
      transparent: true,
      opacity: 0.3,
      specular: 0xffffff,
      shininess: 80,
    });
    this.group.add(new THREE.Mesh(sheenGeo, sheenMat));

    // Atmosphere — realistic blue haze
    const atmosGeo = new THREE.SphereGeometry(5.15, 64, 64);
    const atmosMat = new THREE.MeshBasicMaterial({
      color: 0x88bbff,
      transparent: true,
      opacity: 0.08,
      side: THREE.BackSide,
    });
    this.group.add(new THREE.Mesh(atmosGeo, atmosMat));

    // Second atmosphere layer for depth
    const atmos2Geo = new THREE.SphereGeometry(5.3, 64, 64);
    const atmos2Mat = new THREE.MeshBasicMaterial({
      color: 0x6699dd,
      transparent: true,
      opacity: 0.04,
      side: THREE.BackSide,
    });
    this.group.add(new THREE.Mesh(atmos2Geo, atmos2Mat));

    this.drawContinents();
    this.addClouds();
    this.addMarker(51.5074, -0.1278);
    this.addStars();
  }

  drawContinents() {
    const clusters = [
      // Europe (dense)
      { lat: 48, lng: 2, s: 6, n: 200 }, { lat: 52, lng: 10, s: 5, n: 180 },
      { lat: 55, lng: -3, s: 3, n: 120 }, { lat: 46, lng: 15, s: 4, n: 140 },
      { lat: 60, lng: 25, s: 5, n: 150 }, { lat: 40, lng: -4, s: 4, n: 120 },
      { lat: 42, lng: 12, s: 3, n: 100 }, { lat: 56, lng: 10, s: 2, n: 60 },
      { lat: 48, lng: 20, s: 4, n: 100 }, { lat: 65, lng: 15, s: 5, n: 80 },
      // Africa
      { lat: 10, lng: 20, s: 14, n: 250 }, { lat: -5, lng: 30, s: 10, n: 160 },
      { lat: 30, lng: 10, s: 10, n: 180 }, { lat: -25, lng: 25, s: 8, n: 100 },
      { lat: 0, lng: 10, s: 6, n: 100 }, { lat: -15, lng: 35, s: 5, n: 60 },
      // Asia
      { lat: 35, lng: 105, s: 14, n: 300 }, { lat: 55, lng: 80, s: 18, n: 250 },
      { lat: 25, lng: 80, s: 10, n: 200 }, { lat: 20, lng: 100, s: 8, n: 120 },
      { lat: 36, lng: 140, s: 4, n: 100 }, { lat: 30, lng: 50, s: 8, n: 120 },
      { lat: 45, lng: 60, s: 8, n: 100 }, { lat: 15, lng: 105, s: 5, n: 80 },
      // North America
      { lat: 45, lng: -100, s: 14, n: 280 }, { lat: 55, lng: -110, s: 12, n: 160 },
      { lat: 25, lng: -100, s: 8, n: 120 }, { lat: 65, lng: -100, s: 15, n: 100 },
      { lat: 35, lng: -80, s: 6, n: 100 },
      // South America
      { lat: -10, lng: -55, s: 12, n: 200 }, { lat: -25, lng: -50, s: 8, n: 120 },
      { lat: 5, lng: -70, s: 6, n: 80 }, { lat: -35, lng: -65, s: 5, n: 60 },
      // Australia
      { lat: -25, lng: 135, s: 10, n: 150 }, { lat: -35, lng: 145, s: 4, n: 50 },
    ];

    const positions = [];
    const colors = [];
    clusters.forEach(c => {
      for (let i = 0; i < c.n; i++) {
        const lat = (c.lat + (Math.random() - 0.5) * c.s) * Math.PI / 180;
        const lng = (c.lng + (Math.random() - 0.5) * c.s) * Math.PI / 180;
        const r = 5.01 + Math.random() * 0.02;
        positions.push(r * Math.cos(lat) * Math.cos(lng), r * Math.sin(lat), -r * Math.cos(lat) * Math.sin(lng));
        // Green-brown land colours
        const g = 0.2 + Math.random() * 0.4;
        const brown = Math.random() > 0.5;
        colors.push(brown ? 0.4 + Math.random() * 0.2 : 0.1, g, brown ? 0.1 : 0.05);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.group.add(new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.06, transparent: true, opacity: 0.8, vertexColors: true,
    })));
  }

  addClouds() {
    // Wispy cloud layer
    const positions = [];
    for (let i = 0; i < 400; i++) {
      const lat = (Math.random() - 0.5) * Math.PI;
      const lng = Math.random() * Math.PI * 2;
      const r = 5.08 + Math.random() * 0.05;
      positions.push(r * Math.cos(lat) * Math.cos(lng), r * Math.sin(lat), -r * Math.cos(lat) * Math.sin(lng));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.clouds = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffffff, size: 0.12, transparent: true, opacity: 0.25,
    }));
    this.group.add(this.clouds);
  }

  latLngToVec3(lat, lng, r) {
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lng + 180) * Math.PI / 180;
    return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
  }

  addMarker(lat, lng) {
    const pos = this.latLngToVec3(lat, lng, 5.06);

    // Glowing marker
    const dotGeo = new THREE.SphereGeometry(0.1, 16, 16);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xff4422 });
    this.marker = new THREE.Mesh(dotGeo, dotMat);
    this.marker.position.copy(pos);
    this.marker.userData = { type: 'london-marker' };
    this.group.add(this.marker);

    // Outer glow
    const glowGeo = new THREE.SphereGeometry(0.18, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff6644, transparent: true, opacity: 0.3 });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.copy(pos);
    this.group.add(glow);

    // Pulse ring
    const ringGeo = new THREE.RingGeometry(0.2, 0.28, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff4422, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
    this.markerPulse = new THREE.Mesh(ringGeo, ringMat);
    this.markerPulse.position.copy(pos);
    this.markerPulse.lookAt(0, 0, 0);
    this.group.add(this.markerPulse);

    // Label
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 96;
    const ctx = canvas.getContext('2d');
    // Background pill
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.roundRect(80, 8, 352, 80, 12);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px Space Grotesk, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🇬🇧 London Colony', 256, 42);
    ctx.font = '16px JetBrains Mono, monospace';
    ctx.fillStyle = '#cccccc';
    ctx.fillText('44 districts · click to enter', 256, 68);
    const tex = new THREE.CanvasTexture(canvas);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    label.position.copy(this.latLngToVec3(lat + 5, lng, 5.8));
    label.scale.set(2.5, 0.5, 1);
    this.group.add(label);
  }

  addStars() {
    const positions = [];
    const sizes = [];
    for (let i = 0; i < 3000; i++) {
      const r = 80 + Math.random() * 120;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions.push(r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffffff, size: 0.15, transparent: true, opacity: 0.6,
    }));
    this.scene.add(this.stars);
  }

  update(time) {
    if (!this.visible) return;
    this.group.rotation.y += 0.0006;
    if (this.clouds) this.clouds.rotation.y += 0.0002;
    if (this.markerPulse) {
      const s = 1 + 0.5 * Math.sin(time * 2.5);
      this.markerPulse.scale.set(s, s, s);
      this.markerPulse.material.opacity = 0.5 - 0.3 * Math.sin(time * 2.5);
    }
  }

  hide() { this.visible = false; this.group.visible = false; if (this.stars) this.stars.visible = false; }
  show() { this.visible = true; this.group.visible = true; if (this.stars) this.stars.visible = true; }
  getMarker() { return this.marker; }
}
