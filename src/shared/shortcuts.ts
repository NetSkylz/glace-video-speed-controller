import type { Shortcut } from './settings';
export function matchesShortcut(event: Pick<KeyboardEvent, 'code' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>, shortcut: Shortcut): boolean {
  return Boolean(shortcut.code) && event.code === shortcut.code && event.altKey === shortcut.alt && event.ctrlKey === shortcut.ctrl && event.metaKey === shortcut.meta && event.shiftKey === shortcut.shift;
}
export function shortcutFromEvent(event: Pick<KeyboardEvent, 'code' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>): Shortcut {
  return { code: event.code, alt: event.altKey, ctrl: event.ctrlKey, meta: event.metaKey, shift: event.shiftKey };
}
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'));
}
export function formatShortcut(shortcut: Shortcut): string {
  if (!shortcut.code) return 'Unassigned';
  const names: Record<string, string> = { Equal: '+', Minus: '−', Space: 'Space', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Backquote: '`', BracketLeft: '[', BracketRight: ']', Escape: 'Esc' };
  const label = names[shortcut.code] ?? shortcut.code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ');
  return [shortcut.ctrl && 'Ctrl', shortcut.alt && 'Alt', shortcut.shift && 'Shift', shortcut.meta && '⌘', label].filter(Boolean).join(' + ');
}
