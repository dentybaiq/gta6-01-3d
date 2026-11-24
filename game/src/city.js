// Solara Bay 3D — the city: roads, buildings, lamps, beach and dusk sky.
// The city is deterministic: one seeded RNG, so every load builds the same streets.
// Exposes buildCity(scene) -> { colliders, roadPoints, randomRoadPoint, beaconSpots }.
(function () {
  const rng = mulberry32(1337);

  // One shared facade texture: dark wall, lit golden windows.
  function facadeTexture() {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#241d2b'; g.fillRect(0, 0, 128, 256);
    for (let y = 10; y < 246; y += 22) {
      for (let x = 8; x < 120; x += 18) {
        const lit = rng() < 0.62;
        g.fillStyle = lit ? (rng() < 0.75 ? '#ffd27a' : '#ff9a4d') : '#151019';
        g.fillRect(x, y, 11, 14);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function buildCity(scene) {
    const W = CFG.world, half = W / 2;
    const colliders = [];   // {minX,maxX,minZ,maxZ} building footprints
    const roadPoints = [];  // intersections, for spawning traffic/pickups

    // Dusk sky + haze.
    scene.background = new THREE.Color(CFG.skyDusk);
    scene.fog = new THREE.Fog(CFG.fogColor, 180, 900);

    // Sun: low, warm, from the west so long golden light rakes the streets.
    const hemi = new THREE.HemisphereLight(0xffc490, 0x2c2138, 0.85);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(CFG.sunColor, 1.6);
    sun.position.set(-300, 90, 120);
    scene.add(sun);

    // Ground: asphalt-dark city slab.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(W + 80, W + 80),
      new THREE.MeshLambertMaterial({ color: 0x23202a })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, 0);
    scene.add(ground);

    // Roads: darker strips along every grid line + centre dashes.
    const roadMat = new THREE.MeshLambertMaterial({ color: 0x17141d });
    const dashMat = new THREE.MeshBasicMaterial({ color: 0x8a7a55 });
    const lines = [];
    for (let i = -4; i <= 4; i++) lines.push(i * CFG.block);
    for (const x of lines) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(CFG.roadHalf * 2, W), roadMat);
      road.rotation.x = -Math.PI / 2; road.position.set(x, 0.02, 0); scene.add(road);
      const crossRoad = new THREE.Mesh(new THREE.PlaneGeometry(W, CFG.roadHalf * 2), roadMat);
      crossRoad.rotation.x = -Math.PI / 2; crossRoad.position.set(0, 0.02, x); scene.add(crossRoad);
      // Centre dashes down the road, one every 32 units.
      for (let z = -half + 16; z < half; z += 32) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 6), dashMat);
        dash.rotation.x = -Math.PI / 2; dash.position.set(x, 0.04, z); scene.add(dash);
      }
    }
    for (const a of lines) for (const b of lines) roadPoints.push([a, b]);

    // Buildings: one facade texture, varied heights and tints, inside blocks.
    const facade = facadeTexture();
    const tints = [0x8a7f96, 0x6f6a80, 0x9a8a7a, 0x7a7a8a, 0x8a6a72, 0x5f6a7a];
    const geo = new THREE.BoxGeometry(1, 1, 1);
    for (let bx = -4; bx < 4; bx++) {
      for (let bz = -4; bz < 4; bz++) {
        // Skip the beach strip and the central park.
        if (bz === -4) continue;
        if (bx === 0 && bz === 0) continue;
        const cx = bx * CFG.block + CFG.block / 2;
        const cz = bz * CFG.block + CFG.block / 2;
        const n = 1 + Math.floor(rng() * 2); // one or two towers per block
        for (let k = 0; k < n; k++) {
          const w = 16 + rng() * 18, d = 16 + rng() * 18;
          const h = 14 + rng() * rng() * 70;
          const x = cx + (rng() - 0.5) * (CFG.block - w - 8);
          const z = cz + (rng() - 0.5) * (CFG.block - d - 8);
          const mat = new THREE.MeshLambertMaterial({
            map: facade, color: tints[Math.floor(rng() * tints.length)],
            emissive: 0xffffff, emissiveMap: facade, emissiveIntensity: 0.55,
          });
          const b = new THREE.Mesh(geo, mat);
          b.scale.set(w, h, d);
          b.position.set(x, h / 2, z);
          scene.add(b);
          colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
          // Roof beacon light on tall towers.
          if (h > 55) {
            const lamp = new THREE.Mesh(
              new THREE.SphereGeometry(0.9, 8, 6),
              new THREE.MeshBasicMaterial({ color: 0xff4444 })
            );
            lamp.position.set(x, h + 1, z); scene.add(lamp);
          }
        }
      }
    }

    // Central park: grass square + palm trees.
    const park = new THREE.Mesh(
      new THREE.PlaneGeometry(CFG.block - 14, CFG.block - 14),
      new THREE.MeshLambertMaterial({ color: 0x2a4a2a })
    );
    park.rotation.x = -Math.PI / 2; park.position.set(CFG.block / 2, 0.03, CFG.block / 2);
    scene.add(park);

    // Palm trees along the beach and the park.
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f6a2f });
    function palm(x, z) {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 9, 6), trunkMat);
      trunk.position.set(x, 4.5, z); scene.add(trunk);
      const crown = new THREE.Mesh(new THREE.ConeGeometry(4.5, 3.5, 7), leafMat);
      crown.position.set(x, 10, z); scene.add(crown);
    }
    for (let x = -half + 20; x < half; x += 42) palm(x, CFG.seaAt + 14);
    for (let i = 0; i < 8; i++) palm(8 + rng() * 40, 8 + rng() * 40);

    // Ocean: flat teal plane past the beach, with a sandy strip.
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(W + 80, 26),
      new THREE.MeshLambertMaterial({ color: 0xc2a878 })
    );
    sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.05, CFG.seaAt + 13);
    scene.add(sand);
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(W + 400, 300),
      new THREE.MeshLambertMaterial({ color: 0x1a4a6a, emissive: 0x0a2438, emissiveIntensity: 0.6 })
    );
    sea.rotation.x = -Math.PI / 2; sea.position.set(0, 0.02, CFG.seaAt - 140);
    scene.add(sea);

    // Street lamps: pole + warm glowing head, down both sides of every road.
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3a44 });
    const headMat = new THREE.MeshBasicMaterial({ color: 0xffc46a });
    const poleGeo = new THREE.CylinderGeometry(0.18, 0.18, 7, 5);
    const headGeo = new THREE.SphereGeometry(0.7, 8, 6);
    for (const a of lines) {
      for (let b = -half + 32; b < half; b += 64) {
        for (const [x, z] of [[a + CFG.roadHalf + 2, b], [a - CFG.roadHalf - 2, b + 32]]) {
          const pole = new THREE.Mesh(poleGeo, poleMat);
          pole.position.set(x, 3.5, z); scene.add(pole);
          const head = new THREE.Mesh(headGeo, headMat);
          head.position.set(x, 7.2, z); scene.add(head);
        }
      }
    }

    // A few warm point lights in the busiest blocks so the dusk glows.
    for (const [x, z] of [[-96, -96], [96, 96], [32, -160], [-160, 160], [224, -32]]) {
      const pl = new THREE.PointLight(0xff9a4d, 0.9, 90);
      pl.position.set(x, 12, z); scene.add(pl);
    }

    // Neon signs on a few towers, so the dusk skyline has colour pops.
    const neonColors = [0xff2a6a, 0x2ad8ff, 0xffd24a, 0x7dff8a];
    for (let i = 0; i < 10; i++) {
      const b = colliders[Math.floor(rng() * colliders.length)];
      if (!b) continue;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(6 + rng() * 6, 1.6),
        new THREE.MeshBasicMaterial({ color: neonColors[i % neonColors.length] }));
      sign.position.set((b.minX + b.maxX) / 2, 6 + rng() * 6, b.maxZ + 0.15);
      scene.add(sign);
    }

    return {
      colliders,
      roadPoints,
      sun, hemi, // handed out so the in-game clock can dim the light as night falls
      randomRoadPoint() {
        const p = roadPoints[Math.floor(rng() * roadPoints.length)];
        return { x: p[0] + (rng() - 0.5) * 8, z: p[1] + (rng() - 0.5) * 8 };
      },
    };
  }

  window.buildCity = buildCity;
})();
