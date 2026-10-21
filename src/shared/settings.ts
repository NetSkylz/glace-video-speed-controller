export const ACTIONS = ['increase', 'decrease', 'reset', 'preferred', 'toggle', 'pip', 'rewind', 'forward', 'playPause'] as const;
export type Action = typeof ACTIONS[number];
export interface Shortcut { code: string; alt: boolean; ctrl: boolean; meta: boolean; shift: boolean }
export type Position = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export interface Settings {
  enabled: boolean;
  defaultSpeed: number;
  preferredSpeed: number;
  step: number;
  minSpeed: number;
  maxSpeed: number;
  seekSeconds: number;
  rememberSpeed: boolean;
  showController: boolean;
  opacity: number;
  idleOpacity: number;
  position: Position;
  shortcuts: Record<Action, Shortcut>;
}
const key = (code: string): Shortcut => ({ code, alt: false, ctrl: false, meta: false, shift: false });
export const DEFAULT_SETTINGS: Settings = {
  enabled: true, defaultSpeed: 1, preferredSpeed: 1.5, step: 0.1,
  minSpeed: 0.1, maxSpeed: 16, seekSeconds: 10, rememberSpeed: true,
  showController: true, opacity: 0.86, idleOpacity: 0.5, position: 'top-left',
  shortcuts: { increase: key('KeyD'), decrease: key('KeyS'), reset: key('KeyR'), preferred: key('KeyG'), toggle: key('KeyV'), pip: key('KeyP'), rewind: key('KeyZ'), forward: key('KeyX'), playPause: key('KeyK') },
};
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const number = (value: unknown, fallback: number, min: number, max: number) => Math.min(max, Math.max(min, typeof value === 'number' && Number.isFinite(value) ? value : fallback));
export function normalizeSettings(value: unknown): Settings {
  const input = object(value);
  const minSpeed = number(input.minSpeed, DEFAULT_SETTINGS.minSpeed, 0.0625, 16);
  const maxSpeed = number(input.maxSpeed, DEFAULT_SETTINGS.maxSpeed, minSpeed, 16);
  const shortcuts = {} as Record<Action, Shortcut>;
  const supplied = object(input.shortcuts);
  for (const action of ACTIONS) {
    const candidate = object(supplied[action]);
    const fallback = DEFAULT_SETTINGS.shortcuts[action];
    shortcuts[action] = {
      code: typeof candidate.code === 'string' && candidate.code.length <= 64 ? candidate.code : fallback.code,
      alt: typeof candidate.alt === 'boolean' ? candidate.alt : fallback.alt,
      ctrl: typeof candidate.ctrl === 'boolean' ? candidate.ctrl : fallback.ctrl,
      meta: typeof candidate.meta === 'boolean' ? candidate.meta : fallback.meta,
      shift: typeof candidate.shift === 'boolean' ? candidate.shift : fallback.shift,
    };
  }
  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : DEFAULT_SETTINGS.enabled,
    defaultSpeed: number(input.defaultSpeed, DEFAULT_SETTINGS.defaultSpeed, minSpeed, maxSpeed),
    preferredSpeed: number(input.preferredSpeed, DEFAULT_SETTINGS.preferredSpeed, minSpeed, maxSpeed),
    step: number(input.step, DEFAULT_SETTINGS.step, 0.01, 4), minSpeed, maxSpeed,
    seekSeconds: number(input.seekSeconds, DEFAULT_SETTINGS.seekSeconds, 1, 600),
    rememberSpeed: typeof input.rememberSpeed === 'boolean' ? input.rememberSpeed : DEFAULT_SETTINGS.rememberSpeed,
    showController: typeof input.showController === 'boolean' ? input.showController : DEFAULT_SETTINGS.showController,
    opacity: number(input.opacity, DEFAULT_SETTINGS.opacity, 0.2, 1),
    idleOpacity: number(input.idleOpacity, DEFAULT_SETTINGS.idleOpacity, 0.2, 1),
    position: ['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(input.position as string) ? input.position as Position : DEFAULT_SETTINGS.position,
    shortcuts,
  };
}
