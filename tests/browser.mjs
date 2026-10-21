import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, access, mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

const candidates = [process.env.GLACE_CHROMIUM, chromium.executablePath(), `${homedir()}/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`].filter(Boolean);
let executablePath;
for (const candidate of candidates) { try { await access(candidate); executablePath = candidate; break; } catch {} }
const fixture = '<!doctype html><html><body style="margin:40px;background:#182526;color:white"><h1>Glace browser test</h1><input aria-label="Comment"><div id="feed"><video id="first" style="display:block;width:640px;height:360px;background:#334b4a"></video></div></body></html>';
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path === '/') { response.setHeader('Content-Type', 'text/html'); response.end(fixture); return; }
    if (!/^\/[a-z]+\.(html|css|js)$/.test(path)) { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html');
    response.end(await readFile(`dist${path}`));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath });
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await context.addInitScript(() => {
    window.glaceHosts = (root = document) => [...root.querySelectorAll('*')].flatMap(element => [
      ...(element.hasAttribute('data-glace-controller') ? [element] : []),
      ...(element.shadowRoot ? window.glaceHosts(element.shadowRoot) : []),
    ]);
    const values = { sync: {}, local: {} };
    const listeners = new Set();
    const area = name => ({
      get: async key => typeof key === 'string' ? { [key]: values[name][key] } : { ...values[name] },
      set: async patch => {
        const changes = {};
        for (const [key, value] of Object.entries(patch)) { changes[key] = { oldValue: values[name][key], newValue: value }; values[name][key] = value; }
        for (const listener of listeners) listener(changes, name);
      },
    });
    window.chrome = {
      storage: { sync: area('sync'), local: area('local'), onChanged: { addListener: callback => listeners.add(callback), removeListener: callback => listeners.delete(callback) } },
      runtime: { openOptionsPage: async () => {}, getURL: value => value, sendMessage: async () => {} },
      tabs: { query: async () => [] },
    };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.addScriptTag({ path: 'dist/content.js' });
  await page.locator('[data-glace-controller]').waitFor();
  const pill = page.locator('.pill').first();
  const host = page.locator('[data-glace-controller]').first();
  const expand = () => pill.hover();
  const collapsedWidth = (await host.boundingBox()).width;
  assert.equal(await pill.evaluate(element => getComputedStyle(element).opacity), '0.5');
  assert.equal(await page.locator('[aria-label="Increase video speed"]').isVisible(), false);
  await page.evaluate(async () => {
    await chrome.storage.sync.set({ glaceSettings: { idleOpacity: 0.35, opacity: 0.9 } });
  });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-glace-controller]').shadowRoot.querySelector('.pill')).opacity === '0.35');
  await expand();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-glace-controller]').shadowRoot.querySelector('.pill')).opacity === '0.9');
  await page.mouse.move(0, 0);
  await page.evaluate(async () => {
    await chrome.storage.sync.set({ glaceSettings: { idleOpacity: 0.5, opacity: 0.86 } });
  });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-glace-controller]').shadowRoot.querySelector('.pill')).opacity === '0.5');
  await expand();
  assert.ok((await host.boundingBox()).width > collapsedWidth, 'hover reveals the full controls');
  await page.locator('[aria-label="Increase video speed"]').click();
  assert.equal(await page.locator('#first').evaluate(video => video.playbackRate), 1.1);
  await page.locator('h1').click();
  await page.keyboard.press('d');
  assert.equal(await page.locator('#first').evaluate(video => video.playbackRate), 1.2);
  await page.locator('input').focus();
  await page.keyboard.press('d');
  assert.equal(await page.locator('#first').evaluate(video => video.playbackRate), 1.2, 'typing must not change speed');
  await page.locator('h1').click();
  await page.keyboard.press('g');
  assert.equal(await page.locator('#first').evaluate(video => video.playbackRate), 1.5);
  await page.keyboard.press('r');
  assert.equal(await page.locator('#first').evaluate(video => video.playbackRate), 1);
  await expand();
  await page.locator('[aria-label="Hide video controls"]').click();
  await page.locator('[aria-label="Restore Glace video controls"]').waitFor({ state: 'visible' });
  await page.locator('[aria-label="Restore Glace video controls"]').click();
  await expand();
  await page.locator('[aria-label="Increase video speed"]').waitFor({ state: 'visible' });
  await page.evaluate(() => {
    const video = document.createElement('video'); video.id = 'second';
    video.style.cssText = 'display:block;width:420px;height:240px;background:#263a36;margin-top:20px';
    document.querySelector('#feed').append(video);
  });
  await page.waitForFunction(() => window.glaceHosts().length === 2);
  const beforeHover = await page.locator('#first').evaluate(video => video.playbackRate);
  const secondBefore = await page.locator('#second').evaluate(video => video.playbackRate);
  await page.locator('#second').hover();
  await page.locator('h1').evaluate(element => element.focus());
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('d');
  assert.equal(await page.locator('#second').evaluate(video => video.playbackRate), Math.round((secondBefore + 0.1) * 100) / 100);
  assert.equal(await page.locator('#first').evaluate(video => video.playbackRate), beforeHover, 'hovered feed video is the only keyboard target');
  await page.evaluate(async () => {
    const { glaceSettings } = await chrome.storage.sync.get('glaceSettings');
    await chrome.storage.sync.set({ glaceSettings: { ...glaceSettings, defaultSpeed: 1.75, step: 0.25, rememberSpeed: false } });
  });
  await page.waitForFunction(() => [...document.querySelectorAll('video')].every(video => video.playbackRate === 1.75));
  await expand();
  await page.locator('[aria-label="Increase video speed"]').first().click();
  assert.equal(await page.locator('#first').evaluate(video => video.playbackRate), 2);
  await page.locator('h1').click();
  await page.keyboard.press('r');
  assert.equal(await page.locator('#first').evaluate(video => video.playbackRate), 1.75, 'reset uses the configured default speed');
  await expand();
  await page.locator('[aria-label="Increase video speed"]').first().click();
  await host.locator('.speed').click();
  assert.equal(await page.locator('#first').evaluate(video => video.playbackRate), 1.75, 'speed button resets to the configured default speed');
  await page.locator('h1').click();
  await page.keyboard.press('d');
  await page.screenshot({ path: '/tmp/glace-content.png' });
  // An arbitrary nested player needs no site-specific selectors. Its own
  // stacking context keeps the pill under page UI even with a raised video.
  await page.mouse.move(0, 0);
  await page.evaluate(() => {
    const video = document.querySelector('#first');
    const player = document.createElement('div');
    player.id = 'generic-player';
    player.style.cssText = 'position:relative;isolation:isolate;width:640px;height:360px';
    video.before(player);
    const container = document.createElement('div');
    container.style.cssText = 'position:relative;z-index:0';
    player.append(container);
    container.append(video);
    video.style.position = 'relative';
    video.style.zIndex = '3';
    const controls = document.createElement('div');
    controls.id = 'player-controls';
    controls.style.cssText = 'position:absolute;inset:auto 0 0;height:40px;z-index:10';
    player.append(controls);
  });
  await page.waitForFunction(() => {
    const video = document.querySelector('#first');
    const host = document.querySelector('[data-glace-controller]');
    return host.parentElement.id === 'generic-player' && getComputedStyle(host).zIndex === '11';
  });
  await expand();
  await page.locator('[aria-label="Increase video speed"]').first().click();
  assert.equal(await page.locator('#first').evaluate(video => video.playbackRate), 2.25, 'pill remains usable above a raised video');
  await page.locator('[aria-label="Hide video controls"]').first().click();
  await page.locator('[aria-label="Restore Glace video controls"]').first().click();
  await page.mouse.move(0, 0);
  // A late transparent interaction layer must not prevent hovering the pill.
  await page.locator('#player-controls').evaluate(element => element.style.inset = '0');
  await page.locator('#player-controls').evaluate(element => element.style.height = 'auto');
  const coveredBy = () => page.evaluate(() => {
    const rect = document.querySelector('[data-glace-controller]').getBoundingClientRect();
    return document.elementFromPoint(rect.x + 5, rect.y + 5)?.id;
  });
  await expand();
  await page.locator('[aria-label="Increase video speed"]').first().click();
  assert.equal(await page.locator('#first').evaluate(video => video.playbackRate), 2.5, 'pill remains hoverable and clickable above transparent player interaction layers');
  await page.locator('#player-controls').evaluate(element => element.remove());
  // The corner must scroll out of view instead of sticking to the viewport edge.
  await page.evaluate(() => document.body.style.minHeight = '1800px');
  // A fixed site header must cover the overlay just as it covers the video.
  await page.mouse.move(0, 0);
  await page.evaluate(() => {
    const header = document.createElement('header');
    header.id = 'sticky-header';
    header.style.cssText = 'position:fixed;inset:0 0 auto;height:80px;background:#111;z-index:2';
    document.body.append(header);
    window.scrollTo(0, 80);
  });
  await page.waitForFunction(() => {
    const rect = document.querySelector('[data-glace-controller]').getBoundingClientRect();
    return document.elementFromPoint(rect.x + 5, rect.y + 5)?.id === 'sticky-header';
  });
  assert.equal(await coveredBy(), 'sticky-header', 'a low-z-index header covers the locally stacked pill');
  assert.equal(await page.evaluate(() => document.elementFromPoint(60, 60).id), 'sticky-header', 'covered pill cannot intercept header clicks');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction(() => {
    const host = document.querySelector('[data-glace-controller]');
    const rect = host.getBoundingClientRect();
    return document.elementFromPoint(rect.x + 10, rect.y + 10) === host;
  });
  assert.equal(await pill.isVisible(), true, 'pill returns when its video corner is uncovered');
  await page.locator('#sticky-header').evaluate(element => element.remove());
  const beforeScroll = await host.boundingBox();
  await page.evaluate(() => window.scrollTo(0, 180));
  await page.waitForFunction(() => document.querySelector('[data-glace-controller]').getBoundingClientRect().y < 0);
  assert.ok(Math.abs((await host.boundingBox()).y - (beforeScroll.y - 180)) <= 1);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expand();
  const handle = page.locator('.move').first();
  const handleRect = await handle.boundingBox();
  const beforeDrag = await host.boundingBox();
  const rateBeforeDrag = await page.locator('#first').evaluate(video => video.playbackRate);
  await page.mouse.move(handleRect.x + handleRect.width / 2, handleRect.y + handleRect.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleRect.x + handleRect.width / 2 + 140, handleRect.y + handleRect.height / 2 + 90, { steps: 8 });
  await page.mouse.up();
  const afterDrag = await host.boundingBox();
  assert.ok(Math.abs(afterDrag.x - beforeDrag.x - 140) <= 1 && Math.abs(afterDrag.y - beforeDrag.y - 90) <= 1, 'drag moves the pill within the video');
  assert.equal(await page.locator('#first').evaluate(video => video.playbackRate), rateBeforeDrag, 'drag must not trigger a speed action');
  await page.mouse.move(0, 0);
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-glace-controller]').shadowRoot.querySelector('.pill')).opacity === '0.5');
  assert.equal(await page.locator('[aria-label="Increase video speed"]').first().isVisible(), false, 'click focus does not keep controls expanded');
  await page.keyboard.press('Tab');
  // Keyboard users can expand the compact pill without a mouse.
  await host.locator('.speed').focus();
  assert.equal(await page.locator('[aria-label="Increase video speed"]').first().isVisible(), true);
  await handle.focus();
  const beforeKey = await host.boundingBox();
  await page.keyboard.press('ArrowRight');
  const afterKey = await host.boundingBox();
  assert.ok(Math.abs(afterKey.x - beforeKey.x - 10) <= 1, JSON.stringify({ beforeKey, afterKey }));
  await page.keyboard.press('ArrowDown');
  await page.locator('#first').evaluate(video => video.style.width = '480px');
  await page.waitForFunction(() => {
    const rect = document.querySelector('#first').getBoundingClientRect();
    const host = document.querySelector('[data-glace-controller]').getBoundingClientRect();
    return host.left >= rect.left && host.right <= rect.right + 1 && host.top >= rect.top && host.bottom <= rect.bottom + 1;
  });
  await page.locator('#first').evaluate(video => video.style.width = '640px');
  await handle.dblclick();
  await page.mouse.move(0, 0);
  await page.evaluate(async () => {
    const { glaceSettings } = await chrome.storage.sync.get('glaceSettings');
    await chrome.storage.sync.set({ glaceSettings: { ...glaceSettings, position: 'top-right' } });
  });
  await page.waitForFunction(() => document.querySelector('[data-glace-controller]').hasAttribute('data-align-right'));
  const compactSpeed = await host.locator('.speed').boundingBox();
  await host.locator('.speed').hover();
  await page.waitForFunction(() => document.querySelector('[data-glace-controller]').offsetWidth > 100);
  const expandedSpeed = await host.locator('.speed').boundingBox();
  assert.ok(Math.abs(compactSpeed.x - expandedSpeed.x) <= 1, 'right-corner expansion keeps the speed under the pointer');
  await page.evaluate(async () => {
    const { glaceSettings } = await chrome.storage.sync.get('glaceSettings');
    await chrome.storage.sync.set({ glaceSettings: { ...glaceSettings, position: 'top-left' } });
  });


  await page.locator('#second').evaluate(video => video.remove());
  await page.waitForFunction(() => window.glaceHosts().length === 1);
  await page.evaluate(async () => {
    const { glaceSettings } = await chrome.storage.sync.get('glaceSettings');
    await chrome.storage.sync.set({ glaceSettings: { ...glaceSettings, showController: false } });
  });
  await page.locator('[aria-label="Restore Glace video controls"]').waitFor({ state: 'visible' });
  await page.locator('[aria-label="Restore Glace video controls"]').click();
  await expand();
  await page.locator('[aria-label="Increase video speed"]').waitFor({ state: 'visible' });
  await page.evaluate(() => {
    const host = document.createElement('section'); host.id = 'shadow-fixture';
    host.attachShadow({ mode: 'open' }).innerHTML = '<video id="shadow-video" style="display:block;width:420px;height:200px;background:#243a32"></video><input aria-label="Shadow comment">';
    document.querySelector('#feed').append(host);
  });
  await page.waitForFunction(() => window.glaceHosts().length === 2);
  await page.locator('#shadow-video').scrollIntoViewIfNeeded();
  const shadowBefore = await page.locator('#shadow-video').evaluate(video => video.playbackRate);
  await page.locator('[aria-label="Shadow comment"]').fill('d');
  assert.equal(await page.locator('#shadow-video').evaluate(video => video.playbackRate), shadowBefore);
  await page.locator('#shadow-video').evaluate(video => { video.disablePictureInPicture = true; video.dispatchEvent(new Event('resize')); });
  await page.locator('[aria-label="Shadow comment"]').blur();
  await page.locator('#shadow-video').hover();
  await page.keyboard.press('p');
  await page.waitForFunction(() => [...window.glaceHosts()].some(host => host.shadowRoot.querySelector('.notice').textContent.includes('unavailable')));
  await page.locator('#shadow-fixture').evaluate(element => element.remove());
  await page.waitForFunction(() => window.glaceHosts().length === 1);
  await page.locator('#first').scrollIntoViewIfNeeded();
  await page.locator('#feed').evaluate(element => element.requestFullscreen());
  await page.waitForFunction(() => document.fullscreenElement?.contains(document.querySelector('[data-glace-controller]')));
  const aligned = await page.evaluate(() => {
    const video = document.querySelector('#first').getBoundingClientRect();
    const host = document.querySelector('[data-glace-controller]').getBoundingClientRect();
    return Math.abs(host.x - video.x - 10) <= 1 && Math.abs(host.y - video.y - 10) <= 1;
  });
  assert.equal(aligned, true, 'fullscreen wrapper controller tracks video corner');
  await page.evaluate(() => document.exitFullscreen());
  await page.goto(`${base}/options.html`);
  await page.waitForFunction(() => document.querySelector('#app').textContent.length > 100);
  assert.ok(await page.locator('input').count(), 'settings must expose inputs');
  assert.equal(await page.getByRole('spinbutton', { name: 'Default speed', exact: true }).count(), 1);
  assert.equal(await page.locator('#resetSpeed').count(), 0);
  assert.equal(await page.locator('[data-action="default"]').count(), 0);
  assert.equal(await page.locator('#idleOpacity').inputValue(), '0.5');
  for (const [id, value] of [['idleOpacity', '0.35'], ['opacity', '0.9']]) {
    await page.locator(`#${id}`).fill(value);
    await page.locator(`#${id}`).dispatchEvent('change');
  }
  await page.waitForFunction(async () => {
    const { glaceSettings } = await chrome.storage.sync.get('glaceSettings');
    return glaceSettings?.idleOpacity === 0.35 && glaceSettings?.opacity === 0.9;
  });
  assert.equal(await page.locator('#idleOpacity-value').textContent(), '35%');
  await page.mouse.move(0, 0);
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#preview-controller')).opacity === '0.35');
  await page.locator('#preview-controller').hover();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#preview-controller')).opacity === '0.9');
  await page.locator('#defaultSpeed').fill('1.8');
  await page.locator('#defaultSpeed').blur();
  await page.waitForFunction(async () => (await chrome.storage.sync.get('glaceSettings')).glaceSettings?.defaultSpeed === 1.8);
  await page.locator('[data-action="increase"]').click();
  await page.keyboard.press('s');
  assert.match(await page.locator('#save-status').textContent(), /Already assigned/);
  await page.locator('[data-action="increase"]').click();
  await page.keyboard.press('Shift+h');
  await page.waitForFunction(async () => (await chrome.storage.sync.get('glaceSettings')).glaceSettings?.shortcuts.increase.code === 'KeyH');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: '/tmp/glace-options.png', fullPage: true });
  await page.goto(`${base}/popup.html`);
  await page.waitForFunction(() => document.querySelector('#app').textContent.length > 30);
  await page.setViewportSize({ width: 380, height: 650 });
  await page.screenshot({ path: '/tmp/glace-popup.png' });
  assert.deepEqual(errors, [], 'no unhandled browser exceptions');
  console.log('Browser integration passed: compact hover/focus state, 50% idle opacity, scroll anchoring, hover above transparent player layers and stacking below low-z-index headers, dragging, keyboard movement, resize bounds, speed buttons, shortcuts, editable exclusions including shadow DOM, preferred/default, hide/restore, dynamic feeds, settings propagation, cleanup, unavailable PiP, fullscreen wrapper alignment, options persistence and shortcut conflict handling.');
  const profile = await mkdtemp(join(tmpdir(), 'glace-extension-'));
  let extensionContext;
  try {
    const extension = resolve('dist');
    extensionContext = await chromium.launchPersistentContext(profile, {
      headless: true, executablePath,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    const installedPage = await extensionContext.newPage();
    installedPage.setDefaultTimeout(10000);
    await installedPage.goto(base);
    await installedPage.locator('[data-glace-controller]').waitFor();
    await installedPage.locator('.pill').hover();
    await installedPage.locator('[aria-label="Increase video speed"]').click();
    assert.equal(await installedPage.locator('#first').evaluate(video => video.playbackRate), 1.1);
    console.log('Actual Manifest V3 unpacked extension smoke passed: automatic content injection and speed button, with real chrome.storage.');
  } finally {
    await extensionContext?.close();
    await rm(profile, { recursive: true, force: true });
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
