// Solara Bay 3D — vehicles: car factory, traffic, pedestrians, police, heli.
// Everything is boxes/cylinders/spheres — no external models or textures.
(function () {
  const rng = mulberry32(4242);

  // Twelve paint jobs so rush-hour traffic reads as a crowd, not a convoy.
  const CAR_COLORS = [0xd8d8d8, 0x2a2a33, 0x7a1f1f, 0x1f4a7a, 0xc2a03a, 0x3a6a4a, 0x8a5a2a, 0x3a3a6a, 0xd84a2a, 0x4a8a3a, 0xe8e8e8, 0x6a2a5a];

  // A low-poly car: body + cabin + 4 wheels + headlights + taillights.
  // opts: { van, police, player, hp }.
  // Returns { group, body, wheels, hp, maxHp, speed, heading, ... }.
  function makeCar(color, opts = {}) {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color });
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x101418 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.62, 4.4), bodyMat);
    body.position.y = 0.62; g.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 2.2), glassMat);
    cabin.position.set(0, 1.15, -0.25); g.add(cabin);
    const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x0c0c0e });
    const wheels = [];
    for (const [x, z] of [[-1.0, 1.45], [1.0, 1.45], [-1.0, -1.45], [1.0, -1.45]]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2; w.position.set(x, 0.38, z);
      g.add(w); wheels.push(w);
    }
    const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
    for (const x of [-0.7, 0.7]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), headMat);
      h.position.set(x, 0.72, 2.22); g.add(h);
    }
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    for (const x of [-0.7, 0.7]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), tailMat);
      t.position.set(x, 0.72, -2.22); g.add(t);
    }
    if (opts.van) {
      // Delivery van: a tall cargo box on the back so it reads as a different vehicle.
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.1, 2.4),
        new THREE.MeshLambertMaterial({ color: 0xe8e0d0 }));
      box.position.set(0, 1.45, -0.7); g.add(box);
    }
    if (opts.police) {
      // Black-and-white PD livery + light bar.
      const door = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.4, 1.6),
        new THREE.MeshLambertMaterial({ color: 0xf0f0f0 }));
      door.position.set(0, 0.62, 0.1); g.add(door);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.4),
        new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      bar.position.set(0, 1.55, -0.25); g.add(bar);
      g.userData.lightBar = bar;
    }
    g.userData.bodyMat = bodyMat;
    return {
      group: g, body, wheels,
      hp: opts.hp ?? 100, maxHp: opts.hp ?? 100,
      speed: 0, heading: 0, smoking: false, dead: false,
      isPolice: !!opts.police, isPlayer: !!opts.player,
    };
  }

  // Traffic: cars cruising the road grid, turning at intersections.
  // One in five is a delivery van, so the street has two body shapes.
  function makeTraffic(city, count) {
    const cars = [];
    for (let i = 0; i < count; i++) {
      const p = city.randomRoadPoint();
      const van = rng() < 0.2;
      const c = makeCar(CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)], { van });
      c.heading = (Math.floor(rng() * 4) * Math.PI) / 2;
      c.group.position.set(p.x, 0, p.z);
      c.group.rotation.y = c.heading;
      c.speed = 6 + rng() * 6;
      c.axis = rng() < 0.5 ? 'x' : 'z';
      c.dir = rng() < 0.5 ? 1 : -1;
      cars.push(c);
    }
    return cars;
  }

  // Pedestrians: simple two-box walkers strolling the sidewalks.
  function makePeds(count) {
    const peds = [];
    const shirt = [0xd84a4a, 0x4a7ad8, 0x4ad87a, 0xd8c24a, 0x9a4ad8];
    for (let i = 0; i < count; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 0.4),
        new THREE.MeshLambertMaterial({ color: shirt[i % shirt.length] }));
      body.position.y = 0.9; g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6),
        new THREE.MeshLambertMaterial({ color: 0xd8a878 }));
      head.position.y = 1.65; g.add(head);
      const legs = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.35),
        new THREE.MeshLambertMaterial({ color: 0x22222a }));
      legs.position.y = 0.35; g.add(legs);
      const p = {
        group: g, x: (rng() - 0.5) * 500, z: (rng() - 0.5) * 500,
        heading: rng() * Math.PI * 2, speed: 1 + rng() * 1.2, walkPhase: rng() * 6,
      };
      g.position.set(p.x, 0, p.z);
      peds.push(p);
    }
    return peds;
  }

  // Police helicopter: body + tail + spinning rotor, circles the player.
  function makeHeli() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 5.2),
      new THREE.MeshLambertMaterial({ color: 0x1a1a22 }));
    body.position.y = 0; g.add(body);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.9, 1.6),
      new THREE.MeshLambertMaterial({ color: 0x182838 }));
    glass.position.set(0, 0.3, 2.0); g.add(glass);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 4.5),
      new THREE.MeshLambertMaterial({ color: 0x1a1a22 }));
    tail.position.set(0, 0.4, -4.4); g.add(tail);
    const rotor = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(11, 0.08, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x33333a }));
    rotor.add(blade);
    const bladeCross = blade.clone(); bladeCross.rotation.y = Math.PI / 2; rotor.add(bladeCross);
    rotor.position.y = 1.1; g.add(rotor);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.46, 0.4, 2.0),
      new THREE.MeshBasicMaterial({ color: 0xffd24a }));
    stripe.position.set(0, 0.1, 0.5); g.add(stripe);
    const spot = new THREE.SpotLight(0xfff2b0, 1.2, 120, 0.35, 0.5);
    spot.position.set(0, -0.8, 0); g.add(spot);
    g.add(spot.target); spot.target.position.set(0, -30, 0);
    return { group: g, rotor, angle: 0 };
  }

  // Roadblock: two PD cars angled across the road + barrier boxes.
  // dense = five-star heat: a third PD car and a second row of barriers.
  function makeRoadblock(dense) {
    const g = new THREE.Group();
    const c1 = makeCar(0x111118, { police: true });
    c1.group.position.set(-4.5, 0, 0); c1.group.rotation.y = 0.5; g.add(c1.group);
    const c2 = makeCar(0x111118, { police: true });
    c2.group.position.set(4.5, 0, 0); c2.group.rotation.y = -0.5; g.add(c2.group);
    if (dense) {
      const c3 = makeCar(0x111118, { police: true });
      c3.group.position.set(0, 0, -6); c3.group.rotation.y = 0.15; g.add(c3.group);
    }
    const barrierMat = new THREE.MeshLambertMaterial({ color: 0xff7a1a });
    const spots = dense ? [-3.3, -1.1, 1.1, 3.3, -2.2, 2.2] : [-2.2, 0, 2.2];
    const rows = dense ? [0, -3] : [0];
    for (const rz of rows) for (const x of spots.slice(0, dense ? 4 : 3)) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 0.4), barrierMat);
      b.position.set(x, 0.45, rz); g.add(b);
    }
    return g;
  }

  // Explosion: expanding fireball + smoke puffs + a point light flash.
  function makeExplosion(scene, x, z) {
    const group = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffa02a, transparent: true, opacity: 0.95 }));
    ball.position.y = 1.2; group.add(ball);
    const light = new THREE.PointLight(0xff7a1a, 3, 40);
    light.position.y = 3; group.add(light);
    const puffs = [];
    for (let i = 0; i < 10; i++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.8 + rng() * 1.2, 8, 6),
        new THREE.MeshLambertMaterial({ color: 0x2a2a2a, transparent: true, opacity: 0.85 }));
      const a = rng() * Math.PI * 2, r = 1 + rng() * 4;
      p.position.set(Math.cos(a) * r, 0.8 + rng() * 2.5, Math.sin(a) * r);
      p.userData.vy = 1 + rng() * 2;
      group.add(p); puffs.push(p);
    }
    group.position.set(x, 0, z);
    scene.add(group);
    return { group, ball, light, puffs, t: 0 };
  }

  window.Vehicles = { makeCar, makeTraffic, makePeds, makeHeli, makeRoadblock, makeExplosion };
})();
