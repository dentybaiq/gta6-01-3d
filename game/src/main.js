// Solara Bay 3D — game loop: driving, wanted, missions, combat, HUD, shots.
// Plain script, no modules: config.js, city.js and vehicles.js load first and
// expose CFG, MISSIONS, WEAPONS, buildCity and Vehicles as globals.
(function () {
  'use strict';
  window.__errors = [];
  window.addEventListener('error', (e) => window.__errors.push(String((e && e.message) || e)));
  const params = new URLSearchParams(location.search);
  const shotMode = params.get('shot'); // start|drive|chase|mission|null
  const $ = (id) => document.getElementById(id);

  // ---------- save ----------
  let save = { cash: 0, mission: 0, best: 0 };
  try { const s = JSON.parse(localStorage.getItem(CFG.saveKey) || 'null'); if (s) save = Object.assign(save, s); } catch (e) {}
  function persist() { try { localStorage.setItem(CFG.saveKey, JSON.stringify(save)); } catch (e) {} }

  // ---------- renderer / scene ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  $('app').appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 2000);
  camera.position.set(40, 30, 220);
  camera.lookAt(0, 8, -60);
  const city = buildCity(scene);

  // ---------- state ----------
  const state = {
    started: false, paused: false, over: false,
    cash: save.cash, mission: Math.min(save.mission, MISSIONS.length - 1),
    health: 100, wanted: 0,
    weapon: 0, ammo: WEAPONS.map((w) => w.startAmmo), owned: WEAPONS.map((w, i) => i === 0),
    clockMin: CFG.clockStartMin, missionDeadline: 0, firing: false, lastShot: -99,
    lastCrime: -99, bustedTimer: 0, elapsed: 0, frames: 0,
    stage: 0, truckHit: false, mute: false, sirenHigh: false, sirenAt: 0,
  };
  const onFoot = { active: false, heading: 0, speed: 0 }; // walking mode (E to exit car)

  // ---------- input ----------
  const keys = {};
  addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'KeyM') { state.mute = !state.mute; }
    if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
    if (e.code === 'KeyR' && state.over) respawn();
    if (e.code === 'KeyE') toggleOnFoot();
    if (e.code === 'Digit1') selectWeapon(0);
    if (e.code === 'Digit2') selectWeapon(1);
    if (e.code === 'Digit3') selectWeapon(2);
    if (e.code === 'KeyQ') selectWeapon((state.weapon + 1) % WEAPONS.length);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', (e) => { keys[e.code] = false; });
  addEventListener('mousedown', (e) => { ensureAudio(); if (state.started && !state.paused && !state.over) { state.firing = true; shoot(); } });
  addEventListener('mouseup', () => { state.firing = false; });
  function selectWeapon(i) {
    if (!state.owned[i]) { toast(WEAPONS[i].name + ' not unlocked — find a weapon pickup'); return; }
    state.weapon = i;
    toast(WEAPONS[i].name + ' equipped');
  }
  $('menu').addEventListener('click', startGame);
  $('resume-btn').addEventListener('click', togglePause);
  $('busted-btn').addEventListener('click', respawn);
  $('wasted-btn').addEventListener('click', respawn);
  $('win-btn').addEventListener('click', () => { $('win').classList.add('hidden'); state.over = false; });

  // ---------- player ----------
  const player = Vehicles.makeCar(CFG.playerColor, { player: true, hp: 100 });
  player.group.position.set(0, 0, 96);
  scene.add(player.group);
  const fwd = (h) => ({ x: Math.sin(h), z: Math.cos(h) });

  // ---------- world actors ----------
  const traffic = Vehicles.makeTraffic(city, 20); // busier rush hour: 20 cars, two body shapes
  traffic.forEach((c) => scene.add(c.group));
  const peds = Vehicles.makePeds(18);
  peds.forEach((p) => scene.add(p.group));
  const police = [];   // {car, ramAt}
  let heli = null;
  let heli2 = null;    // second helicopter joins at five stars
  let roadblock = null; let roadblockAt = -99;
  let truck = null;    // vault truck for ram/heist missions
  let targetCar = null; // gold Comet for the steal mission
  const particles = []; // {mesh, life, max, vy, grow}
  const tracers = [];   // {mesh, life}
  const explosions = [];
  const pickups = [];
  const pickupKinds = [
    { kind: 'cash', color: 0x37d67a, label: '+$150' },
    { kind: 'ammo', color: 0xffd24a, label: '+20 AMMO' },
    { kind: 'health', color: 0xff5a5a, label: '+30 HP' },
    { kind: 'smg', color: 0x4ad8ff, label: 'SMG UNLOCKED' },
    { kind: 'shotgun', color: 0xd84ad8, label: 'SHOTGUN UNLOCKED' },
  ];
  for (let i = 0; i < 12; i++) {
    const k = pickupKinds[i % 3];
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6),
      new THREE.MeshBasicMaterial({ color: k.color }));
    const p = city.randomRoadPoint();
    m.position.set(p.x, 1.2, p.z);
    scene.add(m);
    pickups.push({ mesh: m, kind: k.kind, label: k.label, x: p.x, z: p.z, taken: 0 });
  }

  // Mission beacon: glowing column + ground ring at the target.
  const beacon = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 70, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.y = 35; beacon.add(beam);
  const ring = new THREE.Mesh(new THREE.RingGeometry(3, 5, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15; beacon.add(ring);
  const beaconLight = new THREE.PointLight(0xffd24a, 1.0, 70);
  beaconLight.position.y = 6; beacon.add(beaconLight);
  scene.add(beacon);

  // ---------- helpers ----------
  function toast(msg, ms = 2600) {
    const t = $('toast');
    t.textContent = msg; t.style.opacity = '1';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.style.opacity = '0'; }, ms);
  }
  // Raising the heat: at most one star per 4 seconds, so a single crime spree
  // cannot jump the player straight to six stars.
  function crime() {
    if (state.elapsed - state.lastCrime < 4) return;
    state.lastCrime = state.elapsed;
    if (state.wanted < CFG.maxWanted) state.wanted++;
  }
  function explode(x, z, big) {
    const e = Vehicles.makeExplosion(scene, x, z);
    if (big) e.ball.scale.set(1.6, 1.6, 1.6);
    explosions.push(e);
    sfxExplosion();
    return e;
  }
  function addSmoke(x, y, z) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0x333333, transparent: true, opacity: 0.8 }));
    m.position.set(x, y, z);
    scene.add(m);
    particles.push({ mesh: m, life: 0, max: 1.6, vy: 2.2, grow: 1.4 });
  }
  function damageCar(car, amount, byPlayer) {
    if (car.dead) return;
    car.hp -= amount;
    if (car.hp <= 0) {
      car.dead = true;
      explode(car.group.position.x, car.group.position.z, car.isPlayer);
      if (byPlayer) crime();
      if (car.isPolice) state.cash = Math.max(0, state.cash + 50);
      scene.remove(car.group);
      if (car.isPlayer) { state.health = 0; wasted(); }
    }
  }
  function collideBuildings(obj, radius) {
    // obj: {x, z} moved this frame; push out of any building AABB it entered.
    const p = obj;
    for (const c of city.colliders) {
      if (p.x > c.minX - radius && p.x < c.maxX + radius && p.z > c.minZ - radius && p.z < c.maxZ + radius) {
        const dxl = p.x - (c.minX - radius), dxr = (c.maxX + radius) - p.x;
        const dzl = p.z - (c.minZ - radius), dzr = (c.maxZ + radius) - p.z;
        const m = Math.min(dxl, dxr, dzl, dzr);
        if (m === dxl) p.x = c.minX - radius;
        else if (m === dxr) p.x = c.maxX + radius;
        else if (m === dzl) p.z = c.minZ - radius;
        else p.z = c.maxZ + radius;
        return true;
      }
    }
    return false;
  }

  // ---------- game flow ----------
  function startGame() {
    if (state.started) return;
    state.started = true;
    $('menu').classList.add('hidden');
    $('hud').classList.add('on');
    ensureAudio();
    setupMission();
    toast(MISSIONS[state.mission].title + ' — ' + MISSIONS[state.mission].brief, 4200);
  }
  function togglePause() {
    if (!state.started || state.over) return;
    state.paused = !state.paused;
    $('pause').classList.toggle('hidden', !state.paused);
  }
  function toggleOnFoot() {
    if (!state.started || state.paused || state.over) return;
    onFoot.active = !onFoot.active;
    if (onFoot.active) {
      onFoot.heading = player.heading;
      toast('On foot — WASD to walk, E to get back in the car');
    }
  }
  function respawn() {
    state.over = false; state.health = 100; state.wanted = 0; state.bustedTimer = 0;
    player.hp = 100; player.dead = false; player.speed = 0;
    player.group.position.set(0, 0, 96); player.heading = Math.PI;
    player.group.rotation.y = player.heading;
    if (!scene.children.includes(player.group)) scene.add(player.group);
    $('busted').classList.add('hidden'); $('wasted').classList.add('hidden');
    setupMission();
    toast('Back on the street, Kai.');
  }
  function busted() {
    if (state.over) return;
    state.over = true;
    state.cash = Math.max(0, state.cash - 150);
    $('busted').classList.remove('hidden');
    sfxBusted();
  }
  function wasted() {
    if (state.over) return;
    state.over = true;
    state.cash = Math.max(0, state.cash - 200);
    $('wasted').classList.remove('hidden');
  }
  function completeMission() {
    const m = MISSIONS[state.mission];
    state.cash += m.pay;
    save.cash = state.cash;
    toast('JOB DONE — ' + m.title + '  +$' + m.pay);
    sfxJingle();
    state.mission++;
    save.mission = state.mission;
    persist();
    if (state.mission >= MISSIONS.length) {
      state.over = true;
      $('win').classList.remove('hidden');
    } else {
      setupMission();
    }
  }

  // ---------- missions ----------
  function missionTarget() {
    const m = MISSIONS[state.mission];
    if (!m) return null;
    // Staged shot: a nearby beacon straight down the road so it reads on camera.
    if (shotMode === 'mission') return { x: 0, z: -64, label: 'Drive to the glowing beacon at the docks' };
    if (m.kind === 'pickup' && state.stage === 0) return { x: -224, z: -224, label: 'Pick up the package at the docks' };
    if ((m.kind === 'ram' || m.kind === 'heist') && !state.truckHit) return truck ? { x: truck.group.position.x, z: truck.group.position.z, label: m.kind === 'heist' ? 'Ram the ARMORED vault truck!' : 'Ram the vault truck!' } : { x: m.target[0], z: m.target[1], label: 'Find the vault truck' };
    if (m.kind === 'steal' && state.stage === 0) return targetCar ? { x: targetCar.group.position.x, z: targetCar.group.position.z, label: 'Steal the gold Comet' } : { x: m.target[0], z: m.target[1], label: 'Find the gold Comet' };
    if (m.kind === 'cooldown') return { x: m.target[0], z: m.target[1], label: 'Lose the cops — stay out of sight until the heat dies' };
    return { x: m.target[0], z: m.target[1], label: m.objective };
  }
  // keepStage = true keeps the current stage/truckHit (used when a job moves to its
  // second leg); a fresh call resets the job. Without this, pickup/ram jobs could
  // never finish — the stage kept resetting to 0 on the transition.
  function setupMission(keepStage) {
    const m = MISSIONS[state.mission];
    if (!m) return;
    if (!keepStage) { state.stage = 0; state.truckHit = false; }
    if (truck && !keepStage) { scene.remove(truck.group); truck = null; }
    if (targetCar && !keepStage) { scene.remove(targetCar.group); targetCar = null; }
    if (m.kind === 'escape') { state.wanted = Math.max(state.wanted, 3); }
    if (m.kind === 'cooldown') { state.wanted = Math.max(state.wanted, 4); }
    if (m.kind === 'timed') { state.missionDeadline = state.elapsed + (m.limit || 75); }
    if ((m.kind === 'ram' || m.kind === 'heist') && !truck) {
      const heist = m.kind === 'heist';
      truck = Vehicles.makeCar(heist ? 0x1a1a26 : 0x3a3a44, { hp: heist ? 300 : 200 });
      truck.group.scale.set(heist ? 1.5 : 1.35, heist ? 1.35 : 1.25, heist ? 1.5 : 1.35);
      const p = city.randomRoadPoint();
      truck.group.position.set(p.x, 0, p.z);
      truck.heading = 0; truck.speed = 9; truck.axis = 'z'; truck.dir = 1;
      scene.add(truck.group);
      if (heist) state.wanted = Math.max(state.wanted, 5);
    }
    if (m.kind === 'steal' && state.stage === 0 && !targetCar) {
      targetCar = Vehicles.makeCar(0xffd24a, { hp: 100 });
      const p = city.randomRoadPoint();
      targetCar.group.position.set(p.x, 0, p.z);
      targetCar.heading = 0; targetCar.speed = 0;
      scene.add(targetCar.group);
    }
    const t = missionTarget();
    beacon.position.set(t.x, 0, t.z);
    $('mission-title').textContent = m.title.toUpperCase();
    $('objective-text').textContent = t.label;
  }

  // ---------- police ----------
  function spawnPolice() {
    const p = city.randomRoadPoint();
    const dx = p.x - player.group.position.x, dz = p.z - player.group.position.z;
    if (Math.hypot(dx, dz) < 50) return;
    const c = Vehicles.makeCar(0x111118, { police: true, hp: 120 });
    c.group.position.set(p.x, 0, p.z);
    c.heading = Math.atan2(player.group.position.x - p.x, player.group.position.z - p.z);
    c.group.rotation.y = c.heading;
    c.speed = 20;
    scene.add(c.group);
    police.push({ car: c, ramAt: 0 });
  }
  function updatePolice(dt) {
    // Six-star heat: five and six stars send up to six pursuit cars.
    const want = state.wanted >= 5 ? Math.min(state.wanted, 6) : Math.min(state.wanted, 4);
    while (police.length < want) spawnPolice();
    const pp = player.group.position;
    for (let i = police.length - 1; i >= 0; i--) {
      const p = police[i], c = p.car;
      if (c.dead) { police.splice(i, 1); continue; }
      if (state.wanted === 0) {
        // Heat off: cops peel away and leave.
        c.speed = Math.max(0, c.speed - 10 * dt);
        c.group.position.x += Math.sin(c.heading) * c.speed * dt;
        c.group.position.z += Math.cos(c.heading) * c.speed * dt;
        if (Math.hypot(c.group.position.x - pp.x, c.group.position.z - pp.z) > 160) {
          scene.remove(c.group); police.splice(i, 1);
        }
        continue;
      }
      const dx = pp.x - c.group.position.x, dz = pp.z - c.group.position.z;
      const dist = Math.hypot(dx, dz);
      const wantHeading = Math.atan2(dx, dz);
      let dh = wantHeading - c.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      c.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, dh));
      c.group.rotation.y = c.heading;
      // At six stars the PD is faster than you: top speed grows with the heat.
      const topSpeed = 24 + state.wanted * 1.5;
      const targetSpeed = Math.min(Math.abs(player.speed) + 3, topSpeed);
      c.speed += (targetSpeed - c.speed) * Math.min(1, dt * 1.5);
      c.group.position.x += Math.sin(c.heading) * c.speed * dt;
      c.group.position.z += Math.cos(c.heading) * c.speed * dt;
      // Light bar flashes red/blue.
      const bar = c.group.userData.lightBar;
      if (bar) bar.material.color.setHex(Math.floor(state.elapsed * 6) % 2 ? 0xff2222 : 0x2244ff);
      // Ram the player — harder and more often at five stars and up.
      if (dist < 4 && state.elapsed - p.ramAt > (state.wanted >= 5 ? 0.6 : 0.8)) {
        p.ramAt = state.elapsed;
        state.health = Math.max(0, state.health - (state.wanted >= 5 ? 6 : 4));
        player.speed *= 0.7;
        if (state.health <= 0) wasted();
      }
      // Cops also crash into buildings.
      const pos = c.group.position;
      if (collideBuildings(pos, 2)) c.speed *= 0.5;
      // Smoke when hurt.
      if (c.hp < 50 && !c.smoking) { c.smoking = true; }
      if (c.smoking && Math.random() < 0.3) addSmoke(pos.x, 1.6, pos.z);
    }
    // Roadblock at wanted 3+: one set, re-placed ahead of the player.
    // At five stars the block is denser and re-forms faster.
    if (state.wanted >= 3) {
      const dense = state.wanted >= 5;
      if (!roadblock || state.elapsed - roadblockAt > (dense ? 10 : 14)) {
        if (roadblock) scene.remove(roadblock);
        const f = fwd(player.heading);
        roadblock = Vehicles.makeRoadblock(dense);
        roadblock.position.set(pp.x + f.x * 55, 0, pp.z + f.z * 55);
        roadblock.rotation.y = player.heading;
        scene.add(roadblock);
        roadblockAt = state.elapsed;
      }
      if (!heli) { heli = Vehicles.makeHeli(); scene.add(heli.group); }
    } else if (roadblock) { scene.remove(roadblock); roadblock = null; }
    if (heli) {
      if (state.wanted < 3) { scene.remove(heli.group); heli = null; }
      else {
        heli.angle += dt * (shotMode ? 0.1 : 0.5);
        const hr = heli.radius || 26, hh = heli.height || 42;
        heli.group.position.set(pp.x + Math.cos(heli.angle) * hr, hh, pp.z + Math.sin(heli.angle) * hr);
        heli.group.rotation.y = heli.angle + Math.PI / 2;
        heli.rotor.rotation.y += dt * 22;
      }
    }
    // Five-star heat: a second helicopter joins the hunt, lower and closer.
    if (state.wanted >= 5) {
      if (!heli2) { heli2 = Vehicles.makeHeli(); heli2.angle = Math.PI; heli2.radius = 20; heli2.height = 28; scene.add(heli2.group); }
    } else if (heli2) { scene.remove(heli2.group); heli2 = null; }
    if (heli2) {
      heli2.angle += dt * (shotMode ? 0.1 : 0.5);
      heli2.group.position.set(pp.x + Math.cos(heli2.angle) * (heli2.radius || 20), heli2.height || 28, pp.z + Math.sin(heli2.angle) * (heli2.radius || 20));
      heli2.group.rotation.y = heli2.angle + Math.PI / 2;
      heli2.rotor.rotation.y += dt * 22;
    }
    // Wanted fades when quiet and no cop nearby.
    if (state.wanted > 0 && state.elapsed - state.lastCrime > 10) {
      const near = police.some((p) => Math.hypot(p.car.group.position.x - pp.x, p.car.group.position.z - pp.z) < 40);
      if (!near && Math.floor(state.elapsed) % 6 === 0 && state.elapsed - (updatePolice._lastFade || 0) > 6) {
        updatePolice._lastFade = state.elapsed;
        state.wanted--;
      }
    }
    // Busted: standing still next to a cop while wanted.
    if (state.wanted > 0 && Math.abs(player.speed) < 0.6 && !onFoot.active) {
      const near = police.some((p) => Math.hypot(p.car.group.position.x - pp.x, p.car.group.position.z - pp.z) < 7);
      state.bustedTimer = near ? state.bustedTimer + dt : 0;
      if (state.bustedTimer > 3) busted();
    } else state.bustedTimer = 0;
  }

  // ---------- combat ----------
  const raycaster = new THREE.Raycaster();
  function carMeshes() {
    const list = [];
    for (const c of traffic) if (!c.dead) list.push({ mesh: c.body, car: c });
    for (const p of police) if (!p.car.dead) list.push({ mesh: p.car.body, car: p.car });
    if (truck && !truck.dead) list.push({ mesh: truck.body, car: truck });
    return list;
  }
  function shoot() {
    const w = WEAPONS[state.weapon];
    if (state.elapsed - state.lastShot < w.rate) return; // fire-rate gate
    if (state.ammo[state.weapon] <= 0) { toast('OUT OF ' + w.name + ' AMMO — find a pickup'); return; }
    state.ammo[state.weapon]--;
    state.lastShot = state.elapsed;
    crime();
    sfxShot();
    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const hits = raycaster.intersectObjects(carMeshes().map((c) => c.mesh), false);
    let end;
    if (hits.length) {
      const hit = hits[0];
      end = hit.point;
      const entry = carMeshes().find((c) => c.mesh === hit.object);
      if (entry) {
        damageCar(entry.car, w.damage, true);
        if (w.id === 'shotgun') {
          // Shotgun splash: nearby cars catch pellets too.
          for (const c of carMeshes()) {
            if (c.car !== entry.car && c.car.group.position.distanceTo(hit.point) < 7) damageCar(c.car, 30, true);
          }
        }
        if (entry.car === truck && !state.truckHit) {
          state.truckHit = true;
          state.cash += 300;
          toast('VAULT CRACKED — +$300, now vanish to the safehouse!');
          if (truck) { scene.remove(truck.group); truck = null; }
          setupMission(true);
        }
      }
    } else {
      end = raycaster.ray.at(120, new THREE.Vector3());
    }
    // Tracer from the player car to the hit point.
    const start = player.group.position.clone(); start.y = 1.4;
    const len = start.distanceTo(end);
    const tr = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, len),
      new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.9 }));
    tr.position.copy(start).lerp(end, 0.5);
    tr.lookAt(end);
    scene.add(tr);
    tracers.push({ mesh: tr, life: 0 });
  }

  // ---------- traffic & peds ----------
  function updateTraffic(dt) {
    const pp = player.group.position;
    for (const c of traffic) {
      if (c.dead) continue;
      const distP = Math.hypot(c.group.position.x - pp.x, c.group.position.z - pp.z);
      if (distP < 9 && Math.abs(player.speed) > 2) c.speed = Math.max(0, c.speed - 14 * dt);
      else c.speed += (8 + ((c.group.position.x * 7 + c.group.position.z * 13) % 5) - c.speed) * Math.min(1, dt);
      c.group.position.x += Math.sin(c.heading) * c.speed * dt;
      c.group.position.z += Math.cos(c.heading) * c.speed * dt;
      c.group.rotation.y = c.heading;
      // Turn at intersections, wrap at the city edge.
      const gx = Math.round(c.group.position.x / CFG.block) * CFG.block;
      const gz = Math.round(c.group.position.z / CFG.block) * CFG.block;
      if (Math.abs(c.group.position.x - gx) < 2 && Math.abs(c.group.position.z - gz) < 2 && Math.random() < 0.02) {
        c.heading += (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
      }
      if (Math.abs(c.group.position.x) > 300 || Math.abs(c.group.position.z) > 300) {
        c.group.position.x *= -0.9; c.group.position.z *= -0.9;
      }
      // Collision with the player.
      if (distP < 3.4 && Math.abs(player.speed) > 1) {
        c.hp -= 18; player.speed *= 0.75;
        state.health = Math.max(0, state.health - 2);
        if (c.hp <= 0) damageCar(c, 999, true);
        else if (c.hp < 45) addSmoke(c.group.position.x, 1.6, c.group.position.z);
      }
      if (c.hp < 50 && !c.smoking) c.smoking = true;
      if (c.smoking && Math.random() < 0.25) addSmoke(c.group.position.x, 1.6, c.group.position.z);
    }
    if (truck && !truck.dead) {
      truck.group.position.x += Math.sin(truck.heading) * truck.speed * dt;
      truck.group.position.z += Math.cos(truck.heading) * truck.speed * dt;
      truck.group.rotation.y = truck.heading;
      if (Math.abs(truck.group.position.x) > 280 || Math.abs(truck.group.position.z) > 280) truck.heading += Math.PI / 2;
      // Ram the truck: speed + contact = cracked.
      const d = Math.hypot(truck.group.position.x - pp.x, truck.group.position.z - pp.z);
      if (d < 5 && Math.abs(player.speed) > 8 && !state.truckHit) {
        state.truckHit = true;
        state.cash += 300;
        damageCar(truck, 60, true);
        toast('VAULT CRACKED — +$300, now vanish to the safehouse!');
        scene.remove(truck.group); truck = null;
        setupMission(true);
      }
    }
  }
  function updatePeds(dt) {
    const pp = player.group.position;
    for (const p of peds) {
      p.walkPhase += dt * 6;
      const run = Math.hypot(p.x - pp.x, p.z - pp.z) < 8 && Math.abs(player.speed) > 4;
      const sp = run ? 6 : p.speed;
      p.x += Math.sin(p.heading) * sp * dt;
      p.z += Math.cos(p.heading) * sp * dt;
      if (Math.random() < 0.005) p.heading += (Math.random() - 0.5) * 2;
      if (Math.abs(p.x) > 300 || Math.abs(p.z) > 300) p.heading += Math.PI;
      p.group.position.set(p.x, Math.abs(Math.sin(p.walkPhase)) * 0.06, p.z);
      p.group.rotation.y = p.heading;
      // Hit by the player car.
      const d = Math.hypot(p.x - pp.x, p.z - pp.z);
      if (d < 1.8 && Math.abs(player.speed) > 5) {
        crime();
        p.group.rotation.x = Math.PI / 2;
        p.x = (Math.random() - 0.5) * 400; p.z = (Math.random() - 0.5) * 400;
        setTimeout(() => { p.group.rotation.x = 0; }, 2500);
        player.speed *= 0.8;
      }
    }
  }

  // ---------- player update ----------
  function updatePlayer(dt) {
    if (onFoot.active) {
      const f = fwd(onFoot.heading);
      let mv = 0;
      if (keys.KeyW || keys.ArrowUp) mv = 1;
      if (keys.KeyS || keys.ArrowDown) mv = -0.6;
      if (keys.KeyA || keys.ArrowLeft) onFoot.heading += 2.6 * dt;
      if (keys.KeyD || keys.ArrowRight) onFoot.heading -= 2.6 * dt;
      onFoot.speed += ((mv * 5) - onFoot.speed) * Math.min(1, dt * 8);
      player.group.position.x += f.x * onFoot.speed * dt;
      player.group.position.z += f.z * onFoot.speed * dt;
      player.group.position.x = Math.max(-310, Math.min(310, player.group.position.x));
      player.group.position.z = Math.max(-310, Math.min(310, player.group.position.z));
      return;
    }
    const accel = (keys.KeyW || keys.ArrowUp) ? 20 : 0;
    const brake = (keys.KeyS || keys.ArrowDown) ? 1 : 0;
    const hand = keys.Space ? 1 : 0;
    player.speed += accel * dt;
    if (brake) player.speed -= (player.speed > 0 ? 30 : 12) * dt;
    if (hand) player.speed *= Math.max(0, 1 - 3 * dt);
    player.speed -= player.speed * 0.55 * dt; // drag
    if (player.speed > 36) player.speed = 36;
    if (player.speed < -11) player.speed = -11;
    if (Math.abs(player.speed) < 0.15 && !accel) player.speed = 0;
    const steer = ((keys.KeyA || keys.ArrowLeft) ? 1 : 0) - ((keys.KeyD || keys.ArrowRight) ? 1 : 0);
    const turn = steer * 2.0 * Math.min(1, Math.abs(player.speed) / 8) * (player.speed < 0 ? -1 : 1);
    player.heading += turn * dt * (hand ? 1.5 : 1);
    const f = fwd(player.heading);
    const px = player.group.position.x, pz = player.group.position.z;
    player.group.position.x += f.x * player.speed * dt;
    player.group.position.z += f.z * player.speed * dt;
    player.group.rotation.y = player.heading;
    const hit = collideBuildings(player.group.position, 2.1);
    if (hit) {
      if (Math.abs(player.speed) > 14) {
        state.health = Math.max(0, state.health - 6);
        sfxThud();
        if (state.health <= 0) wasted();
      }
      player.speed *= 0.45;
    }
    player.group.position.x = Math.max(-315, Math.min(315, player.group.position.x));
    player.group.position.z = Math.max(-315, Math.min(315, player.group.position.z));
    // Pickups.
    for (const pk of pickups) {
      if (pk.taken > 0) { pk.taken -= dt; if (pk.taken <= 0) { const p = city.randomRoadPoint(); pk.x = p.x; pk.z = p.z; pk.mesh.visible = true; } continue; }
      pk.mesh.rotation.y += dt * 2;
      pk.mesh.position.y = 1.2 + Math.sin(state.elapsed * 3 + pk.x) * 0.25;
      const d = Math.hypot(pk.x - player.group.position.x, pk.z - player.group.position.z);
      if (d < 3.2) {
        pk.taken = 15; pk.mesh.visible = false;
        if (pk.kind === 'cash') { state.cash += 150; toast('+$150 street cash'); }
        if (pk.kind === 'ammo') { state.ammo[state.weapon] += 20; toast('+20 ' + WEAPONS[state.weapon].name + ' AMMO'); }
        if (pk.kind === 'health') { state.health = Math.min(100, state.health + 30); toast('+30 HP'); }
        if (pk.kind === 'smg' || pk.kind === 'shotgun') {
          const wi = pk.kind === 'smg' ? 1 : 2;
          state.owned[wi] = true; state.ammo[wi] += WEAPONS[wi].startAmmo;
          state.weapon = wi; toast(WEAPONS[wi].name + ' UNLOCKED — press ' + (wi + 1) + ' to switch');
        }
        sfxPickup();
      }
    }
    // Mission progress.
    const t = missionTarget();
    if (t) {
      beacon.position.set(t.x, 0, t.z);
      const d = Math.hypot(t.x - px, t.z - pz);
      if (d < 13) {
        const m = MISSIONS[state.mission];
        if (m.kind === 'pickup' && state.stage === 0) {
          state.stage = 1;
          toast('Package grabbed — deliver it to Coral Heights!');
          setupMission(true);
        } else if (m.kind === 'steal' && state.stage === 0) {
          state.stage = 1;
          state.cash += 200;
          toast('Comet stolen — +$200, deliver it to the chop shop!');
          setupMission(true);
        } else if ((m.kind === 'ram' || m.kind === 'heist') && !state.truckHit) {
          // Reached the marker without cracking the truck: nothing yet.
        } else if (m.kind === 'cooldown') {
          // Reaching the corner is not enough — the heat has to die first.
        } else {
          completeMission();
        }
      }
    }
  }

  // ---------- camera ----------
  const camPos = new THREE.Vector3(40, 30, 220);
  const camLook = new THREE.Vector3(0, 8, -60);
  function updateCamera(dt) {
    if (!state.started || shotMode === 'start') {
      camera.position.lerp(camPos, 1 - Math.pow(0.01, dt));
      camLook.lerp(new THREE.Vector3(0, 8, -60), 1 - Math.pow(0.01, dt));
      camera.lookAt(camLook);
      return;
    }
    const p = player.group.position;
    const f = fwd(onFoot.active ? onFoot.heading : player.heading);
    const desired = new THREE.Vector3(p.x - f.x * 11, 5.4, p.z - f.z * 11);
    camera.position.lerp(desired, 1 - Math.pow(0.002, dt));
    const look = new THREE.Vector3(p.x + f.x * 10, 1.6, p.z + f.z * 10);
    camLook.lerp(look, 1 - Math.pow(0.001, dt));
    camera.lookAt(camLook);
  }

  // ---------- HUD + minimap ----------
  const mm = $('minimap').getContext('2d');
  function drawMinimap() {
    const S = 170, W = CFG.world;
    const to = (x, z) => [(x + W / 2) / W * S, (z + W / 2) / W * S];
    mm.fillStyle = '#101018'; mm.fillRect(0, 0, S, S);
    mm.fillStyle = '#1a4a6a'; mm.fillRect(0, 0, S, (CFG.seaAt + W / 2) / W * S + 4);
    mm.strokeStyle = '#3a3a48'; mm.lineWidth = 3;
    for (let i = -4; i <= 4; i++) {
      const [x1, y1] = to(i * CFG.block, -W / 2), [x2, y2] = to(i * CFG.block, W / 2);
      mm.beginPath(); mm.moveTo(x1, y1); mm.lineTo(x2, y2); mm.stroke();
      const [x3, y3] = to(-W / 2, i * CFG.block), [x4, y4] = to(W / 2, i * CFG.block);
      mm.beginPath(); mm.moveTo(x3, y3); mm.lineTo(x4, y4); mm.stroke();
    }
    const t = missionTarget();
    if (t) {
      const [x, y] = to(t.x, t.z);
      mm.fillStyle = '#ffd24a';
      mm.beginPath(); mm.arc(x, y, 5, 0, 7); mm.fill();
    }
    mm.fillStyle = '#888';
    for (const c of traffic) { const [x, y] = to(c.group.position.x, c.group.position.z); mm.fillRect(x - 1, y - 1, 2, 2); }
    mm.fillStyle = '#ff4444';
    for (const p of police) { const [x, y] = to(p.car.group.position.x, p.car.group.position.z); mm.beginPath(); mm.arc(x, y, 3, 0, 7); mm.fill(); }
    const [px, py] = to(player.group.position.x, player.group.position.z);
    mm.fillStyle = '#fff';
    mm.save(); mm.translate(px, py); mm.rotate(Math.PI - player.heading);
    mm.beginPath(); mm.moveTo(0, -6); mm.lineTo(4, 5); mm.lineTo(-4, 5); mm.closePath(); mm.fill();
    mm.restore();
  }
  function updateHUD() {
    let stars = '';
    for (let i = 0; i < CFG.maxWanted; i++) stars += i < state.wanted ? '★' : '<span class="off">☆</span>';
    $('stars').innerHTML = stars;
    $('cash').textContent = '$' + state.cash.toLocaleString('en-US');
    // Live clock: 18:40 dusk, ticking forward as the night deepens.
    const mins = Math.floor(state.clockMin) % 1440;
    const hh = String(Math.floor(mins / 60)).padStart(2, '0');
    const min2 = String(mins % 60).padStart(2, '0');
    $('clock').textContent = hh + ':' + min2;
    window.__gameClock = hh + ':' + min2;
    $('health-fill').style.width = state.health + '%';
    $('health-fill').style.background = state.health > 50 ? 'linear-gradient(90deg,#37d67a,#7dff8a)' : state.health > 25 ? 'linear-gradient(90deg,#d6a437,#ffd24a)' : 'linear-gradient(90deg,#d63737,#ff5a5a)';
    const w = WEAPONS[state.weapon];
    $('ammo').textContent = w.name + ' ' + state.ammo[state.weapon] + '  ·  1 PISTOL 2 SMG 3 SHOTGUN' + (onFoot.active ? '  ·  ON FOOT — press E for the car' : '');
    $('speed').innerHTML = Math.round(Math.abs(player.speed) * 3.6) + ' <small>km/h</small>';
    const t = missionTarget();
    if (t) {
      const dx = t.x - player.group.position.x, dz = t.z - player.group.position.z;
      let ang = Math.atan2(dx, dz) - player.heading;
      while (ang > Math.PI) ang -= Math.PI * 2;
      while (ang < -Math.PI) ang += Math.PI * 2;
      // Arrow glyph points right at 0 deg; up = -90 deg, positive ang = target to the left.
      $('arrow').style.transform = `rotate(${(-90 - ang * 180 / Math.PI).toFixed(0)}deg)`;
      let obj = t.label + ' · ' + Math.round(Math.hypot(dx, dz)) + 'm';
      const m = MISSIONS[state.mission];
      if (m && m.kind === 'timed') obj += ' · ' + Math.max(0, Math.ceil(state.missionDeadline - state.elapsed)) + 's LEFT';
      $('objective-text').textContent = obj;
    }
  }

  // Dusk deepens with the clock: 18:40 golden hour fades toward a darker night.
  const duskSky = new THREE.Color(CFG.skyDusk);
  const nightSky = new THREE.Color(0x160f24);
  const sunWarm = new THREE.Color(CFG.sunColor);
  const sunLate = new THREE.Color(0xff7a4d);
  function updateLighting() {
    const t = Math.max(0, Math.min(1, (state.clockMin - CFG.clockStartMin) / 90));
    city.sun.intensity = 1.6 - t * 0.7;
    city.sun.color.lerpColors(sunWarm, sunLate, t);
    city.hemi.intensity = 0.85 - t * 0.35;
    scene.background.lerpColors(duskSky, nightSky, t);
  }

  // ---------- audio (all synthesized, no files) ----------
  let actx = null, engineOsc = null, engineGain = null, sirenOsc = null;
  function ensureAudio() {
    if (actx || state.mute) return;
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      engineOsc = actx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 55;
      const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
      engineGain = actx.createGain(); engineGain.gain.value = 0;
      engineOsc.connect(lp); lp.connect(engineGain); engineGain.connect(actx.destination);
      engineOsc.start();
      sirenOsc = actx.createOscillator(); sirenOsc.type = 'square'; sirenOsc.frequency.value = 700;
      const sg = actx.createGain(); sg.gain.value = 0;
      sirenOsc.connect(sg); sg.connect(actx.destination); sirenOsc.start();
      sirenOsc._gain = sg;
    } catch (e) { actx = null; }
  }
  function noiseBurst(dur, freq, vol) {
    if (!actx) return;
    const buf = actx.createBuffer(1, actx.sampleRate * dur, actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = actx.createBufferSource(); src.buffer = buf;
    const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = actx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(actx.destination);
    src.start();
  }
  function sfxShot() { noiseBurst(0.12, 2400, 0.5); }
  function sfxExplosion() { noiseBurst(0.9, 320, 0.9); }
  function sfxThud() { noiseBurst(0.15, 300, 0.5); }
  function sfxPickup() { if (!actx) return; const o = actx.createOscillator(), g = actx.createGain(); o.type = 'sine'; o.frequency.value = 880; g.gain.value = 0.25; o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + 0.15); }
  function sfxBusted() { if (!actx) return; const o = actx.createOscillator(), g = actx.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(220, actx.currentTime); o.frequency.linearRampToValueAtTime(110, actx.currentTime + 0.6); g.gain.value = 0.3; o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + 0.65); }
  function sfxJingle() {
    if (!actx) return;
    [523, 659, 784].forEach((fr, i) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.value = fr; g.gain.value = 0.25;
      o.connect(g); g.connect(actx.destination);
      o.start(actx.currentTime + i * 0.12); o.stop(actx.currentTime + i * 0.12 + 0.22);
    });
  }
  function updateAudio() {
    if (!actx) return;
    const on = state.started && !state.paused && !state.mute;
    if (engineOsc) {
      engineGain.gain.value = on ? 0.045 + Math.min(0.05, Math.abs(player.speed) * 0.0016) : 0;
      engineOsc.frequency.value = 50 + Math.abs(player.speed) * 3.2;
    }
    if (sirenOsc) {
      sirenOsc._gain.gain.value = on && state.wanted > 0 ? 0.035 : 0;
      if (state.elapsed - state.sirenAt > 0.45) {
        state.sirenAt = state.elapsed;
        state.sirenHigh = !state.sirenHigh;
        sirenOsc.frequency.value = state.sirenHigh ? 880 : 660;
      }
    }
  }

  // ---------- staged shots (?shot=...) ----------
  function setupShot() {
    if (!shotMode) return;
    if (shotMode === 'start') {
      player.group.position.set(-6, 0, 150);
      player.heading = Math.PI * 0.92;
      player.group.rotation.y = player.heading;
      return;
    }
    state.started = true;
    $('menu').classList.add('hidden');
    $('hud').classList.add('on');
    state.cash = 1250; // staged shots show a lived-in wallet, not $0
    setupMission();
    keys.KeyW = true; // auto-drive so the scene reads as motion
    if (shotMode === 'drive') {
      player.group.position.set(0, 0, 200);
      player.heading = Math.PI;
      player.speed = 20;
    } else if (shotMode === 'chase') {
      state.wanted = 6; // cover shot: full six-star heat
      state.weapon = 1; state.owned[1] = true; state.ammo[1] = 120; // SMG in hand for the cover
      player.group.position.set(0, 0, 120);
      player.heading = Math.PI;
      player.speed = 14;
      for (let i = 0; i < 3; i++) spawnPolice();
      // Two flankers ahead (visible in frame) + one on the tail.
      const flank = [[-8, 94, 14], [8, 100, 14], [0, 136, 12]];
      police.forEach((p, i) => {
        p.car.group.position.set(flank[i][0], 0, flank[i][1]);
        p.car.heading = Math.PI; p.car.speed = flank[i][2];
      });
      heli = Vehicles.makeHeli();
      heli.angle = -Math.PI / 2;
      heli.radius = 36; heli.height = 17;
      scene.add(heli.group);
      heli2 = Vehicles.makeHeli();
      heli2.angle = Math.PI / 2;
      heli2.radius = 20; heli2.height = 28;
      scene.add(heli2.group);
      roadblock = Vehicles.makeRoadblock(true); // dense five-star block for the cover
      roadblock.position.set(0, 0, 120 - 42);
      roadblock.rotation.y = Math.PI;
      scene.add(roadblock);
      roadblockAt = state.elapsed;
      explode(-10, 100, true);
      state.lastCrime = state.elapsed;
    } else if (shotMode === 'mission') {
      player.group.position.set(0, 0, 192);
      player.heading = Math.PI;
      player.speed = 16;
    }
    player.group.rotation.y = player.heading;
  }

  // ---------- main loop ----------
  const clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock.getDelta());
    state.elapsed += dt;
    state.frames++;
    if (state.started && !state.paused && !state.over) {
      // The clock ticks: 18:40 dusk slides toward night as you play.
      state.clockMin += dt * CFG.clockRate;
      updateLighting();
      updatePlayer(dt);
      updateTraffic(dt);
      updatePeds(dt);
      updatePolice(dt);
      // Hold-to-fire for automatic weapons.
      if (state.firing && WEAPONS[state.weapon].auto) shoot();
      // Timed job: the clock runs out, the buyer walks away.
      const cm = MISSIONS[state.mission];
      if (cm && cm.kind === 'timed' && state.elapsed > state.missionDeadline) {
        toast('TOO SLOW — the buyer walked away. Try again!');
        setupMission();
      }
      // Ghost job: the heat dies, the job is done.
      if (cm && cm.kind === 'cooldown' && state.wanted === 0) completeMission();
      // Beacon pulse.
      const pulse = 1 + Math.sin(state.elapsed * 4) * 0.12;
      ring.scale.set(pulse, pulse, 1);
      beam.material.opacity = 0.18 + Math.sin(state.elapsed * 4) * 0.06;
      // Explosions / smoke / tracers.
      for (let i = explosions.length - 1; i >= 0; i--) {
        const e = explosions[i];
        e.t += dt;
        e.ball.scale.setScalar(1 + e.t * (shotMode === 'chase' ? 5 : 9));
        const fade = shotMode === 'chase' ? 0.45 : 1.1;
        e.ball.material.opacity = Math.max(0, 0.95 - e.t * fade);
        e.light.intensity = Math.max(0, 3 - e.t * (shotMode === 'chase' ? 1.2 : 4));
        for (const p of e.puffs) { p.position.y += p.userData.vy * dt; p.material.opacity = Math.max(0, 0.85 - e.t * (shotMode === 'chase' ? 0.22 : 0.7)); }
        if (e.t > (shotMode === 'chase' ? 4.0 : 1.3)) { scene.remove(e.group); explosions.splice(i, 1); }
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.scale.setScalar(1 + p.life * p.grow);
        p.mesh.material.opacity = Math.max(0, 0.8 - p.life / p.max);
        if (p.life > p.max) { scene.remove(p.mesh); particles.splice(i, 1); }
      }
      for (let i = tracers.length - 1; i >= 0; i--) {
        const t = tracers[i];
        t.life += dt;
        t.mesh.material.opacity = Math.max(0, 0.9 - t.life * 9);
        if (t.life > 0.12) { scene.remove(t.mesh); tracers.splice(i, 1); }
      }
      updateHUD();
      drawMinimap();
      updateAudio();
    }
    updateCamera(dt);
    renderer.render(scene, camera);
    // Chase shot: keep a fresh explosion in frame for the cover.
    if (shotMode === 'chase' && state.frames % 50 === 0 && state.frames > 0) {
      const f = fwd(player.heading);
      const p = player.group.position;
      explode(p.x + f.x * 26 - 10, p.z + f.z * 26, true);
    }
    if (shotMode && state.frames === 25) window.__shotReady = true;
  }

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  setupShot();
  frame();
})();
