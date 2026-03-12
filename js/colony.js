/* === Colony View — Full London v3 === */

class ColonyView {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.group = new THREE.Group();
    this.group.visible = false;
    this.scene.add(this.group);

    this.districtMeshes = [];
    this.agentMeshes = [];
    this.agentPaths = [];
    this.agentStatuses = [];
    this.statusIndicators = [];
    this.visible = false;
    this.time = 0;

    this.init();
  }

  init() {
    // Ground — light grey
    const groundGeo = new THREE.PlaneGeometry(100, 80);
    const groundMat = new THREE.MeshPhongMaterial({ color: 0xe8e8ee, emissive: 0xd8d8e0 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    this.group.add(ground);

    // Grid — subtle
    const grid = new THREE.GridHelper(100, 100, 0xd0d0dd, 0xd0d0dd);
    grid.material.transparent = true;
    grid.material.opacity = 0.3;
    this.group.add(grid);

    this.createThames();
    this.createDistricts();
    this.createLandmarks();
    this.createMajorRoads();
    this.createAmbience();
  }

  createThames() {
    const points = THAMES_PATH.map(p => new THREE.Vector3(p.x, 0.01, p.z));
    const curve = new THREE.CatmullRomCurve3(points);
    const tubePoints = curve.getPoints(150);

    // River surface
    for (let i = 0; i < tubePoints.length - 1; i++) {
      const p1 = tubePoints[i];
      const p2 = tubePoints[i + 1];
      const dir = new THREE.Vector3().subVectors(p2, p1).normalize();
      const perp = new THREE.Vector3(-dir.z, 0, dir.x);
      const width = 1.0 + Math.sin(i * 0.05) * 0.2;

      const geo = new THREE.BufferGeometry();
      const v = [
        p1.x + perp.x * width, 0.02, p1.z + perp.z * width,
        p1.x - perp.x * width, 0.02, p1.z - perp.z * width,
        p2.x + perp.x * width, 0.02, p2.z + perp.z * width,
        p2.x - perp.x * width, 0.02, p2.z - perp.z * width,
      ];
      geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      geo.setIndex([0, 1, 2, 1, 3, 2]);
      this.group.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: 0x93c5fd, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
      })));
    }

    // River edge line
    const lineGeo = new THREE.BufferGeometry().setFromPoints(tubePoints);
    this.group.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({
      color: 0x3b82f6, transparent: true, opacity: 0.3
    })));

    // Thames label
    const canvas = document.createElement('canvas');
    canvas.width = 300; canvas.height = 48;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#3b82f6';
    ctx.font = 'italic 24px Space Grotesk, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('River Thames', 150, 32);
    const tex = new THREE.CanvasTexture(canvas);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.7 }));
    label.position.set(3, 0.6, 2);
    label.scale.set(4, 0.7, 1);
    this.group.add(label);
  }

  createDistricts() {
    LONDON_DISTRICTS.forEach(d => {
      const colors = DISTRICT_COLORS[d.type] || DISTRICT_COLORS.mixed;
      const isClaimed = d.claimed;

      // District ground plate — VISIBLE for both claimed and unclaimed
      const plateGeo = new THREE.PlaneGeometry(d.w - 0.3, d.d - 0.3);
      const plateMat = new THREE.MeshPhongMaterial({
        color: isClaimed ? colors.main : colors.ground,
        emissive: new THREE.Color(isClaimed ? colors.main : colors.ground).multiplyScalar(0.8),
        transparent: true,
        opacity: isClaimed ? 0.95 : 0.85,
      });
      const plate = new THREE.Mesh(plateGeo, plateMat);
      plate.rotation.x = -Math.PI / 2;
      plate.position.set(d.x, 0.03, d.z);
      this.group.add(plate);

      // District border — always clearly visible
      const borderGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(d.w - 0.15, 0.06, d.d - 0.15));
      const borderMat = new THREE.LineBasicMaterial({
        color: colors.glow,
        transparent: true,
        opacity: isClaimed ? 0.8 : 0.5,
      });
      const border = new THREE.LineSegments(borderGeo, borderMat);
      border.position.set(d.x, 0.04, d.z);
      this.group.add(border);

      // Corner markers for unclaimed (make boundaries very clear)
      if (!isClaimed) {
        const corners = [
          [d.x - d.w/2 + 0.2, d.z - d.d/2 + 0.2],
          [d.x + d.w/2 - 0.2, d.z - d.d/2 + 0.2],
          [d.x - d.w/2 + 0.2, d.z + d.d/2 - 0.2],
          [d.x + d.w/2 - 0.2, d.z + d.d/2 - 0.2],
        ];
        corners.forEach(([cx, cz]) => {
          const cGeo = new THREE.BoxGeometry(0.15, 0.3, 0.15);
          const cMat = new THREE.MeshBasicMaterial({ color: colors.glow, transparent: true, opacity: 0.35 });
          const corner = new THREE.Mesh(cGeo, cMat);
          corner.position.set(cx, 0.15, cz);
          this.group.add(corner);
        });
      }

      // District name label — always visible
      const canvas = document.createElement('canvas');
      canvas.width = 512; canvas.height = 96;
      const ctx = canvas.getContext('2d');

      // Name — dark text for readability on light bg
      const glowHex = '#' + colors.glow.toString(16).padStart(6, '0');
      const accentHex = colors.accent ? '#' + colors.accent.toString(16).padStart(6, '0') : glowHex;
      ctx.fillStyle = accentHex;
      ctx.font = `${isClaimed ? 'bold ' : ''}${isClaimed ? '28' : '22'}px Space Grotesk, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(d.name, 256, 30);

      // Status + landmark
      ctx.font = '14px JetBrains Mono, monospace';
      if (isClaimed) {
        ctx.fillStyle = '#16a34a';
        ctx.fillText(`✅ ${d.owner}`, 256, 52);
      } else {
        ctx.fillStyle = '#6b7280';
        ctx.fillText(`📍 ${d.landmark}`, 256, 52);
        ctx.fillStyle = '#9ca3af';
        ctx.font = '12px JetBrains Mono, monospace';
        ctx.fillText('Unclaimed — available', 256, 72);
      }
      const tex = new THREE.CanvasTexture(canvas);
      const labelSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: isClaimed ? 0.95 : 0.7 }));
      labelSprite.position.set(d.x, isClaimed ? 1.0 : 0.7, d.z);
      labelSprite.scale.set(d.w, d.w * 0.18, 1);
      this.group.add(labelSprite);

      // Buildings
      const buildingGroup = new THREE.Group();
      if (isClaimed) {
        this.createClaimedBuildings(buildingGroup, d, colors);
      } else {
        this.createUnclaimedBuildings(buildingGroup, d, colors);
      }
      this.group.add(buildingGroup);

      // Clickable hitbox
      const hitbox = new THREE.Mesh(
        new THREE.BoxGeometry(d.w, 1, d.d),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hitbox.position.set(d.x, 0.5, d.z);
      hitbox.userData = { type: 'district', districtId: d.id, district: d };
      this.group.add(hitbox);
      this.districtMeshes.push({ mesh: hitbox, data: d });
    });
  }

  createClaimedBuildings(group, d, colors) {
    // HQ building
    const hqH = 3.5 + Math.random() * 1.5;
    this.addBuilding(group, d.x, d.z - d.d * 0.15, d.w * 0.35, hqH, d.d * 0.25, colors.main, colors.glow, true);

    // Cluster of buildings
    const count = d.buildings || 8;
    const placed = [];
    for (let i = 0; i < count; i++) {
      let bx, bz, attempts = 0;
      do {
        bx = d.x + (Math.random() - 0.5) * (d.w - 1.5);
        bz = d.z + (Math.random() - 0.5) * (d.d - 1.5);
        attempts++;
      } while (attempts < 20 && placed.some(p => Math.abs(p.x - bx) < 0.8 && Math.abs(p.z - bz) < 0.8));
      placed.push({ x: bx, z: bz });

      const bh = 1.5 + Math.random() * 2.5;
      const bw = 0.4 + Math.random() * 0.6;
      this.addBuilding(group, bx, bz, bw, bh, bw * (0.8 + Math.random() * 0.4), colors.main, colors.glow, false);
    }

    // Glow beam
    const pillarGeo = new THREE.CylinderGeometry(0.03, 0.2, 10, 8);
    const pillarMat = new THREE.MeshBasicMaterial({ color: colors.glow, transparent: true, opacity: 0.12 });
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.set(d.x, 5, d.z);
    group.add(pillar);
  }

  createUnclaimedBuildings(group, d, colors) {
    // Unclaimed: visible outline buildings, semi-transparent, like potential/ghost buildings
    const count = d.buildings || 5;
    const placed = [];
    for (let i = 0; i < count; i++) {
      let bx, bz, attempts = 0;
      do {
        bx = d.x + (Math.random() - 0.5) * (d.w - 1);
        bz = d.z + (Math.random() - 0.5) * (d.d - 1);
        attempts++;
      } while (attempts < 15 && placed.some(p => Math.abs(p.x - bx) < 0.6 && Math.abs(p.z - bz) < 0.6));
      placed.push({ x: bx, z: bz });

      const bh = 0.5 + Math.random() * 1.5;
      const bw = 0.3 + Math.random() * 0.5;
      const bd = bw * (0.8 + Math.random() * 0.4);
      const geo = new THREE.BoxGeometry(bw, bh, bd);

      // Semi-transparent fill — visible on light background
      const mat = new THREE.MeshPhongMaterial({
        color: colors.ground,
        emissive: new THREE.Color(colors.ground).multiplyScalar(0.7),
        transparent: true,
        opacity: 0.6,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(bx, bh / 2, bz);
      group.add(mesh);

      // Visible wireframe edges
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: colors.glow, transparent: true, opacity: 0.35 })
      );
      edges.position.copy(mesh.position);
      group.add(edges);

      // Dim windows
      const rows = Math.max(1, Math.floor(bh / 0.8));
      for (let r = 0; r < rows; r++) {
        const winGeo = new THREE.PlaneGeometry(bw * 0.5, 0.15);
        const winMat = new THREE.MeshBasicMaterial({
          color: colors.glow, transparent: true, opacity: 0.12
        });
        const win = new THREE.Mesh(winGeo, winMat);
        win.position.set(bx, 0.3 + r * 0.7, bz + bd / 2 + 0.01);
        group.add(win);
      }
    }

    // Small street grid within unclaimed districts
    const streetCount = Math.max(1, Math.floor(d.w / 2.5));
    for (let i = 0; i < streetCount; i++) {
      const sx = d.x - d.w / 2 + (i + 1) * (d.w / (streetCount + 1));
      const streetGeo = new THREE.PlaneGeometry(0.12, d.d - 0.8);
      const streetMat = new THREE.MeshBasicMaterial({
        color: colors.glow, transparent: true, opacity: 0.12
      });
      const street = new THREE.Mesh(streetGeo, streetMat);
      street.rotation.x = -Math.PI / 2;
      street.position.set(sx, 0.025, d.z);
      group.add(street);
    }
    // Cross streets
    const crossCount = Math.max(1, Math.floor(d.d / 2.5));
    for (let i = 0; i < crossCount; i++) {
      const sz = d.z - d.d / 2 + (i + 1) * (d.d / (crossCount + 1));
      const streetGeo = new THREE.PlaneGeometry(d.w - 0.8, 0.12);
      const streetMat = new THREE.MeshBasicMaterial({
        color: colors.glow, transparent: true, opacity: 0.12
      });
      const street = new THREE.Mesh(streetGeo, streetMat);
      street.rotation.x = -Math.PI / 2;
      street.position.set(d.x, 0.025, sz);
      group.add(street);
    }
  }

  addBuilding(group, x, z, w, h, depth, color, glowColor, isHQ) {
    const geo = new THREE.BoxGeometry(w, h, depth);
    const mat = new THREE.MeshPhongMaterial({
      color: color,
      emissive: new THREE.Color(color).multiplyScalar(0.4),
      transparent: true, opacity: 0.92,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, h / 2, z);
    group.add(mesh);

    // Edges
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: glowColor, transparent: true, opacity: 0.3 })
    );
    edges.position.copy(mesh.position);
    group.add(edges);

    // Roof
    const roofGeo = new THREE.BoxGeometry(w + 0.04, 0.05, depth + 0.04);
    const roofMat = new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.3 });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.set(x, h, z);
    group.add(roof);

    // Windows
    const rows = Math.max(1, Math.floor(h / 0.9));
    const cols = Math.max(1, Math.floor(w / 0.6));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const isLit = Math.random() > 0.35;
        const winGeo = new THREE.PlaneGeometry(0.18, 0.22);
        const winMat = new THREE.MeshBasicMaterial({
          color: isLit ? glowColor : 0x111122,
          transparent: true, opacity: isLit ? 0.4 : 0.08,
        });
        const win = new THREE.Mesh(winGeo, winMat);
        win.position.set(x - w / 2 + 0.3 + c * 0.5, 0.4 + r * 0.8, z + depth / 2 + 0.01);
        group.add(win);
      }
    }

    if (isHQ) {
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 48;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#' + glowColor.toString(16).padStart(6, '0');
      ctx.font = 'bold 26px Space Grotesk, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🏢 HQ', 128, 34);
      const tex = new THREE.CanvasTexture(canvas);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
      label.position.set(x, h + 0.8, z);
      label.scale.set(1.5, 0.3, 1);
      group.add(label);
    }
  }

  createLandmarks() {
    LANDMARKS.forEach(lm => {
      // Landmark pin
      const pinGeo = new THREE.CylinderGeometry(0.02, 0.02, lm.h, 6);
      const pinMat = new THREE.MeshBasicMaterial({ color: 0xd97706, transparent: true, opacity: 0.5 });
      const pin = new THREE.Mesh(pinGeo, pinMat);
      pin.position.set(lm.x, lm.h / 2, lm.z);
      this.group.add(pin);

      // Landmark label
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 48;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#92400e';
      ctx.font = '18px Space Grotesk, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${lm.icon} ${lm.name}`, 128, 32);
      const tex = new THREE.CanvasTexture(canvas);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.7 }));
      label.position.set(lm.x, lm.h + 0.4, lm.z);
      label.scale.set(2.5, 0.5, 1);
      this.group.add(label);
    });
  }

  createMajorRoads() {
    const roads = [
      // A40 / Oxford St corridor
      [{ x: -22, z: -7 }, { x: -16, z: -8 }, { x: -12, z: -7 }, { x: -7, z: -7 }, { x: -3, z: -6 }, { x: 0, z: -5 }, { x: 5, z: -5 }, { x: 10, z: -4 }, { x: 16, z: -5 }],
      // A1 North-South
      [{ x: 0, z: -20 }, { x: 0, z: -15 }, { x: 0, z: -10 }, { x: 0, z: -5 }, { x: 0, z: 0 }, { x: 0, z: 5 }, { x: 0, z: 14 }],
      // Embankment (along Thames north)
      [{ x: -18, z: 0.5 }, { x: -12, z: 0 }, { x: -8, z: 0.5 }, { x: -4, z: 0.5 }, { x: 0, z: 0.5 }, { x: 4, z: 1 }, { x: 8, z: 1.5 }],
      // South circular
      [{ x: -18, z: 10 }, { x: -12, z: 10 }, { x: -6, z: 11 }, { x: 0, z: 10 }, { x: 6, z: 11 }, { x: 12, z: 12 }],
      // East-West south
      [{ x: -12, z: 5 }, { x: -7, z: 5 }, { x: -2, z: 5 }, { x: 3, z: 5 }, { x: 8, z: 5 }, { x: 14, z: 6 }],
      // A2 / Old Kent Rd
      [{ x: 0, z: 5 }, { x: 2, z: 7 }, { x: 4, z: 9 }, { x: 6, z: 11 }, { x: 10, z: 12 }],
    ];

    roads.forEach(roadPoints => {
      const pts = roadPoints.map(p => new THREE.Vector3(p.x, 0.015, p.z));
      const curve = new THREE.CatmullRomCurve3(pts);
      const linePoints = curve.getPoints(60);

      // Road surface (wider line via plane segments)
      for (let i = 0; i < linePoints.length - 1; i++) {
        const p1 = linePoints[i];
        const p2 = linePoints[i + 1];
        const dir = new THREE.Vector3().subVectors(p2, p1).normalize();
        const perp = new THREE.Vector3(-dir.z, 0, dir.x);
        const w = 0.15;

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute([
          p1.x + perp.x * w, 0.018, p1.z + perp.z * w,
          p1.x - perp.x * w, 0.018, p1.z - perp.z * w,
          p2.x + perp.x * w, 0.018, p2.z + perp.z * w,
          p2.x - perp.x * w, 0.018, p2.z - perp.z * w,
        ], 3));
        geo.setIndex([0, 1, 2, 1, 3, 2]);
        this.group.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
          color: 0xb0b0c0, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
        })));
      }
    });
  }

  createAmbience() {
    // Floating particles
    const positions = [];
    for (let i = 0; i < 600; i++) {
      positions.push((Math.random() - 0.5) * 80, Math.random() * 15, (Math.random() - 0.5) * 65);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.particles = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0x93c5fd, size: 0.03, transparent: true, opacity: 0.2,
    }));
    this.group.add(this.particles);

    // Distant skyline silhouettes
    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 38 + Math.random() * 12;
      const h = 0.3 + Math.random() * 1.5;
      const w = 0.2 + Math.random() * 0.4;
      const geo = new THREE.BoxGeometry(w, h, w);
      const mat = new THREE.MeshPhongMaterial({
        color: 0xc8c8d5, emissive: 0xb8b8c5, transparent: true, opacity: 0.4,
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(Math.cos(angle) * dist, h / 2, Math.sin(angle) * dist);
      this.group.add(m);
    }

    // Street lamps in claimed districts
    LONDON_DISTRICTS.filter(d => d.claimed).forEach(d => {
      for (let i = 0; i < 6; i++) {
        const lx = d.x + (Math.random() - 0.5) * d.w * 0.8;
        const lz = d.z + (Math.random() - 0.5) * d.d * 0.8;
        const poleGeo = new THREE.CylinderGeometry(0.015, 0.015, 1.2, 6);
        const pole = new THREE.Mesh(poleGeo, new THREE.MeshPhongMaterial({ color: 0x888899 }));
        pole.position.set(lx, 0.6, lz);
        this.group.add(pole);
        const lGeo = new THREE.SphereGeometry(0.05, 6, 6);
        const light = new THREE.Mesh(lGeo, new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.5 }));
        light.position.set(lx, 1.25, lz);
        this.group.add(light);
        const pLight = new THREE.PointLight(0x3b82f6, 0.1, 2.5);
        pLight.position.set(lx, 1.25, lz);
        this.group.add(pLight);
      }
    });
  }

  // === AGENTS ===

  spawnAgents() {
    if (this.agentMeshes.length > 0) {
      this.agentMeshes.forEach(m => { m.visible = true; });
      return;
    }

    const claimedDistrict = LONDON_DISTRICTS.find(d => d.claimed);
    if (!claimedDistrict) return;

    AGENTS.forEach((agent, i) => {
      const agentGroup = new THREE.Group();

      // Body
      const bodyGeo = new THREE.CylinderGeometry(0.08, 0.12, 0.4, 8);
      const bodyMat = new THREE.MeshPhongMaterial({
        color: agent.color,
        emissive: new THREE.Color(agent.color).multiplyScalar(0.3),
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 0.3;
      agentGroup.add(body);

      // Head
      const headGeo = new THREE.SphereGeometry(0.1, 10, 10);
      const headMat = new THREE.MeshPhongMaterial({ color: 0xd4a574, emissive: 0x8b6914 });
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.y = 0.6;
      agentGroup.add(head);

      // Glow ring under feet
      const glowGeo = new THREE.RingGeometry(0.12, 0.2, 16);
      const glowMat = new THREE.MeshBasicMaterial({
        color: agent.color, transparent: true, opacity: 0.3, side: THREE.DoubleSide,
      });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.02;
      agentGroup.add(glow);

      // Name label
      const nameCanvas = document.createElement('canvas');
      nameCanvas.width = 256; nameCanvas.height = 48;
      const nctx = nameCanvas.getContext('2d');
      nctx.fillStyle = '#' + agent.color.toString(16).padStart(6, '0');
      nctx.font = 'bold 24px Space Grotesk, sans-serif';
      nctx.textAlign = 'center';
      nctx.fillText(agent.emoji + ' ' + agent.name, 128, 32);
      const nameTex = new THREE.CanvasTexture(nameCanvas);
      const nameLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTex, transparent: true }));
      nameLabel.position.y = 1.0;
      nameLabel.scale.set(1.2, 0.3, 1);
      agentGroup.add(nameLabel);

      // STATUS INDICATOR (green dot or stuck sign)
      const statusGroup = new THREE.Group();
      statusGroup.position.y = 1.3;

      // Green live dot (default)
      const dotGeo = new THREE.SphereGeometry(0.05, 8, 8);
      const dotMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.name = 'liveDot';
      statusGroup.add(dot);

      // Stuck sign (hidden by default) — ⚠ triangle
      const stuckGroup = new THREE.Group();
      stuckGroup.name = 'stuckSign';
      stuckGroup.visible = false;

      // Triangle warning sign
      const triShape = new THREE.Shape();
      triShape.moveTo(0, 0.15);
      triShape.lineTo(-0.12, -0.05);
      triShape.lineTo(0.12, -0.05);
      triShape.lineTo(0, 0.15);
      const triGeo = new THREE.ShapeGeometry(triShape);
      const triMat = new THREE.MeshBasicMaterial({ color: 0xff3333, side: THREE.DoubleSide });
      const tri = new THREE.Mesh(triGeo, triMat);
      stuckGroup.add(tri);

      // Exclamation mark
      const excCanvas = document.createElement('canvas');
      excCanvas.width = 64; excCanvas.height = 64;
      const ectx = excCanvas.getContext('2d');
      ectx.fillStyle = '#ffffff';
      ectx.font = 'bold 40px sans-serif';
      ectx.textAlign = 'center';
      ectx.fillText('!', 32, 45);
      const excTex = new THREE.CanvasTexture(excCanvas);
      const excSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: excTex, transparent: true }));
      excSprite.scale.set(0.15, 0.15, 1);
      excSprite.position.y = 0.02;
      stuckGroup.add(excSprite);

      statusGroup.add(stuckGroup);
      agentGroup.add(statusGroup);

      // Set initial status
      const isStuck = Math.random() > 0.85; // 15% chance of being stuck for demo
      const status = isStuck ? AGENT_STATUS.STUCK : AGENT_STATUS.LIVE;

      // Position
      const path = this.getAgentPath(claimedDistrict, agent, i);
      agentGroup.position.set(path[0].x, 0, path[0].z);
      agentGroup.userData = { agentIndex: i, type: 'agent' };
      this.group.add(agentGroup);
      this.agentMeshes.push(agentGroup);
      this.agentPaths.push({ points: path, currentIndex: 0, t: 0, speed: 0.003 + Math.random() * 0.002 });
      this.agentStatuses.push(status);
      this.statusIndicators.push(statusGroup);

      // Apply initial status
      this.setAgentStatus(i, status);
    });
  }

  setAgentStatus(index, status) {
    if (index >= this.statusIndicators.length) return;
    const indicator = this.statusIndicators[index];
    const liveDot = indicator.children.find(c => c.name === 'liveDot');
    const stuckSign = indicator.children.find(c => c.name === 'stuckSign');

    this.agentStatuses[index] = status;

    if (status === AGENT_STATUS.LIVE) {
      if (liveDot) { liveDot.visible = true; liveDot.material.color.setHex(0x00ff88); }
      if (stuckSign) stuckSign.visible = false;
    } else if (status === AGENT_STATUS.STUCK) {
      if (liveDot) liveDot.visible = false;
      if (stuckSign) stuckSign.visible = true;
      // Stop movement
      this.agentPaths[index].speed = 0;
    } else if (status === AGENT_STATUS.IDLE) {
      if (liveDot) { liveDot.visible = true; liveDot.material.color.setHex(0xffaa00); }
      if (stuckSign) stuckSign.visible = false;
      this.agentPaths[index].speed = 0;
    }
  }

  hideAgents() { this.agentMeshes.forEach(m => { m.visible = false; }); }

  getAgentPath(district, agent, index) {
    const cx = district.x;
    const cz = district.z;
    const hw = district.w * 0.3;
    const hd = district.d * 0.3;

    const patterns = [
      [{ x: cx, z: cz - hd }, { x: cx + hw, z: cz - hd }, { x: cx + hw, z: cz },
       { x: cx, z: cz }, { x: cx - hw * 0.5, z: cz + hd * 0.5 }, { x: cx, z: cz - hd }],
      [{ x: cx - hw, z: cz }, { x: cx - hw * 0.5, z: cz - hd }, { x: cx + hw * 0.5, z: cz - hd },
       { x: cx + hw, z: cz }, { x: cx + hw * 0.5, z: cz + hd * 0.5 }, { x: cx - hw, z: cz }],
      [{ x: cx, z: cz - hd }, { x: cx + hw, z: cz }, { x: cx, z: cz + hd * 0.5 },
       { x: cx - hw, z: cz }, { x: cx, z: cz - hd }],
      [{ x: cx - hw, z: cz + hd }, { x: cx - hw - 0.5, z: cz + hd + 0.5 }, { x: cx - hw - 0.5, z: cz },
       { x: cx - hw, z: cz - hd }, { x: cx, z: cz - hd }, { x: cx, z: cz }, { x: cx - hw, z: cz + hd }],
    ];

    return patterns[index % patterns.length];
  }

  update(time) {
    if (!this.visible) return;
    this.time = time;

    // Animate agents
    this.agentMeshes.forEach((mesh, i) => {
      if (!mesh.visible) return;
      const pd = this.agentPaths[i];
      if (pd.speed === 0) return; // Stuck or idle

      pd.t += pd.speed;
      if (pd.t >= 1) { pd.t = 0; pd.currentIndex = (pd.currentIndex + 1) % pd.points.length; }
      const curr = pd.points[pd.currentIndex];
      const next = pd.points[(pd.currentIndex + 1) % pd.points.length];
      mesh.position.x = curr.x + (next.x - curr.x) * pd.t;
      mesh.position.z = curr.z + (next.z - curr.z) * pd.t;
      mesh.position.y = Math.abs(Math.sin(time * 5 + i)) * 0.025;
      const dx = next.x - curr.x;
      const dz = next.z - curr.z;
      if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) mesh.rotation.y = Math.atan2(dx, dz);
    });

    // Pulse status indicators
    this.statusIndicators.forEach((sg, i) => {
      if (this.agentStatuses[i] === AGENT_STATUS.LIVE) {
        const dot = sg.children.find(c => c.name === 'liveDot');
        if (dot) dot.material.opacity = 0.7 + 0.3 * Math.sin(time * 3 + i);
      } else if (this.agentStatuses[i] === AGENT_STATUS.STUCK) {
        const sign = sg.children.find(c => c.name === 'stuckSign');
        if (sign) {
          sign.position.y = Math.sin(time * 2) * 0.05;
          sign.rotation.z = Math.sin(time * 1.5) * 0.1;
        }
      }
    });

    // Float particles
    if (this.particles) {
      const pos = this.particles.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        pos.setY(i, pos.getY(i) + Math.sin(time * 0.3 + i * 0.05) * 0.0008);
      }
      pos.needsUpdate = true;
    }
  }

  show() { this.visible = true; this.group.visible = true; }
  hide() { this.visible = false; this.group.visible = false; }
  getAgentMeshes() { return this.agentMeshes; }
  getDistrictMeshes() { return this.districtMeshes; }
}
