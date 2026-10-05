// Map layouts. A map is a list of oriented boxes. Everything in `half` is also mirrored by a 180° rotation about the
// Y axis ((x,z) -> (-x,-z)) so both teams get an identical arena. Team Alpha spawns at -Z, Bravo at +Z.
// The building kit (PATTERN ids, B/R/O/OCT/ARC helpers) lives in mapkit.js; every stage except Halyard Marina lives in
// its own folder under stages/<id>/ (layout, prop pack + placements, surfaces, murals).
import { PATTERN, C, B, R, O, OCT, ARC, OCTRAMP, R_ } from './mapkit.js';
import { STAGES } from './stages/index.js';
import { ZONE_DEFS } from './zones-data.js';
export * from './mapkit.js';

// ------------------------------------------------------------------------------------------------------------
// Halyard Marina — a working marina with a double-ended car ferry moored across the middle. Water everywhere
// between the decks: falling in splats you, and the gaps are the point of the map.
//   • spawn: the clubhouse roof terrace — a grand stair straight at the fuel dock, 2.4 m side drops to either flank
//   • right lane (per team) "Long Pier": open, long sightlines, the SEA SHANTY houseboat filling the slip (a broad
//     open sun deck; its cottage roof is squid-only high ground); a boardwalk near mid links it to the fuel dock
//   • centre "Fuel Dock": fuel hut + pumps for cover, a gangway onto the ferry's side corridor
//   • left lane "Boatyard": hardstanding with a tug up on blocks (ramp to its deck = flank high ground), a narrow
//     plank onto the ferry's end deck; linked to the fuel dock near base
//   • the ferry: open car decks at both ends, 1.7 m side corridors along the cabin, the sun deck on top (each team's
//     stair is at its own left end), a wheelhouse to fight around up there
//   • squid-only gaps (~3.5–5.5 m of water): fuel dock ↔ boatyard, side lanes ↔ ferry ends. Ink a runway, swim,
//     dolphin-jump across. Kids take the gangways.
const M = {
  pavers: '#dccbb0', stone: '#cfc6b6', deck: '#cdb89a', finger: '#c7ae8c', yard: '#bdb8af', clubhouse: '#efe8da',
  spawn: '#eae6de', hut: '#f1ece2', navy: '#3f5372', ferryDeck: '#b8c3bb', cabin: '#f3f0ea', tug: '#9c4838',
  tugHouse: '#efe9dd', house: '#8fb8b4', houseTop: '#f0ebe0', steel: '#98a0a6', wood: '#c29a72', orange: '#e79a4b',
  beacon: '#e9e4d8', boat: '#4f6f96', planter: '#b9ad9a', carDeck: '#a1ada3', render: '#efe8da', office: '#e8e4dc',
};
const deck = (o = {}) => ({ color: M.deck, pattern: PATTERN.planks, ...o });
export const HALYARD = {
  id: 'halyard',
  water: 'marina',   // sheltered marina water (environment.js keys the sea look on this)
  bounds: { minX: -24, maxX: 24, minZ: -46, maxZ: 46 },
  spawnPads: [[0, 2.4, -42], [0, 2.4, 42]],
  spawnBarrier: 4.2,
  // match intro opens high over the ferry's sun deck, then sweeps back down the fuel dock to your spawn (ending in
  // front of the clubhouse wall, not inside the building behind it)
  intro: { from: [7, 12.5, 11], lookFrom: [0, 2.8, -1], toBack: 3.0 },
  single: [
    // ---- the ferry: navy hull, light non-slip deck plate (its 0.2 m edge reads as the sheer stripe)
    B(-16, 16, -1.9, 1.1, -5, 5, { color: M.navy, tag: 'ferry-hull', pattern: PATTERN.hullpaint }),
    B(-16, 16, 1.1, 1.3, -5, 5, { tag: 'ferry-deck', color: M.carDeck, pattern: PATTERN.nonslip, mural: [{ n: [0, 1, 0], id: 4 }] }),
    // cabin (its roof is the sun deck) + wheelhouse on top
    B(-6.5, 6.5, 1.3, 3.8, -2.9, 2.9, { tag: 'ferry-cabin', color: M.cabin, pattern: PATTERN.hullpaint, mural: [{ n: [1, 0, 0], id: 6 }, { n: [-1, 0, 0], id: 6 }, { n: [0, 0, 1], id: 5 }, { n: [0, 0, -1], id: 5 }] }),
    B(-1.5, 1.5, 3.8, 5.2, -1.6, 1.6, { tag: 'ferry-wheelhouse', roof: true, color: M.cabin, pattern: PATTERN.hullpaint }),
  ],
  half: [
    // ================= quay + clubhouse (solid ground behind the basin)
    B(-24, 24, -1.2, 0, -46, -31, { tag: 'quay', color: M.pavers, pattern: PATTERN.pavers }),
    B(-24, 24, 0, 4.6, -46, -45.4, { tag: 'backwall', roof: true, color: M.clubhouse, pattern: PATTERN.render }),
    // spawn terrace on the clubhouse roof: grand stair to the fuel dock, open 2.4 m drops on both sides
    // (body in the clubhouse's render so the terrace reads as part of the building; spawn tiles only on the deck + lip)
    B(-8.5, 8.5, 0, 2.2, -45.4, -38.5, { tag: 'spawn-terrace-body', color: M.render, pattern: PATTERN.render }),
    B(-8.5, 8.5, 2.2, 2.4, -45.4, -38.5, { tag: 'spawn-terrace', color: M.spawn, pattern: PATTERN.spawn }),
    R([0, 0, -32.4], [0, 2.4, -38.5], 6, { tag: 'grand-stair', color: M.stone, pattern: PATTERN.stonestep }),
    B(-8.5, -4.6, 2.4, 3.15, -39.1, -38.5, { tag: 'parapet', color: M.clubhouse, pattern: PATTERN.render }),
    B(4.6, 8.5, 2.4, 3.15, -39.1, -38.5, { tag: 'parapet', color: M.clubhouse, pattern: PATTERN.render }),
    // quay corners: boathouse (left) and a harbour-office kiosk (right) — cover + landmarks, out of the lanes
    B(14.5, 22.5, 0, 3.2, -45.4, -40.6, { tag: 'boathouse', roof: true, color: M.house, pattern: PATTERN.weatherboard }),
    B(-22.2, -17.4, 0, 2.8, -44.6, -41.2, { tag: 'kiosk', roof: true, color: M.office, pattern: PATTERN.render }),

    // ================= centre: the fuel dock
    B(-4.5, 4.5, -1.2, 0, -31, -8.6, deck({ tag: 'fuel-dock' })),
    B(-1.7, 1.7, 0, 2.7, -22.5, -18.8, { tag: 'fuel-hut', roof: true, color: M.hut, pattern: PATTERN.render }),
    // gangway onto the ferry's side corridor (free-spanning plank over the water)
    R([0, 0, -8.8], [0, 1.3, -4.95], 3.4, { tag: 'gangway', thin: true, thickness: 0.22, color: M.steel, pattern: PATTERN.gangdeck }),

    // ================= right lane: the Long Pier (−X for Alpha)
    B(-24, -19.5, -1.2, 0, -31, 0, deck({ tag: 'long-pier' })),
    B(-19.5, -12.5, -1.2, 0, -26.4, -25.2, deck({ tag: 'finger-pier', color: M.finger })),
    B(-19.5, -4.5, -1.2, 0, -12.4, -10.4, deck({ tag: 'boardwalk', color: M.finger })),          // boardwalk to the fuel dock
    // houseboat SEA SHANTY filling the slip: a wide floating-home pontoon (deck 0.7, kid-hoppable from the Long Pier
    // side, the finger pier and the boardwalk; porch rail on the fuel-dock side, 2.5 m of water to the fuel dock), the
    // cottage cabin toward the pier with an open sun deck on the fuel-dock side, squid-only roof garden
    B(-17.6, -7.0, -1.8, 0.7, -23.4, -14.4, { tag: 'houseboat-hull', color: M.house, pattern: PATTERN.gelcoat }),
    B(-16.2, -13.0, 0.7, 2.9, -21.4, -16.2, { tag: 'houseboat-cabin', color: M.houseTop, pattern: PATTERN.gelcoat }),
    R([-19.7, 0, -18.8], [-17.35, 0.7, -18.8], 1.6, { tag: 'houseboat-gangway', thin: true, thickness: 0.18, color: M.steel, pattern: PATTERN.gangdeck }),
    // harbour beacon where the lane meets the other team's boatyard (cover at the seam)
    B(-23.8, -21.4, 0, 2.4, -1.2, 1.2, { tag: 'beacon', color: M.beacon, pattern: PATTERN.render }),

    // ================= left lane: the Boatyard (+X for Alpha)
    B(10, 24, -1.2, 0, -31, -7, { tag: 'yard', color: M.yard, pattern: PATTERN.yard }),
    B(19.5, 24, -1.2, 0, -7, 0, { tag: 'yard-strip', color: M.yard, pattern: PATTERN.yard }),
    B(4.5, 10, -1.2, 0, -26, -24, deck({ tag: 'yard-walkway', color: M.finger })),                   // walkway from the fuel dock (near base)
    // tug up on blocks: deck = flank high ground, ramp up from the mid end, wheelhouse for cover
    B(14.5, 20.5, 0, 2.6, -24, -13, { tag: 'tug-hull', color: M.tug, pattern: PATTERN.hullpaint, notIn: 'zones' }),
    B(15.8, 19.2, 2.6, 4.3, -20.4, -17.4, { tag: 'tug-house', roof: true, color: M.tugHouse, pattern: PATTERN.hullpaint }),
    R([17.5, 0, -7.1], [17.5, 2.6, -13], 2.2, { tag: 'tug-ramp', color: M.wood, pattern: PATTERN.rampboard, notIn: 'zones' }),   // 23.8° (check-maps max 24) — same easing as the zones variant
    // Zone Control (the tug deck is each team's side zone): easier ways up for both sides
    //  • defenders: a steel boarding stair from the yard (quay side) straight up onto the bow
    //  • attackers: the stern ramp eased to 23.8° (it lands 0.45 m into a notch in the stern) and a two-step stack of
    //    spares crates against the west hull side by the aft deck, facing mid (crates = tug_access colliders)
    B(14.5, 20.5, 0, 2.6, -24, -13.45, { tag: 'tug-hull', color: M.tug, pattern: PATTERN.hullpaint, onlyIn: 'zones' }),
    B(14.5, 16.4, 0, 2.6, -13.45, -13, { tag: 'tug-hull', color: M.tug, pattern: PATTERN.hullpaint, onlyIn: 'zones' }),
    B(18.6, 20.5, 0, 2.6, -13.45, -13, { tag: 'tug-hull', color: M.tug, pattern: PATTERN.hullpaint, onlyIn: 'zones' }),
    R([17.5, 0, -7.55], [17.5, 2.6, -13.45], 2.2, { tag: 'tug-ramp', color: M.wood, pattern: PATTERN.rampboard, onlyIn: 'zones' }),
    R([19.0, 0, -29.95], [19.0, 2.6, -24.0], 2.2, { tag: 'tug-bow-stair', color: M.steel, pattern: PATTERN.treads, onlyIn: 'zones' }),
    // plank from the boatyard onto the ferry's end deck
    R([19.7, 0, -3.6], [15.85, 1.3, -3.6], 2.0, { tag: 'ferry-plank', thin: true, thickness: 0.2, color: M.wood, pattern: PATTERN.planks }),

    // ================= ferry details (mirrored to the far side)
    // bulwarks along the long sides, open at the gangway
    B(-16, -1.8, 1.3, 2.0, -5, -4.6, { tag: 'ferry-bulwark', color: M.navy, pattern: PATTERN.hullpaint }),
    B(1.8, 16, 1.3, 2.0, -5, -4.6, { tag: 'ferry-bulwark', color: M.navy, pattern: PATTERN.hullpaint }),
    // sun-deck stair (Alpha's, at its left end). Small cover (fuel pumps, dock box, pump-out station, crates, keel
    // blocks, dinghy, ferry locker + cargo) is set dressing with colliders — see docs/HALYARD.md
    R([12.6, 1.3, -1.9], [6.5, 3.8, -1.9], 2.0, { tag: 'ferry-stair', color: M.steel, pattern: PATTERN.treads }),
  ],
  decor: {
    lamps: [[-23.5, -32.2], [23.5, -32.2], [-23.6, -14], [23.6, -9], [-5.7, -31.8], [5.7, -31.8]],
    palms: [[-15.5, -38.5], [15.5, -38]],
    flags: [[-8, 2.4, -44.6], [8, 2.4, -44.6]],
  },
};

export const MAP_LAYOUTS = { halyard: HALYARD };
for (const [id, s] of Object.entries(STAGES)) if (s.LAYOUT) MAP_LAYOUTS[id] = s.LAYOUT;
// Zone Control zones (zones-data.js) — a layout can also carry its own `zones`
for (const [id, z] of Object.entries(ZONE_DEFS)) if (MAP_LAYOUTS[id] && !MAP_LAYOUTS[id].zones) MAP_LAYOUTS[id].zones = z;
// stage-select order
for (const id of ['tidewater', 'kelpline', 'halyard', 'saltpan', 'crossmarket', 'lockgate', 'terraces', 'cargo']) { const L = MAP_LAYOUTS[id]; if (L) { delete MAP_LAYOUTS[id]; MAP_LAYOUTS[id] = L; } }
