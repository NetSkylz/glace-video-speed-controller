import test from 'node:test';
import assert from 'node:assert/strict';
import { getSettings, getStorageArea, saveSettings, subscribeSettings, SETTINGS_KEY } from '../src/shared/storage';
import { DEFAULT_SETTINGS } from '../src/shared/settings';

test('storage merges updates and delivers only relevant changes with unsubscribe', async () => {
  let stored: Record<string, unknown> = {};
  const listeners = new Set<(changes: Record<string, { newValue: unknown }>, area: string) => void>();
  Object.assign(globalThis, { chrome: { runtime: { id: 'glace-test' }, storage: {
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
    for (const chrome of [
      undefined,
      {},
      { runtime: { id: 'glace-test' }, storage: undefined },
      { runtime: { id: 'glace-test' }, storage: {} },
    ]) {
      Object.assign(globalThis, { chrome });
      assert.doesNotThrow(() => subscribeSettings(() => assert.fail('unexpected change'))());
    }
    Reflect.deleteProperty(globalThis, 'chrome');
    assert.doesNotThrow(() => subscribeSettings(() => {})());
    Object.assign(globalThis, { chrome: { runtime: { id: 'glace-test' }, storage: { onChanged: {
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
    let removeCalls = 0;
    Object.assign(globalThis, { chrome: { runtime: { id: 'glace-test' }, storage: { onChanged: {
      addListener: () => {},
      removeListener: () => { removeCalls++; },
    } } } });
    const unsubscribe = subscribeSettings(() => {});
    unsubscribe();
    assert.equal(removeCalls, 1);

    Object.assign(globalThis, { chrome: { runtime: {}, get storage() { throw new Error('stale storage binding touched'); } } });
    assert.doesNotThrow(unsubscribe);
    assert.equal(removeCalls, 1, 'stale unsubscribe must not call the cached Chrome listener');

    Object.assign(globalThis, { chrome: { runtime: { id: 'glace-test' }, storage: { onChanged: {
      addListener: () => {},
      removeListener: () => { throw new Error('Extension context invalidated.'); },
    } } } });
    const throwingUnsubscribe = subscribeSettings(() => {});
    assert.doesNotThrow(throwingUnsubscribe);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'chrome', descriptor);
    else Reflect.deleteProperty(globalThis, 'chrome');
  }
});

test('subscription catches errors thrown by Chrome API getters', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
  const unavailable = () => { throw new TypeError("Cannot read properties of undefined (reading 'onChanged')"); };
  const throwingStorage = Object.defineProperty({ runtime: { id: 'glace-test' } }, 'storage', { get: unavailable });
  try {
    for (const chrome of [
      throwingStorage,
      { runtime: { id: 'glace-test' }, storage: Object.defineProperty({}, 'onChanged', { get: unavailable }) },
    ]) {
      Object.assign(globalThis, { chrome });
      assert.doesNotThrow(() => subscribeSettings(() => assert.fail('unexpected change'))());
    }
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'chrome', descriptor);
    else Reflect.deleteProperty(globalThis, 'chrome');
  }
});

test('storage APIs are not touched when the extension runtime is unavailable', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
  let storageReads = 0;
  try {
    const unavailableRuntime = Object.defineProperty({}, 'id', { get: () => { throw new Error('runtime binding invalidated'); } });
    for (const runtime of [{}, unavailableRuntime]) {
      storageReads = 0;
      Object.defineProperty(globalThis, 'chrome', {
        configurable: true,
        value: {
          runtime,
          get storage() {
            storageReads++;
            throw new TypeError("Cannot read properties of undefined (reading 'onChanged')");
          },
        },
      });
      const unsubscribe = subscribeSettings(() => {});
      unsubscribe();
      await assert.rejects(getSettings(), /Chrome extension context is unavailable/);
      assert.throws(() => getStorageArea('local'), /Chrome extension context is unavailable/);
      await assert.rejects(saveSettings({ step: 0.3 }), /Chrome extension context is unavailable/);
      assert.equal(storageReads, 0, 'invalidated extension APIs must not be accessed');
    }
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'chrome', descriptor);
    else Reflect.deleteProperty(globalThis, 'chrome');
  }
});
