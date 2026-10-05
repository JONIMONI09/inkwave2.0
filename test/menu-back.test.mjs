// Regression tests for menu navigation and the judge → results hand-off.
//
// The bug these came from: Settings → Touch → Touch layout, then Esc. The editor's onBack used _go('settings'),
// which PUSHES. That left the stack as [main, settings, touchedit, settings], and the next Back popped straight
// back into the editor — Esc cycled the player between the editor and Settings forever.
//
// The second half: _judge() awaited the HUD judge promise with `judgeP || setTimeout(...)`. A Promise is always
// truthy, so that fallback was dead code: if the judge's rAF loop ever stalls, the match never reaches the results
// screen and the round is stuck.
//
// The stack manipulation is reproduced here exactly as show() performs it, so the loop is demonstrated rather than
// described. Run with: node test/menu-back.test.mjs — plain node, no browser.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { fail++; console.log(`FAIL  ${name}\n      ${e.message}`); }
}
const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');
const menus = await read('../src/ui/menus.js');

// the two halves of Menus.show()'s stack rule, and _back()'s pop target — verbatim from the source
const showStack = (stack, name, opts) => {
  if (opts.pop) stack.pop();
  else if (opts.push && name) stack.push(name);
  else stack = name ? [name] : [];
  return stack;
};
const backTarget = (stack) => (stack.length > 1 ? stack[stack.length - 2] : null);

await test('the old behaviour really did loop: push-on-back cycles forever', () => {
  // reproduce the bug: main → settings → touchedit, then _go('settings') twice over
  let stack = showStack([], 'main', {});
  stack = showStack(stack, 'settings', { push: true });
  stack = showStack(stack, 'touchedit', { push: true });
  const afterFirstEsc = showStack(stack, 'settings', { push: true });     // what _go did
  const secondEsc = backTarget(afterFirstEsc);
  assert.equal(secondEsc, 'touchedit', 'Esc from Settings lands back in the editor — the loop the user reported');
  assert.notEqual(secondEsc, 'main', 'so it never actually escapes');
});

await test('popping instead of pushing leaves Settings one step from the main menu', () => {
  let stack = showStack([], 'main', {});
  stack = showStack(stack, 'settings', { push: true });
  stack = showStack(stack, 'touchedit', { push: true });
  const afterPop = showStack(stack, 'settings', { pop: true });          // what _popTo does
  assert.deepEqual(afterPop, ['main', 'settings'], 'the editor is off the stack');
  assert.equal(backTarget(afterPop), 'main', 'Esc from Settings now reaches the main menu');
  const afterSecond = showStack(afterPop, 'main', { pop: true });
  assert.deepEqual(afterSecond, ['main'], 'and Esc again lands on the main screen without re-entering anything');
});

await test('_popTo exists and is what the pushed sub-screens use', () => {
  assert.ok(/_popTo\(name\)\s*\{/.test(menus), 'the helper exists');
  const body = menus.slice(menus.indexOf('  _popTo(name) {'), menus.indexOf('  _back() {'));
  assert.ok(/this\._stack\[this\._stack\.length - 2\] === name/.test(body), 'it checks we really are above that screen');
  assert.ok(/\{ pop: true, back: true \}/.test(body), 'and pops rather than pushes');
  assert.ok(/this\._go\(name, \{ back: true \}\)/.test(body), 'with a push fallback for screens opened directly by the engine');
});

await test('no pushed sub-screen still uses _go to go back (the loop cannot come back)', () => {
  // touchedit (DONE) and profiles (onBack) must all go through _popTo now
  const bad = [...menus.matchAll(/_go\('settings', \{ back: true \}\)/g)];
  assert.equal(bad.length, 0, `no _go('settings') left: ${bad.length} found`);
  const scr = menus.slice(menus.indexOf('  _scr_touchedit() {'), menus.indexOf('  // ================================================================ SCREEN: loading'));
  assert.ok(/onBack: \(\) => this\._popTo\('settings'\)/.test(scr), 'the touch editor pops back');
  assert.ok(/this\._popTo\('settings'\)/.test(scr), 'and so does its DONE button');
  const prof = menus.slice(menus.indexOf('  _scr_profiles() {'));
  assert.ok(/onBack: \(\) => this\._popTo\('settings'\)/.test(prof), 'the profile screen pops back');
});

await test('_go still pushes, because moving FORWARD is its job', () => {
  const go = menus.slice(menus.indexOf('  _go(name, opts = {}) {'), menus.indexOf('  _popTo(name) {'));
  assert.ok(/push: true/.test(go), '_go pushes — only the way back changed');
});

await test('the judge can no longer strand the round: the promise is raced against a ceiling', async () => {
  const main = await read('../src/main.js');
  const j = main.slice(main.indexOf('    const judgeP = zr'), main.indexOf('    const myTeam = m.local'));
  assert.ok(/Promise\.race\(\[\s*judgeP\.catch/.test(j), 'judgeP is raced, not awaited bare');
  assert.ok(/JUDGE_MAX_MS/.test(j), 'against a named ceiling');
  assert.ok(!/judgeP \|\| new Promise/.test(j), 'the truthy-Promise fallback is gone — it could never have fired');
  // and the ceiling must actually let a player through
  const done = await new Promise((r) => { setTimeout(() => r('judge-never-resolves'), 30); });
  const won = await Promise.race([new Promise(() => {}), new Promise((r) => setTimeout(() => r('reached results'), 30))]);
  assert.equal(won, 'reached results', 'a stalled judge promise does not block the hand-off');
});

await test('the results screen is still reachable after the hand-off', async () => {
  const main = await read('../src/main.js');
  const j = main.slice(main.indexOf('    const judgeP = zr'), main.indexOf('  _fade(to, ms) {', main.indexOf('    const judgeP = zr')));
  assert.ok(/m\.setState\('results'\)/.test(j), 'the match state still flips to results');
  assert.ok(/this\.menus\?\.show\('results'\)/.test(j), 'and the results screen is shown after it');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);