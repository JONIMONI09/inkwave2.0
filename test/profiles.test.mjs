// Regression tests for local profiles (add-on request) and the Optimization pre-warm setting.
//
// The rule under test: profiles live in this browser only; upgrading the game never loses an existing save; a record
// from a NEWER build is left alone rather than half-applied; and the store can never be left with zero accounts.
// Run with: node test/profiles.test.mjs — plain node, no browser.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { fail++; console.log(`FAIL  ${name}\n      ${e.message}`); }
}
const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');

// a localStorage stand-in, so the store is exercised for real rather than only read
const store = () => {
  const d = new Map();
  globalThis.localStorage = {
    getItem: (k) => (d.has(k) ? d.get(k) : null),
    setItem: (k, v) => d.set(k, String(v)),
    removeItem: (k) => d.delete(k),
    clear: () => d.clear(),
    _d: d,
  };
  return d;
};
store();
const P = await import('../src/core/profiles.js');
const { DEFAULT_PROFILE } = await import('../src/config.js');

await test('first run creates one account from the default profile', () => {
  store();
  const { accounts, activeId } = P.loadAccounts();
  assert.equal(accounts.length, 1);
  assert.equal(accounts[0].id, activeId);
  assert.equal(accounts[0].profile.level, DEFAULT_PROFILE.level);
});

await test('an existing single-profile save is adopted, not lost (the upgrade path)', () => {
  const d = store();
  d.set('inkwave.profile', JSON.stringify({ name: 'Jayden', level: 7, xp: 120, wins: 12, matches: 30, totalTurf: 9000, weapon: 'charger' }));
  const { accounts, activeId } = P.loadAccounts();
  assert.equal(accounts.length, 1);
  assert.equal(accounts[0].profile.name, 'Jayden');
  assert.equal(accounts[0].profile.level, 7, 'progress carried over');
  assert.equal(accounts[0].profile.totalTurf, 9000);
  assert.equal(accounts[0].profile.weapon, 'charger', 'and the loadout');
  assert.equal(activeId, accounts[0].id);
});

await test('a record from a NEWER build is refused, never partially applied', () => {
  const d = store();
  d.set('inkwave.accounts', JSON.stringify({ version: 99, activeId: 'x', accounts: [{ id: 'x', name: 'Future', profile: {} }] }));
  const r = P.loadAccounts();
  assert.equal(r.newerThanBuild, true, 'the store says so instead of pretending it understood');
  assert.equal(r.accounts[0].name, 'Future', 'and the stored data is returned untouched');
  assert.equal(d.get('inkwave.accounts'), JSON.stringify({ version: 99, activeId: 'x', accounts: [{ id: 'x', name: 'Future', profile: {} }] }),
    'nothing was rewritten — a later build can still read its own file');
});

await test('migrateProfile clamps junk instead of letting it poison the progression screen', () => {
  const p = P.migrateProfile({ name: 'x'.repeat(40), level: NaN, xp: -5, matches: 1e30, totalTurf: 'abc' });
  assert.equal(p.name.length, 16, 'the name is trimmed to what the UI expects');
  assert.equal(p.level, DEFAULT_PROFILE.level, 'a NaN level falls back to the default, not NaN');
  assert.equal(p.xp, 0);
  assert.ok(p.matches <= 1e9 && p.totalTurf >= 0, 'numbers are clamped into range');
  assert.equal(P.migrateProfile(null).level, DEFAULT_PROFILE.level, 'null is a fresh profile, not a crash');
});

await test('create / switch / rename / delete keep each profile separate', () => {
  store();
  let s = P.loadAccounts();
  const a = P.createAccount(s.accounts, s.activeId, 'Smurf');
  s = { accounts: a.accounts, activeId: a.activeId };
  assert.equal(s.accounts.length, 2);
  // the first profile earned some XP before the switch
  P.activeAccount(s.accounts, s.activeId - 1).profile.xp = 500;
  const firstId = s.accounts[0].id;
  s.activeId = s.accounts[1].id;
  assert.equal(P.activeAccount(s.accounts, s.activeId).profile.xp, 0, 'the new profile is fresh');
  P.activeAccount(s.accounts, firstId).profile.xp = 999;
  assert.equal(P.activeAccount(s.accounts, s.accounts[1].id).profile.xp, 0, 'and switching back finds the old XP intact');
  P.renameAccount(s.accounts, s.accounts[1].id, 'Renamed');
  assert.equal(s.accounts[1].name, 'Renamed');
  const d = P.deleteAccount(s.accounts, s.accounts[1].id, s.accounts[1].id);
  assert.equal(d.accounts.length, 1);
  assert.equal(d.activeId, s.accounts[0].id, 'deleting the active one falls back to another');
});

await test('the last profile cannot be deleted', () => {
  store();
  const s = P.loadAccounts();
  const r = P.deleteAccount(s.accounts, s.activeId, s.activeId);
  assert.equal(r.refused, true, 'refused, not silently emptied');
  assert.equal(r.accounts.length, 1);
});

await test('corrupt storage degrades to a working state instead of throwing', () => {
  const d = store();
  d.set('inkwave.accounts', '{{{not json');
  const s = P.loadAccounts();
  assert.equal(s.accounts.length, 1, 'still one usable account');
  d.set('inkwave.accounts', JSON.stringify({ version: 1, activeId: 'gone', accounts: [] }));
  const s2 = P.loadAccounts();
  assert.equal(s2.accounts.length, 1, 'an empty list is repaired');
  assert.equal(s2.activeId, s2.accounts[0].id);
});

await test('saveAccounts keeps the legacy key in step so an older build still finds a profile', () => {
  const d = store();
  let s = P.loadAccounts();
  s.accounts[0].profile.level = 12;
  P.saveAccounts(s.accounts, s.accounts[0].id);
  assert.equal(JSON.parse(d.get('inkwave.profile')).level, 12, 'the old single-profile key still resolves');
});

await test('main.js writes profiles through the store, not straight to the old key', async () => {
  const main = await read('../src/main.js');
  assert.ok(!/saveJSON\('inkwave.profile'/.test(main), 'no direct write to the legacy key remains');
  assert.ok(/_saveProfile\(\)\s*\{[\s\S]*saveAccounts\(this\.accounts, this\.accountId\)/.test(main), 'the store is the single writer');
  const n = (main.match(/this\._saveProfile\(\);|self\._saveProfile\(\);/g) || []).length;
  assert.ok(n >= 5, `every previous save site now goes through it (${n} call sites)`);
  // `self` only exists inside _menuApi — a `self._saveProfile()` in a class method would throw at runtime and
  // node --check cannot see it
  const afterApi = main.slice(main.indexOf('  _setSettings(partial) {'));
  assert.ok(!/self\._saveProfile\(\)/.test(afterApi), 'no self._saveProfile() outside the menu API closure');
  for (const fn of ['getProfiles', 'createProfile', 'switchProfile', 'renameProfile', 'deleteProfile'])
    assert.ok(new RegExp(`${fn}:`).test(main), `the menus can call api.${fn}()`);
});

await test('the Optimization setting exists and drives the pre-warm, which reuses the match warm-up', async () => {
  const cfg = await read('../src/config.js');
  assert.ok(/prewarm: true,/.test(cfg), 'a prewarm default is declared');
  const menus = await read('../src/ui/menus.js');
  assert.ok(/id: 'optimize', label: 'Optimize'/.test(menus), 'there is an Optimize tab');
  assert.ok(/key: 'prewarm'/.test(menus), 'with the toggle');
  const main = await read('../src/main.js');
  const warm = main.slice(main.indexOf('  _idlePrewarm() {'));
  assert.ok(/this\.settings\?\.prewarm/.test(warm), 'the warm-up is gated on the setting');
  assert.ok(/c\.warmAll\?\.\(\)/.test(warm), 'it reuses Character.warmAll — the same compile the match start does');
  assert.ok(/this\.showcase\?\._warmup\?\.\(\)/.test(warm), 'and the showcase warm-up');
  assert.ok(/G\.mode !== 'menu'/.test(warm), 'only ever while sitting in the menus');
  assert.ok(/'prewarm' in partial/.test(main), 'flipping the setting takes effect immediately');
});

await test('the profile screen is reachable and cannot leave the game without a profile', async () => {
  const menus = await read('../src/ui/menus.js');
  assert.ok(/'profiles'/.test(menus.split('\n').find((l) => l.startsWith('const SCREENS'))), 'profiles is a registered screen');
  assert.ok(/  _scr_profiles\(\) \{/.test(menus), 'and it has a builder');
  assert.ok(/this\._go\('profiles'\)/.test(menus), 'reached from the settings row');
  assert.ok(/The last profile cannot be deleted/.test(menus), 'deleting the last one is refused in the UI too');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);