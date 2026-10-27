import { setGlassEffect } from '../shared/glass';
import { DEFAULT_SETTINGS, type Action, type Settings } from '../shared/settings';
import { getSettings, getStorageArea, subscribeSettings } from '../shared/storage';
import { isEditableTarget, matchesShortcut } from '../shared/shortcuts';
import { controllerCSS } from './controller.css';
import { clampSpeed, formatSpeed, seekVideo, selectVideo, visibleArea } from './video-utils';

interface VideoState {
  video: HTMLVideoElement;
  host: HTMLDivElement;
  wrapper: HTMLDivElement;
  speed: HTMLButtonElement;
  pip: HTMLButtonElement;
  notice: HTMLDivElement;
  hidden: boolean;
  interaction: number;
  cleanup: () => void;
  noticeTimer?: ReturnType<typeof setTimeout>;
  position?: { x: number; y: number };
}

const icons = {
  decrease: '<path d="M4 8h8"/>',
  increase: '<path d="M4 8h8M8 4v8"/>',
  pip: '<rect x="2" y="3" width="12" height="10" rx="2"/><rect x="8" y="8" width="5" height="4" rx=".5"/>',
  hide: '<path d="m5 5 6 6m0-6-6 6"/>',
  restore: '<path d="m5 3 7 5-7 5Z"/>',
  move: '<path d="M5 4h.01M11 4h.01M5 8h.01M11 8h.01M5 12h.01M11 12h.01"/>',
};

class Glace {
  private settings: Settings = DEFAULT_SETTINGS;
  private videos = new Map<HTMLVideoElement, VideoState>();
  private observers = new Map<Document | ShadowRoot, MutationObserver>();
  private hovered?: HTMLVideoElement;
  private pointerCheck = 0;
  private lastSpeed?: number;
  private frame = 0;
  private disposed = false;
  private resizing = new ResizeObserver(() => this.scheduleLayout());
  private unsubscribe?: () => void;
  private lifetime = new AbortController();
  private rememberTimer?: ReturnType<typeof setTimeout>;

  async start(): Promise<void> {
    try {
      const settings = await getSettings();
      if (this.disposed) return;
      this.settings = settings;
      const remembered = await getStorageArea('local').get('glaceRememberedSpeed');
      if (this.disposed) return;
      const speed: unknown = remembered.glaceRememberedSpeed;
      if (typeof speed === 'number' && Number.isFinite(speed)) this.lastSpeed = speed;
    } catch { /* Defaults keep the controller usable if extension storage is unavailable. */ }
    if (this.disposed) return;
    this.unsubscribe = subscribeSettings((settings) => {
      const previous = this.settings;
      this.settings = settings;
      for (const state of this.videos.values()) {
        if (settings.showController !== previous.showController) state.hidden = !settings.showController;
        if (settings.position !== previous.position) state.position = undefined;
        if (settings.enabled && (!previous.enabled || settings.defaultSpeed !== previous.defaultSpeed)) {
          this.setSpeed(state, settings.defaultSpeed, false);
        } else if (settings.enabled && (settings.minSpeed !== previous.minSpeed || settings.maxSpeed !== previous.maxSpeed)) {
          this.setSpeed(state, state.video.playbackRate, false);
        }
        this.refresh(state);
      }
      this.scheduleLayout();
    });
    const signal = this.lifetime.signal;
    document.addEventListener('pointerover', this.onPointerOver, { capture: true, signal });
    document.addEventListener('pointermove', this.onPointerMove, { capture: true, passive: true, signal });
    document.addEventListener('pointerout', this.onPointerOut, { capture: true, signal });
    document.addEventListener('pointerdown', this.onPointerDown, { capture: true, signal });
    document.addEventListener('keydown', this.onKeyDown, { capture: true, signal });
    document.addEventListener('scroll', this.scheduleLayout, { capture: true, passive: true, signal });
    document.addEventListener('fullscreenchange', this.scheduleLayout, { signal });
    window.addEventListener('resize', this.scheduleLayout, { passive: true, signal });
    window.visualViewport?.addEventListener('resize', this.scheduleLayout, { passive: true, signal });
    window.visualViewport?.addEventListener('scroll', this.scheduleLayout, { passive: true, signal });
    window.addEventListener('load', () => { this.discover(document); this.scheduleLayout(); }, { once: true, signal });
    window.addEventListener('pagehide', (event) => { if (!event.persisted) this.dispose(); }, { signal });
    // BFCache freezes observers and restores the existing instance with the document.
    window.addEventListener('pageshow', this.scheduleLayout, { signal });
    this.discover(document);
  }

  private discover(root: Document | ShadowRoot | Element): void {
    if (this.disposed) return;
    if (root instanceof Document || root instanceof ShadowRoot) this.observe(root);
    const visit = (element: Element) => {
      if (element instanceof HTMLVideoElement) this.add(element);
      if (element.shadowRoot && !element.hasAttribute('data-glace-controller')) this.discover(element.shadowRoot);
    };
    if (root instanceof Element) visit(root);
    // One traversal per added subtree; no polling or animation-frame DOM scans.
    root.querySelectorAll('*').forEach(visit);
  }

  private observe(root: Document | ShadowRoot): void {
    if (this.observers.has(root)) return;
    const observer = new MutationObserver((records) => {
      const additions = new Set<Element>();
      let removed = false;
      let changed = false;
      for (const record of records) {
        if (record.type === 'attributes') {
          if (!(record.target instanceof Element && record.target.hasAttribute('data-glace-controller'))) changed = true;
          continue;
        }
        for (const node of record.addedNodes) {
          if (node instanceof Element && !node.hasAttribute('data-glace-controller')) additions.add(node);
        }
        if (record.removedNodes.length) removed = true;
      }
      // Avoid traversing both a parent and its child from the same mutation batch.
      for (const element of additions) {
        if (!element.isConnected) continue;
        let parent = element.parentElement;
        while (parent && !additions.has(parent)) parent = parent.parentElement;
        if (!parent) this.discover(element);
      }
      if (removed) this.removeDisconnected();
      if (additions.size || removed || changed) this.scheduleLayout();
    });
    // Track player visibility and page layout changes without observing our own
    // position attributes or traversing the document again.
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    this.observers.set(root, observer);
  }

  private add(video: HTMLVideoElement): void {
    if (this.videos.has(video)) return;
    const host = document.createElement('div');
    host.setAttribute('data-glace-controller', '');
    host.setAttribute('data-offscreen', '');
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = controllerCSS;
    const wrapper = document.createElement('div');
    const pill = document.createElement('div');
    pill.className = 'pill';
    pill.setAttribute('role', 'group');
    pill.setAttribute('aria-label', 'Glace video speed controls');
    const button = (label: string, icon?: keyof typeof icons) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.title = label;
      element.setAttribute('aria-label', label);
      if (icon) element.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true">${icons[icon]}</svg>`;
      return element;
    };
    const decrease = button('Decrease video speed', 'decrease');
    const speed = button('Reset video speed');
    speed.className = 'speed';
    const increase = button('Increase video speed', 'increase');
    const divider = document.createElement('span');
    divider.className = 'divider';
    divider.setAttribute('aria-hidden', 'true');
    const pip = button('Open picture-in-picture', 'pip');
    const hide = button('Hide video controls', 'hide');
    const move = button('Move video controls. Drag or use arrow keys; double-click to reset position.', 'move');
    move.className = 'move';
    const restore = button('Restore Glace video controls', 'restore');
    restore.className = 'restore';
    const notice = document.createElement('div');
    notice.className = 'notice';
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
    pill.append(speed, decrease, increase, divider, pip, move, hide);
    wrapper.append(pill, restore, notice);
    shadow.append(style, wrapper);
    const controller = new AbortController();
    const signal = controller.signal;
    const state: VideoState = { video, host, wrapper, speed, pip, notice, hidden: !this.settings.showController, interaction: 0, cleanup: () => controller.abort() };
    this.videos.set(video, state);
    let drag: { id: number; x: number; y: number; left: number; top: number } | undefined;
    move.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = host.getBoundingClientRect();
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
      move.setPointerCapture(event.pointerId);
      wrapper.classList.add('dragging');
      this.interact(state);
    }, { signal });
    move.addEventListener('pointermove', (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const rect = video.getBoundingClientRect();
      state.position = {
        x: Math.max(0, Math.min(Math.max(0, rect.width - host.offsetWidth), drag.left + event.clientX - drag.x - rect.left)) / rect.width,
        y: Math.max(0, Math.min(Math.max(0, rect.height - host.offsetHeight), drag.top + event.clientY - drag.y - rect.top)) / rect.height,
      };
      this.layout(state);
    }, { signal });
    const stopDrag = () => {
      drag = undefined;
      wrapper.classList.remove('dragging');
      this.scheduleLayout();
    };
    move.addEventListener('pointerup', stopDrag, { signal });
    move.addEventListener('pointercancel', stopDrag, { signal });
    move.addEventListener('lostpointercapture', stopDrag, { signal });
    move.addEventListener('dblclick', (event) => {
      event.stopPropagation();
      state.position = undefined;
      this.scheduleLayout();
    }, { signal });
    move.addEventListener('keydown', (event) => {
      const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const direction = directions[event.key];
      if (!direction) return;
      event.preventDefault();
      const rect = video.getBoundingClientRect();
      const current = host.getBoundingClientRect();
      const step = event.shiftKey ? 20 : 10;
      state.position = {
        x: Math.max(0, Math.min(Math.max(0, rect.width - host.offsetWidth), current.left - rect.left + direction[0] * step)) / rect.width,
        y: Math.max(0, Math.min(Math.max(0, rect.height - host.offsetHeight), current.top - rect.top + direction[1] * step)) / rect.height,
      };
      this.layout(state);
    }, { signal });
    const action = (element: HTMLButtonElement, run: () => void) => element.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.interact(state);
      run();
      if (event.detail > 0) element.blur();
    }, { signal });
    action(decrease, () => this.run(state, 'decrease'));
    action(increase, () => this.run(state, 'increase'));
    action(speed, () => this.run(state, 'reset'));
    action(pip, () => this.run(state, 'pip'));
    action(move, () => {});
    action(hide, () => {
      state.hidden = true;
      this.refresh(state);
      restore.focus();
      this.scheduleLayout();
    });
    action(restore, () => {
      state.hidden = false;
      this.refresh(state);
      speed.focus();
      this.scheduleLayout();
    });
    host.addEventListener('pointerenter', () => { this.hovered = video; }, { signal });
    host.addEventListener('pointerleave', () => { if (this.hovered === video) this.hovered = undefined; }, { signal });
    // Keep website shortcuts from acting on clicks or keys inside this control.
    shadow.addEventListener('keydown', (event) => event.stopPropagation(), { signal });
    video.addEventListener('ratechange', () => {
      this.refresh(state);
      if (this.settings.enabled && this.settings.rememberSpeed) this.remember(video.playbackRate);
    }, { signal });
    const initialize = () => {
      if (this.settings.enabled) this.setSpeed(state, this.settings.rememberSpeed ? this.lastSpeed ?? this.settings.defaultSpeed : this.settings.defaultSpeed, false);
      this.refresh(state);
      this.scheduleLayout();
    };
    video.addEventListener('loadedmetadata', initialize, { signal });
    for (const name of ['play', 'pause', 'emptied', 'enterpictureinpicture', 'leavepictureinpicture', 'resize']) {
      video.addEventListener(name, () => { this.refresh(state); this.scheduleLayout(); }, { signal });
    }
    this.resizing.observe(video);
    this.resizing.observe(host);
    (document.fullscreenElement ?? document.documentElement).append(host);
    initialize();
  }

  private remember(speed: number): void {
    if (!Number.isFinite(speed) || speed <= 0) return;
    this.lastSpeed = speed;
    clearTimeout(this.rememberTimer);
    this.rememberTimer = setTimeout(async () => {
      // Access itself can throw synchronously after the extension is reloaded.
      try { await getStorageArea('local').set({ glaceRememberedSpeed: speed }); } catch { /* Keep the in-memory speed. */ }
    }, 300);
  }

  private setSpeed(state: VideoState, speed: number, remember = true): void {
    try {
      state.video.playbackRate = clampSpeed(speed, this.settings);
      if (remember && this.settings.rememberSpeed) this.remember(state.video.playbackRate);
    } catch {
      this.notify(state, 'This video does not support that speed.');
    }
    this.refresh(state);
  }

  private refresh(state: VideoState): void {
    state.speed.textContent = formatSpeed(state.video.playbackRate);
    state.speed.setAttribute('aria-label', `Speed ${formatSpeed(state.video.playbackRate)}. Reset to ${formatSpeed(this.settings.defaultSpeed)}`);
    state.speed.title = `Reset to ${formatSpeed(this.settings.defaultSpeed)}`;
    state.wrapper.classList.toggle('hidden', state.hidden);
    state.host.style.setProperty('--glace-opacity', String(this.settings.opacity));
    state.host.style.setProperty('--glace-idle-opacity', String(this.settings.idleOpacity));
    setGlassEffect(state.host, this.settings.glassEffect);
    const supported = !!document.pictureInPictureEnabled && typeof state.video.requestPictureInPicture === 'function' && !state.video.disablePictureInPicture;
    state.pip.disabled = !supported;
    state.pip.title = supported ? 'Toggle picture-in-picture' : 'Picture-in-picture is unavailable for this video';
    state.pip.setAttribute('aria-label', state.pip.title);
  }

  private async togglePip(state: VideoState): Promise<void> {
    if (!document.pictureInPictureEnabled || !state.video.requestPictureInPicture || state.video.disablePictureInPicture) {
      this.notify(state, 'Picture-in-picture is unavailable for this video.');
      return;
    }
    try {
      if (document.pictureInPictureElement === state.video) await document.exitPictureInPicture();
      else await state.video.requestPictureInPicture();
    } catch {
      this.notify(state, state.video.readyState === 0 ? 'Play the video before opening picture-in-picture.' : 'The browser or website blocked picture-in-picture.');
    }
  }

  private notify(state: VideoState, message: string): void {
    state.notice.textContent = message;
    clearTimeout(state.noticeTimer);
    state.noticeTimer = setTimeout(() => { state.notice.textContent = ''; }, 4500);
  }

  private interact(state: VideoState): void {
    state.interaction = performance.now();
  }

  private run(state: VideoState, action: Action): void {
    const video = state.video;
    switch (action) {
      case 'increase': this.setSpeed(state, video.playbackRate + this.settings.step); break;
      case 'decrease': this.setSpeed(state, video.playbackRate - this.settings.step); break;
      case 'reset': this.setSpeed(state, this.settings.defaultSpeed); break;
      case 'preferred': this.setSpeed(state, this.settings.preferredSpeed); break;
      case 'toggle': state.hidden = !state.hidden; this.refresh(state); this.scheduleLayout(); break;
      case 'pip': void this.togglePip(state); break;
      case 'rewind': seekVideo(video, -this.settings.seekSeconds); break;
      case 'forward': seekVideo(video, this.settings.seekSeconds); break;
      case 'playPause':
        if (video.paused) void video.play().catch(() => this.notify(state, 'The browser blocked video playback.'));
        else video.pause();
        break;
    }
  }

  private onPointerOver = (event: PointerEvent): void => {
    for (const node of event.composedPath()) {
      if (node instanceof HTMLVideoElement) { this.hovered = node; break; }
      // Discover a shadow root attached after its host was inserted.
      if (node instanceof ShadowRoot && !this.observers.has(node)) this.discover(node);
    }
    this.updateHovered(event);
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (performance.now() - this.pointerCheck < 100) return;
    this.pointerCheck = performance.now();
    this.updateHovered(event);
  };

  private updateHovered(event: PointerEvent): void {
    const path = event.composedPath();
    // Player controls commonly cover the actual video. Its rectangle still lets
    // hover select that video, rather than another playing item in a feed.
    let best: HTMLVideoElement | undefined;
    let smallest = Infinity;
    for (const state of this.videos.values()) {
      if (path.includes(state.host)) { this.hovered = state.video; return; }
      const rect = state.video.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom || !this.area(state.video)) continue;
      const area = rect.width * rect.height;
      if (area < smallest) { best = state.video; smallest = area; }
    }
    this.hovered = best;
  }

  private onPointerOut = (event: PointerEvent): void => {
    if (event.composedPath().includes(this.hovered as EventTarget)) this.hovered = undefined;
  };

  private onPointerDown = (event: PointerEvent): void => {
    this.updateHovered(event);
    if (this.hovered) {
      const state = this.videos.get(this.hovered);
      if (state) this.interact(state);
    }
    for (const node of event.composedPath()) {
      if (node instanceof HTMLVideoElement) {
        const state = this.videos.get(node);
        if (state) this.interact(state);
        break;
      }
    }
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (!this.settings.enabled || event.defaultPrevented || event.isComposing || event.repeat) return;
    const path = event.composedPath();
    if (path.some((node) => node instanceof Element && (node.hasAttribute('data-glace-controller') || isEditableTarget(node)))) return;
    const action = (Object.keys(this.settings.shortcuts) as Action[]).find((name) => matchesShortcut(event, this.settings.shortcuts[name]));
    if (!action) return;
    const state = selectVideo([...this.videos.values()].map((candidate) => ({
      value: candidate,
      area: document.pictureInPictureElement === candidate.video ? 1 : this.area(candidate.video),
      playing: !candidate.video.paused && !candidate.video.ended,
      interaction: performance.now() - candidate.interaction < 15_000 ? candidate.interaction : 0,
      hovered: candidate.video === this.hovered,
      pip: document.pictureInPictureElement === candidate.video,
    })));
    if (!state) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.interact(state);
    try { this.run(state, action); } catch { this.notify(state, 'This action is unavailable for this video.'); }
  };

  private area(video: HTMLVideoElement): number {
    if (!video.isConnected || video.hidden || document.pictureInPictureElement === video) return 0;
    const fullscreen = document.fullscreenElement;
    if (fullscreen && !this.composedContains(fullscreen, video)) return 0;
    if (typeof video.checkVisibility === 'function' && !video.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return 0;
    const style = getComputedStyle(video);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return 0;
    return visibleArea(video.getBoundingClientRect(), window.innerWidth, window.innerHeight);
  }

  private scheduleLayout = (): void => {
    if (this.frame || this.disposed) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      for (const state of this.videos.values()) this.layout(state);
    });
  };

  private composedContains(parent: Element, child: Element): boolean {
    let node: Element | null = child;
    while (node) {
      if (parent.contains(node)) return true;
      const root = node.getRootNode();
      node = root instanceof ShadowRoot ? root.host : null;
    }
    return false;
  }

  private layout(state: VideoState): void {
    const { host, video } = state;
    const visible = this.settings.enabled && this.area(video) > 0;
    host.toggleAttribute('data-offscreen', !visible);
    if (!visible) return;
    const rect = video.getBoundingClientRect();
    // A nested video wrapper can sit below a transparent player interaction
    // layer. Find a video-sized stacking context and join its local layers.
    // Staying inside that context keeps unrelated page UI above the controller.
    let parent = video.parentNode!;
    for (let ancestor = video.parentElement; ancestor && ancestor !== document.body && ancestor !== document.documentElement; ancestor = ancestor.parentElement) {
      const bounds = ancestor.getBoundingClientRect();
      const style = getComputedStyle(ancestor);
      const containsVideo = bounds.left <= rect.left + 2 && bounds.top <= rect.top + 2 && bounds.right >= rect.right - 2 && bounds.bottom >= rect.bottom - 2;
      const videoSized = bounds.width <= rect.width + 4 && bounds.height <= rect.height + 4;
      const stackingContext = style.isolation === 'isolate' || style.transform !== 'none' || style.filter !== 'none' || Number(style.opacity) < 1 || (style.position !== 'static' && style.zIndex !== 'auto');
      if (containsVideo && videoSized && stackingContext) parent = ancestor;
    }
    if (host.parentNode !== parent) {
      const focused = host.shadowRoot?.activeElement;
      const target = parent as Node & { moveBefore?: (node: Node, child: Node | null) => void };
      if (host.isConnected && target.moveBefore) target.moveBefore(host, null);
      else parent.appendChild(host);
      // Resizing can change which wrapper encloses the video. Keep keyboard
      // interaction intact when moving the controller to that wrapper.
      if (focused instanceof HTMLElement) focused.focus({ preventScroll: true });
    }
    let layer = 0;
    for (const child of parent.childNodes) {
      if (!(child instanceof Element) || child === host || child.hasAttribute('data-glace-controller')) continue;
      const z = Number.parseInt(getComputedStyle(child).zIndex, 10);
      if (Number.isFinite(z)) layer = Math.max(layer, z);
    }
    host.style.setProperty('--glace-z', `${layer + 1}`);
    const gap = 10;
    const right = this.settings.position.endsWith('right');
    host.toggleAttribute('data-align-right', right && !state.position);
    const bottom = this.settings.position.startsWith('bottom');
    const width = host.offsetWidth;
    const height = host.offsetHeight;
    const x = state.position ? rect.left + Math.min(Math.max(0, rect.width - width), state.position.x * rect.width) : right ? rect.right - width - gap : rect.left + gap;
    const y = state.position ? rect.top + Math.min(Math.max(0, rect.height - height), state.position.y * rect.height) : bottom ? rect.bottom - height - gap : rect.top + gap;
    // Measure the local absolute-position origin, including ancestor scrolling,
    // borders and transforms. The pill follows the video without a global layer.
    host.style.setProperty('--glace-x', '0px');
    host.style.setProperty('--glace-y', '0px');
    const origin = host.getBoundingClientRect();
    const scaleX = origin.width / width || 1;
    const scaleY = origin.height / height || 1;
    host.style.setProperty('--glace-x', `${(x - origin.left) / scaleX}px`);
    host.style.setProperty('--glace-y', `${(y - origin.top) / scaleY}px`);
  }

  private removeDisconnected(): void {
    for (const [video, state] of this.videos) {
      if (video.isConnected) continue;
      state.cleanup();
      clearTimeout(state.noticeTimer);
      this.resizing.unobserve(video);
      this.resizing.unobserve(state.host);
      state.host.remove();
      this.videos.delete(video);
      if (this.hovered === video) this.hovered = undefined;
    }
    for (const [root, observer] of this.observers) {
      if (root instanceof ShadowRoot && !root.host.isConnected) {
        observer.disconnect();
        this.observers.delete(root);
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    this.lifetime.abort();
    this.unsubscribe?.();
    this.resizing.disconnect();
    cancelAnimationFrame(this.frame);
    clearTimeout(this.rememberTimer);
    for (const observer of this.observers.values()) observer.disconnect();
    for (const state of this.videos.values()) {
      state.cleanup();
      clearTimeout(state.noticeTimer);
      state.host.remove();
    }
    this.videos.clear();
    this.observers.clear();
  }
}

void new Glace().start();
