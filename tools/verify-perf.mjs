// Probe: does the page produce FCP in full headless Chrome + SwiftShader? Also collect
// CPU/RAM-relevant metrics (JS heap, frame times, boot duration) for the sandbox report.
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE || 'http://localhost:8490';
const CHROME = process.env.CHROME || '/tmp/browsers/chrome/linux-154.0.8037.92/chrome-linux64/chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--enable-unsafe-swiftshader', '--use-gl=swiftshader', '--no-sandbox', '--disable-dev-shm-usage', '--window-size=900,600'], defaultViewport: { width: 900, height: 600 } });
try {
  const page = await browser.newPage();
  const client = await page.createCDPSession();
  await client.send('Performance.enable');
  await page.goto(`${BASE}/?skipTitle`, { waitUntil: 'domcontentloaded' });
  // buffered:true replays past paint entries, so observing after navigation still finds FCP
  const fcp = await page.evaluate(() => new Promise((res) => {
    new PerformanceObserver((l) => { const e = l.getEntries().find((x) => x.name === 'first-contentful-paint'); if (e) res(e.startTime); }).observe({ type: 'paint', buffered: true });
    setTimeout(() => res(-1), 60000);
  }));
  const mem = (await client.send('Performance.getMetrics')).metrics.filter((m) => ['JSHeapUsedSize', 'JSHeapTotalSize', 'Documents', 'Nodes', 'JSEventListeners'].includes(m.name));
  await new Promise((r) => setTimeout(r, 25000));   // let the menu/attract render for frame timing
  const mem2 = (await client.send('Performance.getMetrics')).metrics.filter((m) => ['JSHeapUsedSize', 'JSHeapTotalSize', 'Documents', 'Nodes'].includes(m.name));
  const state = await page.evaluate(() => ({ menus: window.__inkwave ? __inkwave.menus?.current : 'booting', fps: window.__inkwave ? __inkwave.fps : null, boot: window.__inkwave?.bootMs ?? null }));
  // frame-time sample from the rAF timestamps the game loop already produces
  const frames = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; if (performance.now() - t0 < 5000) requestAnimationFrame(tick); else res({ fps: +(n / 5).toFixed(1) }); };
    requestAnimationFrame(tick);
  }));
  console.log(JSON.stringify({ fcpMs: Math.round(fcp), menu: state, frames, heapMB: mem2.map((m) => [m.name, +(m.value / 1048576).toFixed(1)]), nodes: mem.find((m) => m.name === 'Nodes')?.value }));
  await page.screenshot({ path: '/tmp/shot-lh-probe.png' });
} finally { await browser.close(); }
