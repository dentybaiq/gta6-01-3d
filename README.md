# Solara Bay 3D — a real-time 3D open-world crime game

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/dentybaiq/gta6-01-3d/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/dentybaiq/gta6-01-3d/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Solara Bay 3D** is a complete open-world crime game rendered in real-time 3D
(three.js, vendored) that runs entirely in your browser from static files —
no build step, no network requests, no assets to download. You are **Kai Rook**,
a driver who owes fixer **Lena Voss** a debt, and the only way out is eight jobs
across a dusk-lit coastal city: a dock pickup, a hot delivery, a sunset escape
with the cops on your tail, a car theft, a 75-second deadline dash, a ghost run
to lose a four-star heat, and one last vault-truck heist.

## The city

A 640 × 640 unit grid city with five districts, a central park and a
palm-lined beach on the ocean — all of it real 3D geometry: towers with lit
windows, street lamps, a low golden-hour sun, warm haze, and the sea glittering
past the sand. Traffic flows along every road and pedestrians stroll the
sidewalks (and run when things get loud).

## How it plays

- **Driving** — WASD to drive in a real 3D chase camera, `SPACE` handbrake,
  `E` to step out on foot and walk the streets, `E` again to get back in.
- **Wanted level** — six stars. Shooting, hitting pedestrians, blowing up
  cars and ramming cops raise the heat; Solara Bay PD pursuit cars chase, ram
  and try to bust you, and at five stars they get faster, hit harder and send
  a second helicopter. At three stars the PD sets a **roadblock** on the road
  ahead and sends a **helicopter** to circle overhead with a searchlight —
  at five stars the block is denser and re-forms faster. Lose them and the
  stars fade; get caught standing still and you're busted (fine + the job
  restarts).
- **Combat** — three weapons with different damage and fire rates: the
  **pistol** (balanced), the **SMG** (fast, hold to fire), and the **shotgun**
  (slow, heavy, with pellet splash). Switch with `1` / `2` / `3` or `Q`;
  SMG and shotgun are unlocked from weapon pickups on the street. Click to
  fire (hitscan with a tracer), cars take damage, start smoking, and blow up
  in a fireball. The vault truck takes a proper ram to crack.
- **Missions** — eight story jobs with a glowing beacon, a pulsing ground ring,
  an off-screen direction arrow and a live distance readout. Jobs include a
  car theft (steal the gold Comet, deliver it to the chop shop), a timed
  delivery (75 seconds on the clock), a ghost run (lose a four-star heat to
  finish), and a final armored-truck heist. Complete jobs to earn cash and pay
  off the debt; finish all eight for the win screen.
- **Live clock** — the HUD shows the in-game time, starting at 18:40 dusk and
  ticking forward as you play; the golden-hour light fades toward night as
  the clock runs.
- **Dusk** — the whole city is shot in golden-hour light: a warm wash over the
  streets, glowing windows, lit lamps and rush-hour traffic.
- **Progression** — cash, ammo and health pickups on the street, a save in
  localStorage (money, job progress) that survives a reload.
- **HUD** — health, money, ammo, wanted stars, the live clock, mission objective with
  distance, speedometer, and a live minimap showing roads, the marker, cops,
  traffic and you.
- **Sound** — fully synthesized WebAudio: an engine hum that follows your
  speed, two-tone police sirens, gunshots, explosions and mission jingles.
  `M` mutes.

## Run it

```sh
node serve.ts
# then open http://localhost:8080
```

Or serve `game/` with any static file server and open `game/index.html`.
It plays with zero network requests — every script is a file under `game/`,
including the vendored three.js build.

## Staged screenshots

`?shot=start|drive|chase|mission` renders one of four deterministic scenes of
the live game, for screenshots.

## Structure

| File | Job |
| --- | --- |
| `game/src/config.js` | World size, tuning, palette, the eight jobs, the three weapons |
| `game/src/city.js` | City generation, roads, buildings, lamps, beach, dusk |
| `game/src/vehicles.js` | Car factory, traffic, pedestrians, police, helicopter, explosions |
| `game/src/main.js` | Game loop, player, driving, wanted, missions, combat, clock, HUD, audio, shots |
| `game/vendor/three.min.js` | Vendored three.js r149 (UMD build) |
| `serve.ts` | Tiny static server for local play |
| `main.ts` | Entry program: hands game/ + screenshots/ in with a dossier |

## License

MIT — see `LICENSE`. An original game: its city, characters, vehicles,
names, story, art and sounds are all its own.

<sub>Entered on [make.fun](https://make.fun/?ref=hvjtrkxx&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
