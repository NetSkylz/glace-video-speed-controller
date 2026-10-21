import test from 'node:test';
import assert from 'node:assert/strict';
import { getSettings, saveSettings, subscribeSettings, SETTINGS_KEY } from '../src/shared/storage';
import { DEFAULT_SETTINGS } from '../src/shared/settings';

test('storage merges updates and delivers only relevant changes with unsubscribe', async () => {
  let stored: Record<string, unknown> = {};
  const listeners = new Set<(changes: Record<string, { newValue: unknown }>, area: string) => void>();
  Object.assign(globalThis, { chrome: { storage: {
    sync: { get: async () => stored, set: async (next: Record<string, unknown>) => { stored = { ...stored, ...next }; for (const listener of listeners) listener({ [SETTINGS_KEY]: { newValue: next[SETTINGS_KEY] } }, 'sync'); } },
    onChanged: { addListener: (listener: typeof listeners extends Set<infer T> ? T : never) => listeners.add(listener), removeListener: (listener: typeof listeners extends Set<infer T> ? T : never) => listeners.delete(listener) },
  } } });
  assert.deepEqual(await getSettings(), DEFAULT_SETTINGS);
  let changes = 0;
  const unsubscribe = subscribeSettings(() => changes++);
  await saveSettings({ step: 0.25 });
  const result = await saveSettings({ defaultSpeed: 1.75 });
  assert.equal(result.step, 0.25);
  assert.equal(result.defaultSpeed, 1.75);
  assert.equal(changes, 2);
  unsubscribe();
  await saveSettings({ step: 0.5 });
  assert.equal(changes, 2);
});
