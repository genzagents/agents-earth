/* === Colony View — Realistic London v5 === */

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
    this.createGround();
    this.createThames();
    this.createDistricts();
    this.createLandmarks();
    this.createRoads();
    this.createTrees();
    this.createAmbience();
  }

  createGround() {
    // Base ground — realistic grey-green
    const geo = new THREE.PlaneGeometry(120, 90);
    const mat = new THREE.MeshPhongMaterial({
      color: 0xc8c8b8, emissive: 0x505048, specular: 0x222222, shininess: 5,
    });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    this.group.add(ground);

    // Subtle grass patches
    for (let i = 0; i < 200; i++) {
      const x = (Math.random() - 0.5) * 100;
      const z = (Math.random() - 0.5) * 80;
      const s = 0.3 + Math.random() * 1.5;
      const gGeo = new THREE.CircleGeometry(s, 8);
      const gMat = new THREE.MeshPhongMaterial({
        color: new THREE.Color().setHSL(0.25 + Math.random() * 0.1, 0.3 + Math.random() * 0.2, 0.45 + Math.random() * 0.15),
        transparent: true, opacity: 0.3,
      });
      const patch = new THREE.Mesh(gGeo, gMat);
      patch.rotation.x = -Math.PI / 2;
      patch.position.set(x, -0.04, z);
      this.group.add(patch);
    }
  }

  createThames() {
    const points = THAMES_PATH.map(p => new THREE.Vector3(p.x, 0, p.z));
    const curve = new THREE.CatmullRomCurve3(points);
    const tubePoints = curve.getPoints(200);

    // River surface — realistic water blue
    for (let i = 0; i < tubePoints.length - 1; i++) {
      const p1 = tubePoints[i];
      const p2 = tubePoints[i + 1];
      const dir = new THREE.Vector3().subVectors(p2, p1).normalize();
      const perp = new THREE.Vector3(-dir.z, 0, dir.x);
      const w = 1.0 + Math.sin(i * 0.03) * 0.15;

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([
        p1.x + perp.x * w, 0.01, p1.z + perp.z * w,
        p1.x - perp.x * w, 0.01, p1.z - perp.z * w,
        p2.x + perp.x * w, 0.01, p2.z + perp.z * w,
        p2.x - perp.x * w, 0.01, p2.z - perp.z * w,
      ], 3));
      geo.setIndex([0, 1, 2, 1, 3, 2]);
      geo.computeVertexNormals();
      this.group.add(new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
        color: 0x3a6b8a,
        emissive: 0x1a3040,
        specular: 0x88aacc,
        shininess: 60,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
      })));
    }

    // River edge embankment (stone walls)
    for (let side = -1; side <= 1; side += 2) {
      const edgePositions = [];
      for (let i = 0; i < tubePoints.length; i++) {
        const p = tubePoints[i];
        const next = tubePoints[Math.min(i + 1, tubePoints.length - 1)];
        const dir = new THREE.Vector3().subVectors(next, p).normalize();
        const perp = new THREE.Vector3(-dir.z, 0, dir.x);
        const w = 1.05 + Math.sin(i * 0.03) * 0.15;
        edgePositions.push(new THREE.Vector3(p.x + perp.x * w * side, 0.08, p.z + perp.z * w * side));
      }
      const edgeGeo = new THREE.BufferGeometry().setFromPoints(edgePositions);
      this.group.add(new THREE.Line(edgeGeo, new THREE.LineBasicMaterial({
        color: 0x8a8a78, transparent: true, opacity: 0.6,
      })));
    }

    // Thames label
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 40;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#3a6b8a';
    ctx.font = 'italic 20px Space Grotesk, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('River Thames', 128, 26);
    const tex = new THREE.CanvasTexture(canvas);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.6 }));
    label.position.set(3, 0.5, 2);
    label.scale.set(3.5, 0.6, 1);
    this.group.add(label);
  }

  createDistricts() {
    LONDON_DISTRICTS.forEach(d => {
      const colors = DISTRICT_COLORS[d.type] || DISTRICT_COLORS.mixed;
      const isClaimed = d.claimed;

      // District ground — paved area
      const plateGeo = new THREE.PlaneGeometry(d.w - 0.2, d.d - 0.2);
      const plateMat = new THREE.MeshPhongMaterial({
        color: isClaimed ? 0xb8b0a8 : 0xbcbcb4,
        emissive: isClaimed ? 0x504840 : 0x505048,
        specular: 0x333333,
        shininess: 3,
      });
      const plate = new THREE.Mesh(plateGeo, plateMat);
      plate.rotation.x = -Math.PI / 2;
      plate.position.set(d.x, 0.01, d.z);
      this.group.add(plate);

      // District border — subtle kerb line
      const borderGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(d.w - 0.1, 0.08, d.d - 0.1));
      this.group.add(new THREE.LineSegments(borderGeo, new THREE.LineBasicMaterial({
        color: isClaimed ? colors.accent : 0x999990,
        transparent: true,
        opacity: isClaimed ? 0.7 : 0.35,
      })).translateX(d.x).translateY(0.04).translateZ(d.z));

      // Buildings
      if (isClaimed) {
        this.createRealisticBuildings(d, colors, true);
      } else {
        this.createRealisticBuildings(d, colors, false);
      }

      // District label
      this.createDistrictLabel(d, colors, isClaimed);

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

  createRealisticBuildings(d, colors, isClaimed) {
    const count = d.buildings || 6;
    const placed = [];

    for (let i = 0; i < count; i++) {
      let bx, bz, attempts = 0;
      do {
        bx = d.x + (Math.random() - 0.5) * (d.w - 1.2);
        bz = d.z + (Math.random() - 0.5) * (d.d - 1.2);
        attempts++;
      } while (attempts < 25 && placed.some(p => Math.abs(p.x - bx) < 0.7 && Math.abs(p.z - bz) < 0.7));
      placed.push({ x: bx, z: bz });

      const isMain = i === 0 && isClaimed;
      const height = isMain ? (3 + Math.random() * 2.5) : (isClaimed ? (1 + Math.random() * 3) : (0.4 + Math.random() * 1.2));
      const width = isMain ? (1 + Math.random() * 0.5) : (0.4 + Math.random() * 0.7);
      const depth = width * (0.7 + Math.random() * 0.5);

      this.addRealisticBuilding(bx, bz, width, height, depth, colors, isClaimed, isMain);
    }
  }

  addRealisticBuilding(x, z, w, h, d, colors, isClaimed, isMain) {
    const group = new THREE.Group();

    // Building colours — realistic brick/concrete/glass
    const buildingColors = isClaimed ? [
      { wall: 0x8b7355, roof: 0x554433 }, // Brick brown
      { wall: 0x9a9a8a, roof: 0x555550 }, // Concrete grey
      { wall: 0x7a8a9a, roof: 0x445566 }, // Glass blue-grey
      { wall: 0xc8b898, roof: 0x665544 }, // Sandstone
      { wall: 0x6a6a6a, roof: 0x333333 }, // Dark modern
    ] : [
      { wall: 0xa5a5a0, roof: 0x777770 }, // Faded grey
      { wall: 0xb0a898, roof: 0x888878 }, // Faded sandstone
    ];
    const bColor = buildingColors[Math.floor(Math.random() * buildingColors.length)];

    // Main body
    const bodyGeo = new THREE.BoxGeometry(w, h, d);
    const bodyMat = new THREE.MeshPhongMaterial({
      color: bColor.wall,
      emissive: new THREE.Color(bColor.wall).multiplyScalar(0.2),
      specular: 0x222222,
      shininess: 10,
      transparent: !isClaimed,
      opacity: isClaimed ? 1.0 : 0.6,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = h / 2;
    body.castShadow = true;
    group.add(body);

    // Roof
    if (Math.random() > 0.4) {
      // Flat roof with slight overhang
      const roofGeo = new THREE.BoxGeometry(w + 0.06, 0.06, d + 0.06);
      const roofMat = new THREE.MeshPhongMaterial({
        color: bColor.roof, emissive: new THREE.Color(bColor.roof).multiplyScalar(0.15),
        transparent: !isClaimed, opacity: isClaimed ? 1.0 : 0.5,
      });
      const roof = new THREE.Mesh(roofGeo, roofMat);
      roof.position.y = h + 0.03;
      group.add(roof);
    } else if (h > 1.5) {
      // Pitched roof
      const roofGeo = new THREE.ConeGeometry(Math.max(w, d) * 0.6, h * 0.2, 4);
      const roofMat = new THREE.MeshPhongMaterial({
        color: 0x664433, emissive: 0x221510,
        transparent: !isClaimed, opacity: isClaimed ? 1.0 : 0.5,
      });
      const roof = new THREE.Mesh(roofGeo, roofMat);
      roof.position.y = h + h * 0.1;
      roof.rotation.y = Math.PI / 4;
      group.add(roof);
    }

    // Windows — realistic grid pattern
    if (isClaimed && h > 0.8) {
      const floors = Math.max(1, Math.floor(h / 0.8));
      const cols = Math.max(1, Math.floor(w / 0.45));
      for (let f = 0; f < floors; f++) {
        for (let c = 0; c < cols; c++) {
          const isLit = Math.random() > 0.3;
          const winW = 0.15;
          const winH = 0.2;
          const winGeo = new THREE.PlaneGeometry(winW, winH);
          const winMat = new THREE.MeshBasicMaterial({
            color: isLit ? (Math.random() > 0.5 ? 0xffeebb : 0xddcc88) : 0x334455,
            transparent: true,
            opacity: isLit ? 0.8 : 0.4,
          });
          // Front face
          const win = new THREE.Mesh(winGeo, winMat);
          win.position.set(
            -w / 2 + 0.2 + c * (w - 0.3) / Math.max(1, cols - 1),
            0.4 + f * 0.75,
            d / 2 + 0.005
          );
          group.add(win);
          // Back face
          const win2 = win.clone();
          win2.position.z = -d / 2 - 0.005;
          win2.rotation.y = Math.PI;
          group.add(win2);
        }
      }
    }

    // Door (ground floor, front)
    if (isClaimed && h > 1) {
      const doorGeo = new THREE.PlaneGeometry(0.2, 0.35);
      const doorMat = new THREE.MeshBasicMaterial({ color: 0x443322 });
      const door = new THREE.Mesh(doorGeo, doorMat);
      door.position.set(0, 0.175, d / 2 + 0.005);
      group.add(door);
    }

    group.position.set(x, 0, z);
    this.group.add(group);
  }

  createDistrictLabel(d, colors, isClaimed) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 80;
    const ctx = canvas.getContext('2d');

    // Background pill for readability
    ctx.fillStyle = isClaimed ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.roundRect(40, 4, 432, 72, 8);
    ctx.fill();

    const accentHex = colors.accent ? '#' + colors.accent.toString(16).padStart(6, '0') : '#ffffff';
    ctx.fillStyle = isClaimed ? '#ffffff' : '#cccccc';
    ctx.font = `${isClaimed ? 'bold ' : ''}${isClaimed ? '24' : '20'}px Space Grotesk, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(d.name, 256, 28);

    ctx.font = '13px JetBrains Mono, monospace';
    if (isClaimed) {
      ctx.fillStyle = '#88ff88';
      ctx.fillText(`✅ ${d.owner}`, 256, 50);
    } else {
      ctx.fillStyle = '#aaaaaa';
      ctx.fillText(`📍 ${d.landmark || d.type}`, 256, 48);
      ctx.fillStyle = '#888888';
      ctx.font = '11px JetBrains Mono, monospace';
      ctx.fillText('Unclaimed — available', 256, 66);
    }

    const tex = new THREE.CanvasTexture(canvas);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: isClaimed ? 0.95 : 0.7 }));
    const labelHeight = isClaimed ? 1.2 : 0.6;
    label.position.set(d.x, labelHeight, d.z);
    label.scale.set(d.w * 0.85, d.w * 0.14, 1);
    this.group.add(label);
  }

  createLandmarks() {
    LANDMARKS.forEach(lm => {
      // Landmark building — taller, distinctive
      const geo = new THREE.CylinderGeometry(0.15, 0.2, lm.h, 8);
      const mat = new THREE.MeshPhongMaterial({
        color: 0x887766, emissive: 0x332211, specular: 0x444444, shininess: 20,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(lm.x, lm.h / 2, lm.z);
      this.group.add(mesh);

      // Landmark label with dark bg
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 40;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.roundRect(20, 2, 216, 36, 6);
      ctx.fill();
      ctx.fillStyle = '#ffd700';
      ctx.font = '16px Space Grotesk, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${lm.icon} ${lm.name}`, 128, 26);
      const tex = new THREE.CanvasTexture(canvas);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.8 }));
      label.position.set(lm.x, lm.h + 0.4, lm.z);
      label.scale.set(2.5, 0.4, 1);
      this.group.add(label);
    });
  }

  createRoads() {
    const roads = [
      [{ x: -22, z: -7 }, { x: -16, z: -8 }, { x: -12, z: -7 }, { x: -7, z: -7 }, { x: -3, z: -6 }, { x: 0, z: -5 }, { x: 5, z: -5 }, { x: 10, z: -4 }, { x: 16, z: -5 }],
      [{ x: 0, z: -20 }, { x: 0, z: -15 }, { x: 0, z: -10 }, { x: 0, z: -5 }, { x: 0, z: 0 }, { x: 0, z: 5 }, { x: 0, z: 14 }],
      [{ x: -18, z: 0.5 }, { x: -12, z: 0 }, { x: -8, z: 0.5 }, { x: -4, z: 0.5 }, { x: 0, z: 0.5 }, { x: 4, z: 1 }, { x: 8, z: 1.5 }],
      [{ x: -18, z: 10 }, { x: -12, z: 10 }, { x: -6, z: 11 }, { x: 0, z: 10 }, { x: 6, z: 11 }, { x: 12, z: 12 }],
      [{ x: -12, z: 5 }, { x: -7, z: 5 }, { x: -2, z: 5 }, { x: 3, z: 5 }, { x: 8, z: 5 }, { x: 14, z: 6 }],
      [{ x: 0, z: 5 }, { x: 2, z: 7 }, { x: 4, z: 9 }, { x: 6, z: 11 }, { x: 10, z: 12 }],
    ];

    roads.forEach(roadPoints => {
      const pts = roadPoints.map(p => new THREE.Vector3(p.x, 0.02, p.z));
      const curve = new THREE.CatmullRomCurve3(pts);
      const linePoints = curve.getPoints(80);

      for (let i = 0; i < linePoints.length - 1; i++) {
        const p1 = linePoints[i];
        const p2 = linePoints[i + 1];
        const dir = new THREE.Vector3().subVectors(p2, p1).normalize();
        const perp = new THREE.Vector3(-dir.z, 0, dir.x);
        const w = 0.2;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute([
          p1.x + perp.x * w, 0.025, p1.z + perp.z * w,
          p1.x - perp.x * w, 0.025, p1.z - perp.z * w,
          p2.x + perp.x * w, 0.025, p2.z + perp.z * w,
          p2.x - perp.x * w, 0.025, p2.z - perp.z * w,
        ], 3));
        geo.setIndex([0, 1, 2, 1, 3, 2]);
        this.group.add(new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
          color: 0x555555, emissive: 0x222222, side: THREE.DoubleSide,
        })));
      }
    });
  }

  createTrees() {
    // Scatter trees across the map
    for (let i = 0; i < 150; i++) {
      const x = (Math.random() - 0.5) * 80;
      const z = (Math.random() - 0.5) * 60;
      // Don't place trees in the river
      const inRiver = THAMES_PATH.some((p, idx) => {
        if (idx === 0) return false;
        const prev = THAMES_PATH[idx - 1];
        const dx = x - (p.x + prev.x) / 2;
        const dz = z - (p.z + prev.z) / 2;
        return Math.sqrt(dx * dx + dz * dz) < 2;
      });
      if (inRiver) continue;

      const scale = 0.5 + Math.random() * 0.8;

      // Trunk
      const trunkGeo = new THREE.CylinderGeometry(0.03 * scale, 0.05 * scale, 0.4 * scale, 6);
      const trunkMat = new THREE.MeshPhongMaterial({ color: 0x5c3a1e, emissive: 0x1a0f08 });
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(x, 0.2 * scale, z);
      this.group.add(trunk);

      // Canopy — sphere for realistic tree
      const canopyGeo = new THREE.SphereGeometry(0.25 * scale, 8, 6);
      const canopyMat = new THREE.MeshPhongMaterial({
        color: new THREE.Color().setHSL(0.25 + Math.random() * 0.1, 0.5 + Math.random() * 0.2, 0.3 + Math.random() * 0.15),
        emissive: 0x0a1a05,
      });
      const canopy = new THREE.Mesh(canopyGeo, canopyMat);
      canopy.position.set(x, 0.5 * scale, z);
      this.group.add(canopy);
    }
  }

  createAmbience() {
    // Ambient dust / pollen particles
    const positions = [];
    for (let i = 0; i < 400; i++) {
      positions.push((Math.random() - 0.5) * 80, 0.5 + Math.random() * 10, (Math.random() - 0.5) * 65);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.particles = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xddddcc, size: 0.03, transparent: true, opacity: 0.2,
    }));
    this.group.add(this.particles);

    // Street lamps in claimed areas
    LONDON_DISTRICTS.filter(d => d.claimed).forEach(d => {
      for (let i = 0; i < 8; i++) {
        const lx = d.x + (Math.random() - 0.5) * d.w * 0.8;
        const lz = d.z + (Math.random() - 0.5) * d.d * 0.8;
        // Pole
        const poleGeo = new THREE.CylinderGeometry(0.015, 0.02, 1.2, 6);
        const poleMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(lx, 0.6, lz);
        this.group.add(pole);
        // Lamp head
        const lampGeo = new THREE.SphereGeometry(0.04, 6, 6);
        const lampMat = new THREE.MeshBasicMaterial({ color: 0xffeeaa });
        const lamp = new THREE.Mesh(lampGeo, lampMat);
        lamp.position.set(lx, 1.25, lz);
        this.group.add(lamp);
        // Light
        const pLight = new THREE.PointLight(0xffeeaa, 0.15, 3);
        pLight.position.set(lx, 1.25, lz);
        this.group.add(pLight);
      }
    });
  }

  // === AGENTS — Human-like ===
  spawnAgents() {
    if (this.agentMeshes.length > 0) {
      this.agentMeshes.forEach(m => { m.visible = true; });
      return;
    }
    const district = LONDON_DISTRICTS.find(d => d.claimed);
    if (!district) return;

    AGENTS.forEach((agent, i) => {
      const agentGroup = new THREE.Group();
      const c = new THREE.Color(agent.color);

      // Legs
      for (let side = -1; side <= 1; side += 2) {
        const legGeo = new THREE.CylinderGeometry(0.03, 0.035, 0.3, 6);
        const legMat = new THREE.MeshPhongMaterial({ color: 0x2a2a3a, emissive: 0x0a0a10 });
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.position.set(side * 0.05, 0.15, 0);
        leg.name = side === -1 ? 'leftLeg' : 'rightLeg';
        agentGroup.add(leg);
      }

      // Torso
      const torsoGeo = new THREE.BoxGeometry(0.18, 0.25, 0.1);
      const torsoMat = new THREE.MeshPhongMaterial({
        color: agent.color, emissive: new THREE.Color(agent.color).multiplyScalar(0.2),
        specular: 0x333333, shininess: 15,
      });
      const torso = new THREE.Mesh(torsoGeo, torsoMat);
      torso.position.y = 0.43;
      agentGroup.add(torso);

      // Arms
      for (let side = -1; side <= 1; side += 2) {
        const armGeo = new THREE.CylinderGeometry(0.02, 0.025, 0.22, 6);
        const armMat = new THREE.MeshPhongMaterial({ color: agent.color, emissive: new THREE.Color(agent.color).multiplyScalar(0.15) });
        const arm = new THREE.Mesh(armGeo, armMat);
        arm.position.set(side * 0.12, 0.4, 0);
        arm.name = side === -1 ? 'leftArm' : 'rightArm';
        agentGroup.add(arm);
      }

      // Head
      const headGeo = new THREE.SphereGeometry(0.08, 12, 10);
      const headMat = new THREE.MeshPhongMaterial({
        color: 0xd4a574, emissive: 0x4a3020, specular: 0x222222, shininess: 20,
      });
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.y = 0.64;
      agentGroup.add(head);

      // Hair
      const hairGeo = new THREE.SphereGeometry(0.075, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      const hairMat = new THREE.MeshPhongMaterial({ color: 0x2a1a0a });
      const hair = new THREE.Mesh(hairGeo, hairMat);
      hair.position.y = 0.66;
      agentGroup.add(hair);

      // Name label with bg
      const nameCanvas = document.createElement('canvas');
      nameCanvas.width = 256; nameCanvas.height = 48;
      const nctx = nameCanvas.getContext('2d');
      nctx.fillStyle = 'rgba(0,0,0,0.55)';
      nctx.beginPath();
      nctx.roundRect(40, 4, 176, 38, 6);
      nctx.fill();
      nctx.fillStyle = '#ffffff';
      nctx.font = 'bold 20px Space Grotesk, sans-serif';
      nctx.textAlign = 'center';
      nctx.fillText(agent.emoji + ' ' + agent.name, 128, 30);
      const nameTex = new THREE.CanvasTexture(nameCanvas);
      const nameLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTex, transparent: true }));
      nameLabel.position.y = 0.95;
      nameLabel.scale.set(1, 0.2, 1);
      agentGroup.add(nameLabel);

      // Status indicator
      const statusGroup = new THREE.Group();
      statusGroup.position.y = 1.1;

      const dotGeo = new THREE.SphereGeometry(0.035, 8, 8);
      const dotMat = new THREE.MeshBasicMaterial({ color: 0x22cc44 });
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.name = 'liveDot';
      statusGroup.add(dot);

      const stuckGroup = new THREE.Group();
      stuckGroup.name = 'stuckSign';
      stuckGroup.visible = false;
      const triShape = new THREE.Shape();
      triShape.moveTo(0, 0.12);
      triShape.lineTo(-0.09, -0.04);
      triShape.lineTo(0.09, -0.04);
      triShape.lineTo(0, 0.12);
      stuckGroup.add(new THREE.Mesh(new THREE.ShapeGeometry(triShape), new THREE.MeshBasicMaterial({ color: 0xff3333, side: THREE.DoubleSide })));
      statusGroup.add(stuckGroup);
      agentGroup.add(statusGroup);

      const isStuck = Math.random() > 0.88;
      const status = isStuck ? AGENT_STATUS.STUCK : AGENT_STATUS.LIVE;

      const path = this.getAgentPath(district, agent, i);
      agentGroup.position.set(path[0].x, 0, path[0].z);
      agentGroup.userData = { agentIndex: i, type: 'agent' };
      this.group.add(agentGroup);
      this.agentMeshes.push(agentGroup);
      this.agentPaths.push({ points: path, currentIndex: 0, t: 0, speed: 0.002 + Math.random() * 0.002 });
      this.agentStatuses.push(status);
      this.statusIndicators.push(statusGroup);
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
      if (liveDot) { liveDot.visible = true; liveDot.material.color.setHex(0x22cc44); }
      if (stuckSign) stuckSign.visible = false;
    } else if (status === AGENT_STATUS.STUCK) {
      if (liveDot) liveDot.visible = false;
      if (stuckSign) stuckSign.visible = true;
      this.agentPaths[index].speed = 0;
    } else if (status === AGENT_STATUS.IDLE) {
      if (liveDot) { liveDot.visible = true; liveDot.material.color.setHex(0xddaa00); }
      if (stuckSign) stuckSign.visible = false;
      this.agentPaths[index].speed = 0;
    }
  }

  hideAgents() { this.agentMeshes.forEach(m => { m.visible = false; }); }

  getAgentPath(district, agent, index) {
    const cx = district.x, cz = district.z;
    const hw = district.w * 0.3, hd = district.d * 0.3;
    const patterns = [
      [{ x: cx, z: cz - hd }, { x: cx + hw, z: cz - hd }, { x: cx + hw, z: cz }, { x: cx, z: cz }, { x: cx - hw * 0.5, z: cz + hd * 0.5 }, { x: cx, z: cz - hd }],
      [{ x: cx - hw, z: cz }, { x: cx - hw * 0.5, z: cz - hd }, { x: cx + hw * 0.5, z: cz - hd }, { x: cx + hw, z: cz }, { x: cx + hw * 0.5, z: cz + hd * 0.5 }, { x: cx - hw, z: cz }],
      [{ x: cx, z: cz - hd }, { x: cx + hw, z: cz }, { x: cx, z: cz + hd * 0.5 }, { x: cx - hw, z: cz }, { x: cx, z: cz - hd }],
      [{ x: cx - hw, z: cz + hd }, { x: cx - hw - 0.5, z: cz + hd + 0.5 }, { x: cx - hw - 0.5, z: cz }, { x: cx - hw, z: cz - hd }, { x: cx, z: cz - hd }, { x: cx, z: cz }, { x: cx - hw, z: cz + hd }],
    ];
    return patterns[index % patterns.length];
  }

  update(time) {
    if (!this.visible) return;
    this.time = time;

    // Animate agents — walking motion
    this.agentMeshes.forEach((mesh, i) => {
      if (!mesh.visible) return;
      const pd = this.agentPaths[i];
      if (pd.speed === 0) return;

      pd.t += pd.speed;
      if (pd.t >= 1) { pd.t = 0; pd.currentIndex = (pd.currentIndex + 1) % pd.points.length; }
      const curr = pd.points[pd.currentIndex];
      const next = pd.points[(pd.currentIndex + 1) % pd.points.length];
      mesh.position.x = curr.x + (next.x - curr.x) * pd.t;
      mesh.position.z = curr.z + (next.z - curr.z) * pd.t;

      // Walking bob
      mesh.position.y = Math.abs(Math.sin(time * 8 + i * 2)) * 0.015;

      // Face direction
      const dx = next.x - curr.x, dz = next.z - curr.z;
      if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) mesh.rotation.y = Math.atan2(dx, dz);

      // Leg animation
      const legSwing = Math.sin(time * 8 + i * 2) * 0.3;
      mesh.children.forEach(child => {
        if (child.name === 'leftLeg') child.rotation.x = legSwing;
        if (child.name === 'rightLeg') child.rotation.x = -legSwing;
        if (child.name === 'leftArm') child.rotation.x = -legSwing * 0.6;
        if (child.name === 'rightArm') child.rotation.x = legSwing * 0.6;
      });
    });

    // Pulse status dots
    this.statusIndicators.forEach((sg, i) => {
      if (this.agentStatuses[i] === AGENT_STATUS.LIVE) {
        const dot = sg.children.find(c => c.name === 'liveDot');
        if (dot) dot.material.opacity = 0.7 + 0.3 * Math.sin(time * 3 + i);
      } else if (this.agentStatuses[i] === AGENT_STATUS.STUCK) {
        const sign = sg.children.find(c => c.name === 'stuckSign');
        if (sign) { sign.position.y = Math.sin(time * 2) * 0.04; }
      }
    });

    // Float particles
    if (this.particles) {
      const pos = this.particles.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        pos.setY(i, pos.getY(i) + Math.sin(time * 0.2 + i * 0.03) * 0.0005);
        pos.setX(i, pos.getX(i) + Math.sin(time * 0.1 + i * 0.05) * 0.0003);
      }
      pos.needsUpdate = true;
    }
  }

  show() { this.visible = true; this.group.visible = true; }
  hide() { this.visible = false; this.group.visible = false; }
  getAgentMeshes() { return this.agentMeshes; }
  getDistrictMeshes() { return this.districtMeshes; }
}
