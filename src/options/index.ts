import './style.css';
import { DEFAULT_SETTINGS, type Settings, type Action } from '../shared/settings';
import { getSettings, saveSettings, subscribeSettings } from '../shared/storage';
import { formatShortcut, shortcutFromEvent } from '../shared/shortcuts';

const icons = {
  settings: '<circle cx="9" cy="9" r="3"/><path d="M9 1v2m0 12v2M1 9h2m12 0h2M3.3 3.3l1.4 1.4m8.6 8.6 1.4 1.4m0-11.4-1.4 1.4m-8.6 8.6-1.4 1.4"/>',
  speed: '<path d="M3 14a7 7 0 1 1 12 0M9 10l4-5"/><circle cx="9" cy="11" r="1"/>',
  keyboard: '<rect x="1" y="3" width="16" height="12" rx="2"/><path d="M4 6h.1M7 6h.1M10 6h.1M13 6h.1M4 9h.1M7 9h.1M10 9h.1M13 9h.1M5 12h8"/>',
  appearance: '<rect x="2" y="2" width="14" height="14" rx="3"/><path d="M2 7h14M7 7v9"/>',
};
const icon = (name: keyof typeof icons) => `<svg viewBox="0 0 18 18" aria-hidden="true">${icons[name]}</svg>`;
const shortcutNames: Record<Action, string> = {
  increase: 'Increase speed', decrease: 'Decrease speed', reset: 'Reset to default speed', preferred: 'Preferred speed',
  toggle: 'Show / hide controller', pip: 'Picture in picture', rewind: 'Skip backward', forward: 'Skip forward', playPause: 'Play / pause',
};
const app = document.querySelector<HTMLDivElement>('#app')!;
const numberField = (key: string, label: string, min: number, max: number, step: number | string, unit = '×') => `<span class="number-field"><input type="number" id="${key}" aria-label="${label}" min="${min}" max="${max}" step="${step}" required><span aria-hidden="true">${unit}</span></span>`;
const row = (label: string, description: string, control: string, id?: string) => `<div class="setting-row"><${id ? `label for="${id}"` : 'div'} class="setting-label">${label}<span class="setting-description">${description}</span></${id ? 'label' : 'div'}>${control}</div>`;
const toggle = (key: string, label: string) => `<span class="switch"><input type="checkbox" id="${key}" aria-label="${label}"></span>`;

app.innerHTML = `
<div class="settings-shell">
  <aside class="sidebar">
    <a class="brand" href="#" aria-label="Glace home"><span class="brand-symbol" aria-hidden="true">❄</span>glace</a>
    <nav aria-label="Settings navigation">
      <a class="nav-item active" href="#general">${icon('settings')} General</a>
      <a class="nav-item" href="#shortcuts">${icon('keyboard')} Shortcuts</a>
      <a class="nav-item" href="#appearance">${icon('appearance')} Appearance</a>
    </nav>
    <div class="sidebar-bottom">A little more control.<br>A little less friction.<br><span style="display:block;margin-top:15px">GLACE · VIDEO SPEED CONTROLLER</span></div>
  </aside>
  <main>
    <header class="page-header"><div><p class="eyebrow">Your pace. Your space.</p><h1>Make yourself comfortable.</h1><p class="subtitle">Small adjustments. A better way to watch.</p></div></header>
    <div class="preview" role="img" aria-label="Preview of the translucent Glace video controller over a soft landscape">
      <span class="preview-note">A clearer view</span><span class="preview-tag">LIVE APPEARANCE PREVIEW</span>
      <div class="speed-pill" id="preview-controller" aria-hidden="true"><span class="preview-control">−</span><strong id="preview-speed">1.50×</strong><span class="preview-control">+</span><span class="preview-divider"></span><span class="preview-control"><svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="10" rx="2"/><rect x="8" y="8" width="5" height="4" rx=".5"/></svg></span><span class="preview-control"><svg viewBox="0 0 16 16"><path d="m5 5 6 6m0-6-6 6"/></svg></span></div>
      <div class="preview-caption">Settle into your own rhythm.<small>Your controller, quietly at home on any video.</small></div>
    </div>
    <form id="settings-form">
      <div class="section-title" id="general">${icon('speed')}<h2>Playback</h2></div>
      <div class="card">
        ${row('Enable Glace', 'Your controls, on every supported video.', toggle('enabled', 'Enable Glace'), 'enabled')}
        ${row('Default speed', 'New videos start here unless a remembered speed takes priority. Reset returns to this speed.', numberField('defaultSpeed', 'Default speed', .0625, 16, 'any'), 'defaultSpeed')}
        ${row('Preferred speed', 'Your go-to pace, one shortcut away.', numberField('preferredSpeed', 'Preferred speed', .0625, 16, 'any'), 'preferredSpeed')}
        ${row('Speed increment', 'How much each adjustment changes the speed.', numberField('step', 'Speed increment', .01, 4, 'any'), 'step')}
        ${row('Speed limits', 'Keep your playback in a comfortable range.', `<div class="range-pair">${numberField('minSpeed', 'Minimum speed', .0625, 16, 'any')}<span class="range-separator">to</span>${numberField('maxSpeed', 'Maximum speed', .0625, 16, 'any')}</div>`)}
        ${row('Skip interval', 'Jump backward or forward by this amount.', numberField('seekSeconds', 'Skip interval in seconds', 1, 600, 'any', 'sec'), 'seekSeconds')}
        ${row('Remember my speed', 'Pick up at the speed you last used.', toggle('rememberSpeed', 'Remember my speed'), 'rememberSpeed')}
      </div>
      <div class="section-title" id="appearance">${icon('appearance')}<h2>On-screen controller</h2></div>
      <div class="card">
        ${row('Show controller', 'A small, floating control over your videos.', toggle('showController', 'Show controller'), 'showController')}
        ${row('Position', 'Choose a corner that stays out of your way.', `<select id="position"><option value="top-left">Top left</option><option value="top-right">Top right</option><option value="bottom-left">Bottom left</option><option value="bottom-right">Bottom right</option></select>`, 'position')}
        ${row('Opacity when not hovered', 'How visible the controller is while at rest.', '<div class="range-control"><input id="idleOpacity" type="range" min="0.2" max="1" step="0.01"><output for="idleOpacity" id="idleOpacity-value">50%</output></div>', 'idleOpacity')}
        ${row('Opacity when hovered', 'Also applies while using the keyboard or dragging.', '<div class="range-control"><input id="opacity" type="range" min="0.2" max="1" step="0.01"><output for="opacity" id="opacity-value">86%</output></div>', 'opacity')}
      </div>
      <div class="section-title" id="shortcuts">${icon('keyboard')}<h2>Keyboard shortcuts</h2></div>
      <p class="shortcut-hint">Click a key to record a shortcut. Add Shift, Ctrl, Alt or ⌘ as needed.<br>Press Escape to cancel, or × to unassign. Shortcuts pause while you type.</p>
      <div class="card">${Object.entries(shortcutNames).map(([action, label]) => row(label, action === 'reset' ? 'Apply your default speed.' : action === 'preferred' ? 'Apply your preferred speed.' : '', `<div class="shortcut-control"><button class="shortcut-record" type="button" data-action="${action}" aria-label="Record shortcut for ${label}">—</button><button class="clear-shortcut" type="button" data-clear="${action}" aria-label="Clear shortcut for ${label}">×</button></div>`)).join('')}</div>
      <div class="footer"><button class="reset-button" type="button" id="reset">↺ &nbsp; Restore defaults</button><span class="save-status" role="status" aria-live="polite" id="save-status">Loading settings…</span></div>
    </form>
    <div class="footer-meta">MADE FOR A MORE THOUGHTFUL WATCHING EXPERIENCE.</div>
  </main>
</div>`;

const form = document.querySelector<HTMLFormElement>('#settings-form')!;
const status = document.querySelector<HTMLSpanElement>('#save-status')!;
let settings: Settings;
let recording: Action | null = null;
let pending = 0;
let saveQueue: Promise<unknown> = Promise.resolve();
const numericKeys = ['defaultSpeed', 'preferredSpeed', 'step', 'minSpeed', 'maxSpeed', 'seekSeconds'] as const;
const booleanKeys = ['enabled', 'rememberSpeed', 'showController'] as const;
function feedback(message: string, error = false) { status.textContent = message; status.classList.toggle('error', error); }
function updatePreview() {
  const position = (document.querySelector<HTMLSelectElement>('#position')!).value;
  const pill = document.querySelector<HTMLDivElement>('#preview-controller')!;
  pill.style.left = position.endsWith('left') ? '24px' : 'auto';
  pill.style.right = position.endsWith('right') ? '24px' : 'auto';
  pill.style.top = position.startsWith('top') ? '52px' : 'auto';
  pill.style.bottom = position.startsWith('bottom') ? '58px' : 'auto';
  const opacity = (document.querySelector<HTMLInputElement>('#opacity')!).value;
  pill.style.setProperty('--preview-opacity', opacity);
  const idleOpacity = document.querySelector<HTMLInputElement>('#idleOpacity')!.value;
  pill.style.setProperty('--preview-idle-opacity', idleOpacity);
  document.querySelector('#idleOpacity-value')!.textContent = `${Math.round(Number(idleOpacity) * 100)}%`;
  pill.style.visibility = (document.querySelector<HTMLInputElement>('#showController')!).checked ? 'visible' : 'hidden';
  const speed = Number((document.querySelector<HTMLInputElement>('#preferredSpeed')!).value);
  document.querySelector('#preview-speed')!.textContent = `${(Number.isFinite(speed) ? speed : 1.5).toFixed(2)}×`;
  document.querySelector('#opacity-value')!.textContent = `${Math.round(Number(opacity) * 100)}%`;
}
function render(value: Settings) {
  settings = value;
  numericKeys.forEach(key => { document.querySelector<HTMLInputElement>(`#${key}`)!.value = String(value[key]); });
  booleanKeys.forEach(key => { document.querySelector<HTMLInputElement>(`#${key}`)!.checked = value[key]; });
  document.querySelector<HTMLSelectElement>('#position')!.value = value.position;
  document.querySelector<HTMLInputElement>('#opacity')!.value = String(value.opacity);
  document.querySelector<HTMLInputElement>('#idleOpacity')!.value = String(value.idleOpacity);
  document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button => { button.textContent = value.shortcuts[button.dataset.action as Action].code ? formatShortcut(value.shortcuts[button.dataset.action as Action]) : 'Unassigned'; });
  updatePreview();
}
function readForm(): Partial<Settings> | null {
  numericKeys.forEach(key => document.querySelector<HTMLInputElement>(`#${key}`)!.setCustomValidity(''));
  const values = Object.fromEntries(numericKeys.map(key => [key, Number(document.querySelector<HTMLInputElement>(`#${key}`)!.value)])) as Pick<Settings, typeof numericKeys[number]>;
  if (values.minSpeed > values.maxSpeed) document.querySelector<HTMLInputElement>('#minSpeed')!.setCustomValidity('Minimum speed must be no greater than maximum speed.');
  for (const key of ['defaultSpeed', 'preferredSpeed'] as const) {
    if (values[key] < values.minSpeed || values[key] > values.maxSpeed) document.querySelector<HTMLInputElement>(`#${key}`)!.setCustomValidity('Choose a speed within your minimum and maximum limits.');
  }
  if (!form.reportValidity()) { feedback('Check your speed values before saving.', true); return null; }
  return { ...values, ...Object.fromEntries(booleanKeys.map(key => [key, document.querySelector<HTMLInputElement>(`#${key}`)!.checked])), position: document.querySelector<HTMLSelectElement>('#position')!.value as Settings['position'], opacity: Number(document.querySelector<HTMLInputElement>('#opacity')!.value), idleOpacity: Number(document.querySelector<HTMLInputElement>('#idleOpacity')!.value) };
}
function persist(patch: Partial<Settings>): Promise<Settings | null> {
  pending++;
  settings = { ...settings, ...patch };
  const snapshot = structuredClone(settings);
  feedback('Saving…');
  const operation = saveQueue.then(async () => {
    try { const saved = await saveSettings(snapshot); if (pending === 1) feedback('✓  All changes saved'); return saved; }
    catch { feedback('Couldn’t save. Please try again.', true); return null; }
    finally { pending--; }
  });
  saveQueue = operation;
  return operation;
}
form.addEventListener('submit', event => event.preventDefault());
form.addEventListener('input', () => { updatePreview(); numericKeys.forEach(key => document.querySelector<HTMLInputElement>(`#${key}`)!.setCustomValidity('')); });
form.addEventListener('change', () => { const patch = readForm(); if (patch) void persist(patch); });
function stopRecording() { recording = null; document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button => { button.classList.remove('recording'); button.textContent = settings.shortcuts[button.dataset.action as Action].code ? formatShortcut(settings.shortcuts[button.dataset.action as Action]) : 'Unassigned'; }); }
document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button => button.addEventListener('click', () => {
  if (!settings) return;
  stopRecording(); recording = button.dataset.action as Action; button.classList.add('recording'); button.textContent = 'Press a key…';
}));
document.addEventListener('keydown', event => {
  if (!recording || event.repeat) return;
  event.preventDefault(); event.stopPropagation();
  if (event.code === 'Escape') { stopRecording(); return; }
  if (['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(event.code)) return;
  const shortcut = shortcutFromEvent(event);
  const duplicate = Object.entries(settings.shortcuts).find(([action, candidate]) => action !== recording && candidate.code === shortcut.code && candidate.alt === shortcut.alt && candidate.ctrl === shortcut.ctrl && candidate.meta === shortcut.meta && candidate.shift === shortcut.shift);
  if (duplicate) { feedback(`Already assigned to ${shortcutNames[duplicate[0] as Action].toLowerCase()}.`, true); stopRecording(); return; }
  const shortcuts = { ...settings.shortcuts, [recording]: shortcut };
  settings = { ...settings, shortcuts }; stopRecording(); void persist({ shortcuts });
}, true);
document.querySelectorAll<HTMLButtonElement>('[data-clear]').forEach(button => button.addEventListener('click', () => {
  if (!settings) return;
  const shortcuts = { ...settings.shortcuts, [button.dataset.clear as Action]: { code: '', alt: false, ctrl: false, meta: false, shift: false } };
  settings = { ...settings, shortcuts }; stopRecording(); void persist({ shortcuts });
}));
document.querySelector('#reset')!.addEventListener('click', async () => {
  if (pending) return;
  const saved = await persist({ ...DEFAULT_SETTINGS, shortcuts: structuredClone(DEFAULT_SETTINGS.shortcuts) });
  if (saved) render(saved);
});
document.querySelectorAll<HTMLAnchorElement>('.nav-item').forEach(link => link.addEventListener('click', () => { document.querySelector('.nav-item.active')?.classList.remove('active'); link.classList.add('active'); }));
form.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input,button,select').forEach(control => { control.disabled = true; });
getSettings().then(value => {
  render(value); feedback('✓  All changes saved');
  form.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input,button,select').forEach(control => { control.disabled = false; });
  subscribeSettings(value => { if (!pending && !recording && !form.contains(document.activeElement)) render(value); });
}).catch(() => { feedback('Couldn’t load settings. Reopen this page to try again.', true); });
