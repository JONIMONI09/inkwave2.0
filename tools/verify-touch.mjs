// Focused probe: why is touch.visible false while the match plays? Also exercise fire + stick.
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE || 'http://localhost:8490';
const CHROME = process.env.CHROME || '/tmp/browsers/chrome-headless-shell/linux-154.0.8037.92/chrome-headless-shell-linux64/chrome-headless-shell';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'shell', args: ['--enable-unsafe-swiftshader', '--use-gl=swiftshader', '--no-sandbox', '--window-size=480,270'], defaultViewport: { width: 480, height: 270, isMobile: true, hasTouch: true } });
try {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`${BASE}/?skipTitle&autostart=60&map=tidewater`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__inkwave && __inkwave.match && __inkwave.match.state === "playing"', { timeout: 155000, polling: 500 }).catch(() => console.log('match not playing in time'));
  await new Promise((r) => setTimeout(r, 2500));   // let the intro/GO banner pass through
  const diag = await page.evaluate(() => {
    const g = window.__inkwave; if (!g) return { booted: false, bootError: document.getElementById('boot-error')?.textContent || null };
    const m = g.match;
    return { state: m?.state, visible: g.touch?.visible, quality: g.settings.quality, pr: window.__G ? +__G.renderer.getPixelRatio().toFixed(2) : null };
  });
  console.log('DIAG', JSON.stringify(diag));
  // movement stick (inside a 480×270 viewport): drag up and check the actor's move intent
  await page.touchscreen.touchStart(80, 200);
  await page.touchscreen.touchMove(80, 150);
  await new Promise((r) => setTimeout(r, 600));
  console.log('STICK', JSON.stringify(await page.evaluate(() => ({ move: __inkwave?.match?.local?.intent?.move?.toArray?.().map((v) => +v.toFixed(2)) ?? null, axis: __inkwave ? { ...__inkwave.input.moveAxis } : null }))));
  await page.touchscreen.touchEnd();
  await new Promise((r) => setTimeout(r, 200));
  console.log('RELEASED', JSON.stringify(await page.evaluate(() => ({ axis: window.__inkwave ? { ...__inkwave.input.moveAxis } : null }))));
  console.log('ERRS', errs.slice(0, 8).join(' | ') || 'none');
  // geometry QA: every control on-screen, fire button largest, no two buttons overlapping
  const geo = await page.evaluate(() => {
    const vw = innerWidth, vh = innerHeight;
    const rects = [...document.querySelectorAll('.tw-btn')].map((b) => ({ n: b.className.replace('tw-btn tw-btn--', ''), ...b.getBoundingClientRect().toJSON() }));
    const off = rects.filter((r) => r.x < 0 || r.y < 0 || r.x + r.width > vw || r.y + r.height > vh).map((r) => r.n);
    const overlap = [];
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) overlap.push(a.n + '+' + b.n);
    }
    const fire = rects.find((r) => r.n === 'fire');
    return { vw, vh, buttons: rects.length, off, overlap, fireArea: fire ? Math.round(fire.width * fire.height) : null, biggest: Math.max(...rects.map((r) => r.width * r.height)) };
  });
  console.log('GEO', JSON.stringify(geo));
  await page.screenshot({ path: '/tmp/shot-touch.png' });
} finally { await browser.close(); }
