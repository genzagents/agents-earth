/* === Globe View === */

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
    // Earth sphere
    const earthGeo = new THREE.SphereGeometry(5, 64, 64);
    const earthMat = new THREE.MeshPhongMaterial({
      color: 0x0a0a2e, emissive: 0x050520,
      specular: 0x222244, shininess: 15,
      transparent: true, opacity: 0.95,
    });
    this.earth = new THREE.Mesh(earthGeo, earthMat);
    this.group.add(this.earth);

    // Wireframe
    const wireGeo = new THREE.SphereGeometry(5.02, 36, 36);
    const wireMat = new THREE.MeshBasicMaterial({ color: 0x00f5ff, wireframe: true, transparent: true, opacity: 0.06 });
    this.group.add(new THREE.Mesh(wireGeo, wireMat));

    // Atmosphere
    const atmosGeo = new THREE.SphereGeometry(5.3, 64, 64);
    const atmosMat = new THREE.MeshBasicMaterial({ color: 0x00f5ff, transparent: true, opacity: 0.04, side: THREE.BackSide });
    this.group.add(new THREE.Mesh(atmosGeo, atmosMat));

    this.drawContinents();
    this.addMarker(51.5074, -0.1278);
    this.addStars();
  }

  drawContinents() {
    const clusters = [
      { lat: 48, lng: 2, s: 8, n: 80 }, { lat: 52, lng: 10, s: 6, n: 60 },
      { lat: 55, lng: -3, s: 4, n: 40 }, { lat: 46, lng: 15, s: 5, n: 40 },
      { lat: 60, lng: 25, s: 6, n: 50 }, { lat: 40, lng: -4, s: 5, n: 40 },
      { lat: 42, lng: 12, s: 3, n: 30 }, { lat: 10, lng: 20, s: 15, n: 100 },
      { lat: -5, lng: 30, s: 10, n: 60 }, { lat: 30, lng: 10, s: 10, n: 60 },
      { lat: -25, lng: 25, s: 8, n: 40 }, { lat: 35, lng: 105, s: 15, n: 120 },
      { lat: 55, lng: 80, s: 20, n: 100 }, { lat: 25, lng: 80, s: 10, n: 80 },
      { lat: 20, lng: 100, s: 8, n: 50 }, { lat: 36, lng: 140, s: 4, n: 40 },
      { lat: 45, lng: -100, s: 15, n: 120 }, { lat: 55, lng: -110, s: 12, n: 60 },
      { lat: 25, lng: -100, s: 8, n: 50 }, { lat: -10, lng: -55, s: 12, n: 80 },
      { lat: -25, lng: -50, s: 8, n: 50 }, { lat: 5, lng: -70, s: 6, n: 30 },
      { lat: -25, lng: 135, s: 10, n: 60 },
    ];
    const positions = [];
    clusters.forEach(c => {
      for (let i = 0; i < c.n; i++) {
        const lat = (c.lat + (Math.random() - 0.5) * c.s) * Math.PI / 180;
        const lng = (c.lng + (Math.random() - 0.5) * c.s) * Math.PI / 180;
        const r = 5.03;
        positions.push(r * Math.cos(lat) * Math.cos(lng), r * Math.sin(lat), -r * Math.cos(lat) * Math.sin(lng));
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.group.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x00f5ff, size: 0.04, transparent: true, opacity: 0.5 })));
  }

  latLngToVec3(lat, lng, r) {
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lng + 180) * Math.PI / 180;
    return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
  }

  addMarker(lat, lng) {
    const pos = this.latLngToVec3(lat, lng, 5.05);

    const dotGeo = new THREE.SphereGeometry(0.12, 16, 16);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xff6b35 });
    this.marker = new THREE.Mesh(dotGeo, dotMat);
    this.marker.position.copy(pos);
    this.marker.userData = { type: 'london-marker' };
    this.group.add(this.marker);

    // Pulse ring
    const ringGeo = new THREE.RingGeometry(0.15, 0.22, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff6b35, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
    this.markerPulse = new THREE.Mesh(ringGeo, ringMat);
    this.markerPulse.position.copy(pos);
    this.markerPulse.lookAt(0, 0, 0);
    this.group.add(this.markerPulse);

    // Label
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 96;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ff6b35';
    ctx.font = 'bold 32px Space Grotesk, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🇬🇧 London Colony', 256, 40);
    ctx.font = '20px JetBrains Mono, monospace';
    ctx.fillStyle = '#7a7a9a';
    ctx.fillText('29 districts • 1 claimed', 256, 70);
    const tex = new THREE.CanvasTexture(canvas);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    label.position.copy(this.latLngToVec3(lat + 4, lng, 5.5));
    label.scale.set(2, 0.5, 1);
    this.group.add(label);
  }

  addStars() {
    const positions = [];
    for (let i = 0; i < 2000; i++) {
      positions.push((Math.random() - 0.5) * 200, (Math.random() - 0.5) * 200, (Math.random() - 0.5) * 200);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.15, transparent: true, opacity: 0.7 }));
    this.scene.add(this.stars);
  }

  update(time) {
    if (!this.visible) return;
    this.group.rotation.y += 0.0008;
    if (this.markerPulse) {
      const s = 1 + 0.4 * Math.sin(time * 3);
      this.markerPulse.scale.set(s, s, s);
      this.markerPulse.material.opacity = 0.6 - 0.3 * Math.sin(time * 3);
    }
  }

  hide() { this.visible = false; this.group.visible = false; if (this.stars) this.stars.visible = false; }
  show() { this.visible = true; this.group.visible = true; if (this.stars) this.stars.visible = true; }
  getMarker() { return this.marker; }
}
