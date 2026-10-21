import type { Settings } from '../shared/settings';

export function clampSpeed(value: number, settings: Pick<Settings, 'minSpeed' | 'maxSpeed'>): number {
  return Math.min(settings.maxSpeed, Math.max(settings.minSpeed, Math.round(value * 1_000_000) / 1_000_000));
}

export function formatSpeed(value: number): string {
  return `${Number(value.toFixed(2))}×`;
}

export function visibleArea(rect: Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom' | 'width' | 'height'>, width: number, height: number): number {
  if (rect.width < 40 || rect.height < 30) return 0;
  return Math.max(0, Math.min(rect.right, width) - Math.max(rect.left, 0))
    * Math.max(0, Math.min(rect.bottom, height) - Math.max(rect.top, 0));
}

export interface VideoCandidate<T> {
  value: T;
  area: number;
  playing: boolean;
  interaction: number;
  hovered: boolean;
  pip?: boolean;
}

/** A keyboard action always affects one visible video, even in a feed. */
export function selectVideo<T>(candidates: VideoCandidate<T>[]): T | undefined {
  const visible = candidates.filter((candidate) => candidate.area > 0);
  visible.sort((a, b) => Number(b.hovered) - Number(a.hovered)
    || Number(!!b.pip) - Number(!!a.pip)
    || b.interaction - a.interaction
    || Number(b.playing) - Number(a.playing)
    || b.area - a.area);
  return visible[0]?.value;
}

export function seekVideo(video: Pick<HTMLVideoElement, 'currentTime' | 'duration' | 'seekable'>, amount: number): void {
  // Seekable ranges also support live streams with a rolling DVR window.
  const ranges = video.seekable;
  const low = ranges.length ? ranges.start(0) : 0;
  const high = ranges.length ? ranges.end(ranges.length - 1) : video.duration;
  const target = video.currentTime + amount;
  video.currentTime = Math.max(low, Number.isFinite(high) ? Math.min(high, target) : target);
}
