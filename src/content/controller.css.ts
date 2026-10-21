export const controllerCSS = `
:host { all: initial !important; position: absolute !important; left: var(--glace-x, 0px) !important; top: var(--glace-y, 0px) !important; z-index: var(--glace-z, 1) !important; display: block !important; width: max-content !important; height: auto !important; pointer-events: none !important; color-scheme: dark; }
:host([data-offscreen]) { display: none !important; }
*, *::before, *::after { box-sizing: border-box; }
.pill { display: flex; align-items: center; gap: 2px; padding: 4px; border: 1px solid #ffffff70; border-radius: 999px; background: var(--glace-glass-background, linear-gradient(145deg, #ffffff45, #ffffff0a 48%, #ffffff26)); color: #fff; box-shadow: 0 4px 18px #0003, inset 0 1px 1px #ffffffb3, inset 0 -1px 1px #ffffff30; backdrop-filter: var(--glace-glass-filter, blur(14px) saturate(1.8)); -webkit-backdrop-filter: var(--glace-glass-filter, blur(14px) saturate(1.8)); pointer-events: auto; opacity: var(--glace-idle-opacity, .5); text-shadow: 0 1px 3px #000b; font: 500 12px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; transition: opacity .15s, box-shadow .15s; }
.pill > :not(.speed) { display: none; }
:host([data-align-right]) .pill { flex-direction: row-reverse; }
.pill:is(:hover, :focus-within), .dragging .pill { opacity: var(--glace-opacity, 1); }
.pill:is(:hover, :focus-within) > :not(.speed), .dragging .pill > :not(.speed) { display: inline-flex; }
.pill:focus-within { box-shadow: 0 0 0 2px #c4b5fd, 0 4px 16px #0003; }
button { appearance: none; display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; padding: 0; border: 0; border-radius: 10px; background: transparent; color: inherit; font: inherit; cursor: pointer; touch-action: manipulation; }
button:hover { background: #ffffff24; }
button:active { background: #ffffff38; }
button:focus-visible { outline: 2px solid #ddd6fe; outline-offset: -2px; }
button:disabled { opacity: .38; cursor: default; }
.speed { width: 48px; font-variant-numeric: tabular-nums; font-weight: 650; font-size: 12px; letter-spacing: -.2px; }
.move { cursor: grab; touch-action: none; }
.dragging .move { cursor: grabbing; }
.divider { height: 14px; width: 1px; margin: 0 2px; background: #ffffff26; }
svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.restore { display: none; width: 27px; height: 27px; border: 1px solid #ffffff40; background: var(--glace-glass-background, linear-gradient(145deg, #ffffff45, #ffffff12)); border-radius: 50%; box-shadow: 0 2px 8px #0003; pointer-events: auto; backdrop-filter: var(--glace-glass-filter, blur(14px) saturate(1.8)); -webkit-backdrop-filter: var(--glace-glass-filter, blur(14px) saturate(1.8)); }
.hidden .pill { display: none; }
.hidden .restore { display: inline-flex; }
.notice { position: absolute; top: calc(100% + 7px); left: 0; width: max-content; max-width: 240px; padding: 8px 10px; border: 1px solid #ffffff30; border-radius: 9px; background: #20212bef; color: #fff; font: 12px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; box-shadow: 0 4px 14px #0003; pointer-events: none; }
.notice:empty { display: none; }
@media (prefers-reduced-motion: reduce) { .pill { transition: none; } }
`;
