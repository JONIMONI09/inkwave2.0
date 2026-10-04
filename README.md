<p align="center">
  <img src="assets/stages/halyard-day.webp" alt="Halyard Marina at golden hour" width="100%">
</p>

<h1 align="center">INKWAVE</h1>

<p align="center">
  An original Splatoon-style 4v4 turf-war shooter that runs in your browser.<br>
  Paint the ground, swim through your ink, out-turf the other team.
</p>

<p align="center">
  <a href="https://inkwave-aah.pages.dev"><b>▶ Play now</b></a> ·
  <a href="#controls">Controls</a> ·
  <a href="#playing-online">Online</a> ·
  <a href="#running-locally">Run locally</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

<p align="center">
  <a href="https://github.com/jaydendavisnc/inkwave/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/jaydendavisnc/inkwave/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="three.js r186" src="https://img.shields.io/badge/three.js-r186-000000?logo=three.js&logoColor=white">
  <img alt="No build step" src="https://img.shields.io/badge/build-none%20needed-2ea44f">
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-blue"></a>
</p>

---

## Features

- **Game modes, 4 v 4.** Turf War (most ground painted wins) and Zone Control (hold the live zone to count down from 100 — rotating side zones, penalties, overtime). Play against bots on three difficulty levels.
- **Online with friends.** Create a private room, share the five-character code, and up to eight players line up in the lobby with their loadouts and looks. Empty slots fill with bots; if someone drops, a bot takes over their squidkid mid-match.
- **Squid form.** Hold to dive into your ink: swim fast, refill your tank, climb inked walls, dolphin-jump water gaps.
- **Twelve weapons**, each with its own feel: Spritzer, Twinfire Pistols, Canopy Brolly (shotgun + launchable shield), Popper Blaster, Squall Spinner, Glint Charger, Tideline Bow (tri-arrow, two charge rings), Swell Roller, Swish Brush, Brine Cutlass (charged one-hit blade), Sponge Mitts (ink fists, charged leap, wall cling) and Bilge Bucket. Mix any main with any of 15 subs and 19 specials.
- **Seven stages, day or dusk.** Tidewater Plaza, Kelpline Terminal, Halyard Marina, Saltpan Basin, Crossroads Market, Lockgate Canals and Terrace Heights, each a real place with its own layout. Some stages change a few pieces for Zone Control.
- **Ink that behaves like liquid.** Splats spread and settle, fresh ink is glossy and dries, drips run down walls, and swimming leaves a wake in the surface itself.
- **A map you can actually read.** Hold <kbd>Tab</kbd> and the camera cranes up into a tilt-shift diorama of the live stage, with pins for your team and one-click Super Jumps.
- **Locker.** Choose your squidkid: tentacle style, headgear, face, outfit.
- **Everything procedural.** Characters, animation, weapons, textures, props, sound effects and music are all generated in code. There are no downloaded assets except two fonts.

<p align="center">
  <img src="assets/stages/tidewater-day.webp" width="49%" alt="Tidewater Plaza">
  <img src="assets/stages/kelpline-dusk.webp" width="49%" alt="Kelpline Terminal at dusk">
</p>

## Controls

| Action | Keyboard / mouse | Gamepad | Touch |
|---|---|---|---|
| Move | <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> | Left stick | Left stick (left thumb) |
| Aim | Mouse | Right stick | Drag anywhere on the right half |
| Fire | Left click | RT | Hold **FIRE** |
| Squid form | <kbd>Shift</kbd> | LT | Hold **SQUID** |
| Jump / dodge roll | <kbd>Space</kbd> | A | **JUMP** |
| Sub weapon (bomb) | Right click / <kbd>E</kbd> | RB | **SUB** |
| Special | <kbd>F</kbd> | Y | **SP** |
| Map + Super Jump | Hold <kbd>Tab</kbd> or <kbd>M</kbd>, then <kbd>1</kbd>–<kbd>4</kbd> or click a pin | View | Hold **MAP**, tap a pin |
| Cheer | <kbd>C</kbd> | D-pad up | **C** |
| Pause | <kbd>Esc</kbd> | Start | **II** (top right) |

Gamepads work on the hosted (https) version. On a plain `http://` LAN address browsers block the Gamepad API.

**Phones and tablets.** On a touch device the match shows on-screen controls: a movement stick that
spawns wherever your left thumb lands, drag-to-look on the right half of the screen, and hold-to-fire
buttons. Everything feeds the same input pipeline as the keyboard/gamepad, so all weapons, specials
and Super Jumps work the same way. Open the URL with `?no-touch` to hide the layer on a
touch-screen laptop.

## Playing online

From the main menu choose **Online**, then **Create a room** and send your friends the code (or **Join a room** and
type theirs). The host picks the stage, time of day, match length and whether bots fill empty slots; everyone else
picks a team, weapon and look and readies up. The lineup, emotes and ready state are live for everyone in the room.

Rooms run on a tiny relay (a Cloudflare Worker with one Durable Object per room, in [`server/`](server)). It only
forwards messages: every player simulates their own squidkid and streams it, and everyone else draws it through the
same animation system on a smoothed timeline about a tenth of a second behind. How that works, and the tools used to
measure it, are in [`docs/NET.md`](docs/NET.md).

To play online on your own network, run the relay next to the game:

```bash
npm install      # once: the relay runs on wrangler
npm run relay    # ws://<this machine>:8787
```

A page opened from `localhost` or a LAN address uses that relay automatically; `?relay=wss://…` points it anywhere else.

## Running locally

There is no build step. Any static file server works; the included one also serves to your LAN and sends no-cache headers so module updates are never stale.

```bash
git clone https://github.com/jaydendavisnc/inkwave.git
cd inkwave
npm install      # Electron + the headless tools
npm start        # the desktop app (Electron)
npm run serve    # or the web version: http://localhost:8490
npm run package  # build the macOS app into dist/ (arm64 + x64)
```

Optional: drop your own music into `songs/` (see [`songs/README.md`](songs/README.md)); otherwise the procedural soundtrack plays.

Useful URL parameters: `?map=halyard&time=dusk` picks a stage, `&autostart=180` skips the menus into a 180 s match, `&autopilot` lets a bot drive you.

```bash
npm install      # once, for the headless tools
npm run check    # syntax-check every module
npm run smoke    # boot + 8 s of autopilot in headless Chrome, fails on console errors
npm run build    # assemble dist/ (game + only the three.js addons it imports)
npm run check-maps   # sanity-check every stage layout (and its Zone Control variant)
```

Bot matches run headless and muted for tuning: `MAP=halyard MODE=turf SECS=180 npm run botlab` (see [`tools/botlab/README.md`](tools/botlab/README.md)).
With the relay running, `npm run net-test` plays a real match between headless clients and reports what each
screen drew (see [`docs/NET.md`](docs/NET.md#how-the-netcode-works-srcnetnetmatchjs)).

## How it works

- **Ink is painted in texture space.** Every paintable face owns a region of one 4K atlas; splats are drawn into it on the GPU while a coarse CPU grid keeps the turf score and gameplay queries in sync. The level shader layers the ink over the surface with its own height, gloss and wetness. See [`src/world/paint.js`](src/world/paint.js) and [`src/world/inkShading.js`](src/world/inkShading.js).
- **Stages are data.** A layout is a list of boxes and ramps for one half of the arena; the other half is the 180° rotation, so both teams always get an identical field. Ambient occlusion is baked offline (`tools/bake-ao.mjs`). See [`src/world/maps.js`](src/world/maps.js).
- **Characters are fully procedural.** Geometry, materials, a 60-bone rig and every animation (locomotion, squid form, weapon poses, secondary motion) are code, driven by a spring-based pose system. See [`docs/RIG.md`](docs/RIG.md).
- **Systems talk through events.** Weapons, actors and the match emit typed events; effects, HUD and audio subscribe. The contract is documented in [`docs/EVENTS.md`](docs/EVENTS.md) and [`docs/CONTRACTS.md`](docs/CONTRACTS.md).
- **Deterministic tooling.** The game exposes a freeze/step debug interface so filmstrips, handling measurements and bot simulations are reproducible frame by frame (`tools/film.py`, `tools/measure-handling.mjs`).

Rendering is three.js r186 (vendored, plain ES modules with an import map) with GTAO, bloom and a custom grade pass.

## Browser support

Chrome and Edge are the target; Firefox works. Safari runs but is slower. A discrete or recent integrated GPU is recommended for the High preset; the settings menu has Medium, Low and Lite tiers.

**Performance on phones and weak GPUs.** On a touch device the first launch picks the **Lite**
preset automatically: render density well below CSS-pixel resolution (the single biggest lever on
mobile GPUs), shadows, bloom, AO and MSAA off, and a lighter particle load. On top of that, dynamic
resolution keeps monitoring frame times during a match and steps the density down as far as needed
(further on Lite than on the other tiers), so even a budget Android stays playable. Check the FPS
counter in Settings → Graphics if you want to tune it further.

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the project layout and the checks to run first.

## License

[MIT](LICENSE) © 2026 Jayden Davis. INKWAVE is an independent project and is not affiliated with Nintendo; Splatoon is a trademark of Nintendo.
