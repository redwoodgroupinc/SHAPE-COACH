// Part of the emulator smoke test (scripts/android-smoke.sh): drives the ShapeCoach page inside
// the app through Chrome's DevTools socket, forwarded by adb to 127.0.0.1:<port>.
// Reloads the page to catch every console error, records what is on screen, starts the free
// demo from the Premium screen and checks that the coach counts reps. Writes <out>/app-state.json
// and prints one "KEY: value" line per check.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [port = '9222', out = 'smoke'] = process.argv.slice(2);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const screenshot = (name) => writeFileSync(`${out}/${name}.png`, execFileSync('adb', ['exec-out', 'screencap', '-p'], { maxBuffer: 64 << 20 }));

async function findPage() {
  for (let i = 0; i < 30; i += 1) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = pages.find((p) => p.type === 'page' && p.url.includes('shapecoach-theta.vercel.app'));
      if (page) return page;
    } catch {
      // Chrome's DevTools socket isn't up yet.
    }
    await sleep(2000);
  }
  throw new Error('No ShapeCoach page found in Chrome');
}

const page = await findPage();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let nextId = 0;
const pending = new Map();
const errors = [];
ws.onmessage = ({ data }) => {
  const msg = JSON.parse(data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') errors.push(`${msg.params.entry.text} ${msg.params.entry.url ?? ''}`.trim());
};
const send = (method, params = {}) => new Promise((resolve) => {
  nextId += 1;
  pending.set(nextId, resolve);
  ws.send(JSON.stringify({ id: nextId, method, params }));
});
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
const state = () => evaluate(`({
  url: location.href,
  title: document.title,
  paywallOpen: document.getElementById('paywall-dialog')?.open ?? null,
  price: document.getElementById('paywall-price')?.textContent ?? null,
  mode: document.getElementById('stage')?.dataset.mode ?? null,
  running: document.getElementById('stage')?.classList.contains('is-running') ?? null,
  exercise: document.getElementById('hud-exercise')?.textContent.trim() ?? null,
  reps: document.getElementById('rep-count')?.textContent.trim() ?? null,
  status: document.getElementById('status-text')?.textContent.trim() ?? null,
  // How much of the skeleton overlay is drawn (screenshots on the emulator can miss GPU layers).
  overlayPixelsDrawn: (() => {
    const c = document.getElementById('overlay');
    if (!c?.width) return 0;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n += 1;
    return n;
  })(),
  digitalGoodsApi: typeof window.getDigitalGoodsService,
  paymentRequestApi: typeof window.PaymentRequest,
  userAgent: navigator.userAgent,
})`);

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Page.reload', { ignoreCache: true });
await sleep(15000);
const onLaunch = await state();
screenshot('1-launch');
console.log(`PAGE: ${onLaunch.url}`);
console.log(`PAYWALL ON LAUNCH: ${onLaunch.paywallOpen ? 'yes' : 'no'} (${onLaunch.price})`);
console.log(`PLAY BILLING APIS IN THE PAGE: Digital Goods ${onLaunch.digitalGoodsApi}, Payment Request ${onLaunch.paymentRequestApi}`);
// The Digital Goods API goes through the app's DelegationService to Google Play Billing. The
// emulator has no Play Store, so a working setup ends in a Play Billing error; a missing or
// disabled DelegationService fails before reaching it.
const digitalGoods = await evaluate(`window.getDigitalGoodsService('https://play.google.com/billing')
  .then((s) => s.getDetails(['shapecoach_premium']))
  .then((d) => 'details ' + JSON.stringify(d), (e) => 'error ' + e.name + ': ' + e.message)`);
console.log(`DIGITAL GOODS API: ${digitalGoods}`);

await evaluate(`document.querySelector('.paywall-demo')?.click(), true`);
await sleep(30000);
const inDemo = await state();
screenshot('2-demo');
console.log(`DEMO RUNNING: ${inDemo.mode === 'demo' && inDemo.running ? 'yes' : 'no'} (exercise "${inDemo.exercise}", reps ${inDemo.reps}, skeleton pixels drawn ${inDemo.overlayPixelsDrawn})`);

console.log(`PAGE ERRORS: ${errors.length ? errors.length : 'none'}`);
writeFileSync(`${out}/app-state.json`, `${JSON.stringify({ onLaunch, digitalGoods, inDemo, errors }, null, 2)}\n`);
ws.close();
