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

test('subscriptions tolerate missing extension storage and invalidated contexts', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
  try {
    for (const chrome of [undefined, {}, { storage: {} }]) {
      Object.assign(globalThis, { chrome });
      assert.doesNotThrow(() => subscribeSettings(() => assert.fail('unexpected change'))());
    }
    Reflect.deleteProperty(globalThis, 'chrome');
    assert.doesNotThrow(() => subscribeSettings(() => {})());
    Object.assign(globalThis, { chrome: { storage: { onChanged: {
      addListener: () => { throw new Error('Extension context invalidated.'); },
    } } } });
    assert.doesNotThrow(() => subscribeSettings(() => {})());
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'chrome', descriptor);
    else Reflect.deleteProperty(globalThis, 'chrome');
  }
});

test('unsubscribe survives storage disappearing or listener removal throwing', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
  try {
    for (const invalidated of [false, true]) {
      let removed = false;
      Object.assign(globalThis, { chrome: { storage: { onChanged: {
        addListener: () => {},
        removeListener: () => {
          if (invalidated) throw new Error('Extension context invalidated.');
          removed = true;
        },
      } } } });
      const unsubscribe = subscribeSettings(() => {});
      Object.assign(globalThis, { chrome: {} });
      assert.doesNotThrow(unsubscribe);
      assert.equal(removed, !invalidated);
    }
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'chrome', descriptor);
    else Reflect.deleteProperty(globalThis, 'chrome');
  }
});

test('subscription catches errors thrown by Chrome API getters', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
  const unavailable = () => { throw new TypeError("Cannot read properties of undefined (reading 'onChanged')"); };
  try {
    for (const chrome of [
      Object.defineProperty({}, 'storage', { get: unavailable }),
      { storage: Object.defineProperty({}, 'onChanged', { get: unavailable }) },
    ]) {
      Object.assign(globalThis, { chrome });
      assert.doesNotThrow(() => subscribeSettings(() => assert.fail('unexpected change'))());
    }
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'chrome', descriptor);
    else Reflect.deleteProperty(globalThis, 'chrome');
  }
});
