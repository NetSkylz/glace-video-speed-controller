import './style.css';
import { getSettings, saveSettings, subscribeSettings } from '../shared/storage';
import { formatShortcut } from '../shared/shortcuts';
import type { Settings, Action } from '../shared/settings';

const shortcuts: [Action, string][] = [['increase','Speed up'], ['decrease','Slow down'], ['reset','Default speed'], ['preferred','Preferred speed']];
document.querySelector('#app')!.innerHTML = `<div class="popup">
  <header class="popup-header"><div class="brand"><span class="brand-symbol" aria-hidden="true">❄</span>glace</div><span class="switch"><input id="enabled" type="checkbox" aria-label="Enable Glace" disabled></span></header>
  <p class="tagline">A little more control.</p><h1>Find your own pace.</h1>
  <div class="status-card" id="status-card"><span class="status-dot" aria-hidden="true"></span><span id="state">Loading settings…</span></div>
  <div class="shortcuts">${shortcuts.map(([action, label]) => `<div class="shortcut"><span>${label}</span><kbd data-action="${action}">—</kbd></div>`).join('')}</div>
  <button class="settings-button" id="settings" type="button"><svg viewBox="0 0 18 18" aria-hidden="true"><path d="M3 4h12M3 9h12M3 14h12M6 2v4m6 1v4m-5 1v4"/></svg>Personalize Glace<svg viewBox="0 0 18 18" aria-hidden="true"><path d="m7 4 5 5-5 5"/></svg></button>
  <div class="feedback" role="status" id="feedback">Your videos. Your rhythm.</div>
</div>`;
const enabled = document.querySelector<HTMLInputElement>('#enabled')!;
const feedback = document.querySelector('#feedback')!;
function render(settings: Settings) {
  enabled.checked = settings.enabled;
  document.querySelector('#state')!.textContent = settings.enabled ? 'Ready when your video is.' : 'Taking a little pause.';
  document.querySelector('#status-card')!.classList.toggle('paused', !settings.enabled);
  document.querySelectorAll<HTMLElement>('[data-action]').forEach(element => {
    const shortcut = settings.shortcuts[element.dataset.action as Action];
    element.textContent = shortcut.code ? formatShortcut(shortcut) : '—';
  });
}
getSettings().then(settings => { render(settings); enabled.disabled = false; subscribeSettings(render); }).catch(() => {
  document.querySelector('#state')!.textContent = 'Settings unavailable';
  feedback.textContent = 'Reopen Glace to try again.'; feedback.classList.add('error');
});
enabled.addEventListener('change', async () => {
  enabled.disabled = true;
  try { render(await saveSettings({ enabled: enabled.checked })); feedback.textContent = 'Your videos. Your rhythm.'; feedback.classList.remove('error'); }
  catch { enabled.checked = !enabled.checked; feedback.textContent = 'Couldn’t save. Please try again.'; feedback.classList.add('error'); }
  finally { enabled.disabled = false; }
});
document.querySelector('#settings')!.addEventListener('click', () => { chrome.runtime.openOptionsPage().catch(() => { feedback.textContent = 'Couldn’t open settings. Please try again.'; feedback.classList.add('error'); }); });
