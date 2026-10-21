import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampSpeed, formatSpeed, seekVideo, selectVideo, visibleArea, type VideoCandidate } from '../src/content/video-utils';

test('shortcuts target only the hovered or recently interacted visible video in a feed', () => {
  const candidates: VideoCandidate<string>[] = [
    { value: 'playing', area: 5000, playing: true, interaction: 0, hovered: false },
    { value: 'recent', area: 1000, playing: false, interaction: 20, hovered: false },
    { value: 'hovered', area: 100, playing: false, interaction: 0, hovered: true },
    { value: 'offscreen', area: 0, playing: true, interaction: 100, hovered: true },
  ];
  assert.equal(selectVideo(candidates), 'hovered');
  assert.equal(selectVideo(candidates.filter(c => c.value !== 'hovered')), 'recent');
  assert.equal(selectVideo(candidates.filter(c => c.interaction === 0 && !c.hovered)), 'playing');
  assert.equal(selectVideo(candidates.filter(c => c.area === 0)), undefined);
});

test('visible playing video wins over larger paused video with no interaction', () => {
  assert.equal(selectVideo([
    { value: 'paused', area: 10000, playing: false, interaction: 0, hovered: false },
    { value: 'playing', area: 1000, playing: true, interaction: 0, hovered: false },
  ]), 'playing');
});

test('visible area handles partial scrolling and excludes tiny tracking videos', () => {
  assert.equal(visibleArea({ left: -50, top: -20, right: 150, bottom: 80, width: 200, height: 100 }, 100, 100), 8000);
  assert.equal(visibleArea({ left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 }, 100, 100), 0);
  assert.equal(visibleArea({ left: 110, top: 0, right: 310, bottom: 100, width: 200, height: 100 }, 100, 100), 0);
});

test('speed steps avoid floating point artifacts and respect custom bounds', () => {
  const settings = { minSpeed: 0.25, maxSpeed: 3 };
  assert.equal(clampSpeed(0.1, settings), 0.25);
  assert.equal(clampSpeed(4, settings), 3);
  assert.equal(clampSpeed(0.2 + 0.1, settings), 0.3);
  assert.equal(clampSpeed(0.0625, { minSpeed: 0.0625, maxSpeed: 0.0625 }), 0.0625);
  assert.equal(formatSpeed(1.5), '1.5×');
});

test('a picture-in-picture video remains a keyboard target when its page video is offscreen', () => {
  assert.equal(selectVideo([
    { value: 'page', area: 5000, playing: true, interaction: 10, hovered: false },
    { value: 'pip', area: 1, playing: true, interaction: 0, hovered: false, pip: true },
  ]), 'pip');
});

test('seeking respects VOD boundaries and live DVR windows', () => {
  const video = { currentTime: 95, duration: 100, seekable: { length: 0 } as TimeRanges };
  seekVideo(video, 10);
  assert.equal(video.currentTime, 100);
  seekVideo(video, -200);
  assert.equal(video.currentTime, 0);
  const live = { currentTime: 120, duration: Infinity, seekable: { length: 1, start: () => 100, end: () => 150 } as TimeRanges };
  seekVideo(live, -30);
  assert.equal(live.currentTime, 100);
  seekVideo(live, 100);
  assert.equal(live.currentTime, 150);
});
