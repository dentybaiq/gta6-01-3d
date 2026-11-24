// Solara Bay 3D — tuning, palette, weapons and story jobs.
// Plain globals, loaded before city.js and vehicles.js; main.js reads them all.
const CFG = {
  world: 640,          // city is world x world units, centred on 0,0
  block: 64,           // block size; roads run on the grid lines between blocks
  roadHalf: 7,         // half width of a road
  seaAt: -320,         // ocean starts here on the -Z side (beach strip)
  sunColor: 0xffb36b,  // low golden-hour sun
  skyDusk: 0x2a1e3f,   // dusk sky top
  fogColor: 0x8a5a4a,  // warm haze
  playerColor: 0xff5a2a,
  maxWanted: 6,       // six-star heat: the PD brings everything at 5-6
  clockStartMin: 18 * 60 + 40, // the in-game clock starts at 18:40, dusk
  clockRate: 0.2,     // game minutes per real second (1 game minute / 5 s)
  saveKey: 'solara3d-save-v1',
};

// Three weapons. damage = per hit, rate = seconds between shots, auto = hold to fire.
// Switch with 1/2/3 or Q. SMG and shotgun start locked; find their pickups on the street.
const WEAPONS = [
  { id: 'pistol', name: 'PISTOL', damage: 34, rate: 0.28, auto: false, startAmmo: 60 },
  { id: 'smg', name: 'SMG', damage: 16, rate: 0.09, auto: true, startAmmo: 120 },
  { id: 'shotgun', name: 'SHOTGUN', damage: 90, rate: 0.9, auto: false, startAmmo: 24 },
];

// Eight story jobs. Each has an objective, a target point and a payout.
// kind drives the mission logic in main.js: drive, pickup, escape, ram, steal, timed, cooldown, heist.
const MISSIONS = [
  {
    id: 'harbor-lights', title: '1 · Harbor Lights',
    brief: 'Lena Voss needs a driver. Pick up the package at the docks and bring it to the Marina safehouse.',
    objective: 'Drive to the glowing beacon at the docks',
    target: [-256, -256], pay: 400, kind: 'drive',
  },
  {
    id: 'hot-package', title: '2 · Hot Package',
    brief: 'The package is marked. Grab it, then deliver it across town — the PD will be watching.',
    objective: 'Grab the package, then deliver it to Coral Heights',
    target: [224, 192], pay: 650, kind: 'pickup',
  },
  {
    id: 'sunset-run', title: '3 · The Last Sunset',
    brief: 'Three stars and counting. Lose the cops and make the beach rendezvous before the sun drops.',
    objective: 'Reach the beach rendezvous with the cops on your tail',
    target: [-160, -288], pay: 900, kind: 'escape',
  },
  {
    id: 'big-score', title: '4 · The Big Score',
    brief: 'One last job: the vault truck is crossing Old Town. Ram it, grab the cash, and vanish.',
    objective: 'Ram the vault truck, then escape to the safehouse',
    target: [96, -96], pay: 1500, kind: 'ram',
  },
  {
    id: 'hot-wheels', title: '5 · Hot Wheels',
    brief: 'A gold Comet is parked in Old Town, keys in it. Steal it and deliver it to the chop shop — quietly.',
    objective: 'Steal the gold Comet, then deliver it to the chop shop',
    target: [256, 224], pay: 800, kind: 'steal',
  },
  {
    id: 'deadline-dash', title: '6 · Deadline Dash',
    brief: 'A buyer waits at the Marina with 75 seconds on the clock. Floor it — the deal dies when the clock does.',
    objective: 'Deliver the package to the Marina before the clock runs out',
    target: [-256, -256], pay: 1000, kind: 'timed', limit: 75,
  },
  {
    id: 'ghost', title: '7 · Ghost',
    brief: 'Four stars, no backup. Go dark, stay out of sight, and wait until the heat dies on its own.',
    objective: 'Lose the cops — stay out of sight until the heat dies',
    target: [-256, 256], pay: 1100, kind: 'cooldown',
  },
  {
    id: 'last-sunset-heist', title: '8 · The Last Sunset Heist',
    brief: 'The final job: an armored vault truck, five stars, one helicopter that never blinks. Crack it and vanish.',
    objective: 'Ram the armored vault truck, then escape to the safehouse',
    target: [96, -96], pay: 2500, kind: 'heist',
  },
];

// Tiny seeded RNG so the city (and staged shots) are identical every load.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
