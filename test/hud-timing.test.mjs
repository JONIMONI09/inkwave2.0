// Regression tests for gameplay-HUD timing (brief section 2).
//
// The rule under test: the gameplay HUD (ink tank, minimap, reticle, squad) and the touch gameplay controls exist
// only while the round is actually being played — hidden through the loading fade, the intro fly-over and the
// countdown, up at the authoritative 'playing' edge, and hidden again once the judge takes over. The judge card and
// the results UI draw in the HUD's overlay layer, which setVisible(false) does not touch, so hiding is safe.
//
// These are contract tests over the source: the flow is a chain of setTimeout / event-bus edges in main.js that no
// headless node process can execute, so the assertions pin the wiring that was wrong.
// Run with: node test/hud-timing.test.mjs — plain node, no browser.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { fail++; console.log(`FAIL  ${name}\n      ${e.message}`); }
}
const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');
const main = await read('../src/main.js');

await test('the intro no longer reveals the HUD on its own wall-clock timer', async () => {
  // The old code did setTimeout(... setVisible(true), 3000) in _intro and 5600 in the boss intro, while the match
  // only reaches 'playing' at MATCH 4.2 s / BOSS_MODE.intro 7.2 s — the HUD was on screen before GO, always.
  assert.ok(!/setTimeout\(\(\) => \{ if \(this\.match\?\.state === 'intro'\) this\.hud\?\.setVisible\(true\)/.test(main),
    'no fixed intro timer turns the gameplay HUD on');
  assert.ok(!/m\.state === 'intro'\) this\.hud\?\.setVisible\(true\)/.test(main),
    'the boss intro does not either');
  // the intro may still raise its own announcement banner — that is not the gameplay HUD
  assert.ok(/hud\?\.banner\('ready'\)/.test(main), 'the intro still announces itself');
});

await test("the HUD comes up on the authoritative 'playing' edge, not a timer", () => {
  const branch = main.slice(main.indexOf("if (state === 'playing') {"), main.indexOf("if (state === 'judge') {"));
  assert.ok(/this\.hud\?\.setVisible\(!this\._hudTucked && this\._gameplayHudWanted\(\)\)/.test(branch),
    "the 'playing' branch reveals the HUD");
  assert.ok(/hud\?\.banner\('go'\)/.test(branch), 'and fires the GO banner with it');
  assert.ok(branch.indexOf('setVisible') < branch.indexOf("banner('go')"),
    'the HUD is revealed before the GO banner, so GO is never hidden');
});

await test('the judge hides the gameplay HUD instead of revealing it', () => {
  // _bossResults is defined before _judge in main.js, so take the judge body from its own start
  const judge = main.slice(main.indexOf('  async _judge() {'));
  assert.ok(/this\.hud\?\.setVisible\(false\)/.test(judge), '_judge hides the gameplay HUD');
  assert.ok(!/this\.hud\?\.setVisible\(true\)/.test(judge), 'and does not re-reveal it (that was the bug)');
  const stateJudge = main.slice(main.indexOf("if (state === 'judge') {"), main.indexOf("if (state === 'finish') {"));
  assert.ok(/setVisible\(false\)/.test(stateJudge), "the 'judge' state edge also hides it");
});

await test('the judge card survives the hide (it lives outside the hideable HUD)', async () => {
  const hud = await read('../src/ui/hud.js');
  assert.ok(/judge \+ splatted \+ lineup live outside the hideable HUD/.test(hud), 'the overlay layer is documented');
  const build = hud.slice(hud.indexOf('  _build() {'), hud.indexOf('  // ================================================================ public'));
  const elIdx = build.indexOf("class: 'iw-hud is-hidden'");
  const overIdx = build.indexOf("class: 'iw-hud-over'");
  assert.ok(elIdx >= 0 && overIdx > elIdx, 'the judge/overlay layer is a sibling appended after the hideable HUD');
  assert.ok(/this\.overLayer/.test(hud.slice(overIdx)), 'and is what the judge draws into');
});

await test('touch gameplay controls are hidden outside live play', () => {
  const line = main.slice(main.indexOf('this.touch?.setVisible('), main.indexOf('this.menus?.update?.(dt)'));
  assert.ok(/m\.state === 'playing'\)/.test(line), 'only while playing');
  assert.ok(!/m\.state === 'intro'/.test(line), 'not during the intro fly-over');
  assert.ok(!/m\.state === 'finish'/.test(line), 'not after the round ends');
  assert.ok(/!m\.paused/.test(line) && /!this\.menus\?\.current/.test(line), 'still never over pause, menus or attract');
});

await test('every visibility decision goes through one helper, so the tuck cannot resurrect a hidden HUD', () => {
  assert.ok(/_gameplayHudWanted\(\)\s*\{[\s\S]*?m\.state === 'playing'/.test(main), 'the helper keys off live play only');
  assert.ok(/this\._gameplayHudWanted\(\)/.test(main), 'and is actually used');
  const onScreen = main.slice(main.indexOf('  _onScreen(s) {'), main.indexOf('    if (!this.showcase) return;'));
  assert.ok(/!hide && this\._gameplayHudWanted\(\)/.test(onScreen),
    'closing the practice loadout only re-shows the HUD if play is actually running');
});

await test('attract mode and a restart both leave the HUD down', () => {
  assert.ok(/if \(match\.attract \|\| match !== this\.match\) return;/.test(main),
    'the attract round is excluded from the match:state HUD edges');
  const start = main.slice(main.indexOf('  async startMatch('), main.indexOf('  // Loading gate end.'));
  assert.ok(/this\.hud\?\.setVisible\(false\)/.test(start), 'a new match starts with the HUD hidden');
  assert.ok(start.indexOf('setVisible(false)') < start.indexOf('m.start()'),
    'and it is hidden before the match is started, so nothing flashes');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);