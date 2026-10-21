import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/shared/settings';
import { matchesShortcut, formatShortcut, shortcutFromEvent } from '../src/shared/shortcuts';

test('missing or corrupt storage restores usable defaults without sharing mutable shortcuts', () => {
  assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
  const settings = normalizeSettings({ step: 'bad', defaultSpeed: Infinity, position: 'center', shortcuts: { increase: null } });
  assert.deepEqual(settings, DEFAULT_SETTINGS);
  settings.shortcuts.increase.code = 'KeyA';
  assert.equal(DEFAULT_SETTINGS.shortcuts.increase.code, 'KeyD');
});
test('numeric settings are finite, bounded, and speeds respect min/max', () => {
  const settings = normalizeSettings({ minSpeed: 2, maxSpeed: -1, defaultSpeed: 100, preferredSpeed: -1, opacity: -1, step: 0, seekSeconds: 99999 });
  assert.equal(settings.minSpeed, 2);
  assert.equal(settings.maxSpeed, 2);
  assert.equal(settings.defaultSpeed, 2);
  assert.equal(settings.preferredSpeed, 2);
  assert.equal(settings.opacity, 0.2);
  assert.equal(settings.step, 0.01);
  assert.equal(settings.seekSeconds, 600);
  const partial = normalizeSettings({ minSpeed: 3, maxSpeed: 4 });
  assert.equal(partial.defaultSpeed, 3);
  assert.equal(partial.preferredSpeed, 3);
});
test('legacy reset speed is discarded in favor of the shared default speed', () => {
  const settings = normalizeSettings({ defaultSpeed: 1.75, resetSpeed: 1.25 });
  assert.equal(settings.defaultSpeed, 1.75);
  assert.equal('resetSpeed' in settings, false);
});
test('idle opacity defaults for existing settings and normalizes independently of hover opacity', () => {
  assert.equal(normalizeSettings({ opacity: 0.75 }).idleOpacity, 0.5);
  assert.equal(normalizeSettings({ idleOpacity: 0.35, opacity: 0.9 }).idleOpacity, 0.35);
  assert.equal(normalizeSettings({ idleOpacity: -1 }).idleOpacity, 0.2);
  assert.equal(normalizeSettings({ idleOpacity: 2 }).idleOpacity, 1);
  assert.equal(normalizeSettings({ idleOpacity: NaN }).idleOpacity, 0.5);
});
test('shortcut matching requires exact modifiers and supports unassigned shortcuts', () => {
  const event = { code: 'KeyA', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false };
  const shortcut = shortcutFromEvent(event);
  assert.equal(matchesShortcut(event, shortcut), true);
  assert.equal(matchesShortcut({ ...event, shiftKey: true }, shortcut), false);
  assert.equal(matchesShortcut({ ...event, code: '' }, { ...shortcut, code: '' }), false);
  assert.equal(formatShortcut(shortcut), 'Alt + A');
  assert.equal(formatShortcut({ ...shortcut, code: '' }), 'Unassigned');
  assert.equal(normalizeSettings({ shortcuts: { increase: { code: '' } } }).shortcuts.increase.code, '');
});
