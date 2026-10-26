import { normalizeSettings, type Settings } from './settings';
export const SETTINGS_KEY = 'glaceSettings';
export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.sync.get(SETTINGS_KEY);
  return normalizeSettings(stored[SETTINGS_KEY]);
}
export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next = normalizeSettings({ ...current, ...patch, shortcuts: { ...current.shortcuts, ...patch.shortcuts } });
  await chrome.storage.sync.set({ [SETTINGS_KEY]: next });
  return next;
}
export function subscribeSettings(callback: (settings: Settings) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'sync' && changes[SETTINGS_KEY]) callback(normalizeSettings(changes[SETTINGS_KEY].newValue));
  };
  try {
    const onChanged = globalThis.chrome?.storage?.onChanged;
    if (!onChanged) return () => {};
    onChanged.addListener(listener);
    return () => {
      // A tab can outlive its extension context after an update or reload.
      try { onChanged.removeListener(listener); } catch { /* Already disconnected. */ }
    };
  } catch {
    // Keep the controller usable with its current settings if storage is unavailable.
    return () => {};
  }
}
