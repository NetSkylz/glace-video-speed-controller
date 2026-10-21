# Glace

A lightweight Chrome Manifest V3 extension that adds a frosted glass speed pill to videos. Built with TypeScript and plain HTML/CSS, with no runtime dependencies or server.

## Install locally

Requires Node.js 24+ and npm.

1. Run `npm install`.
2. Run `npm run build`.
3. Open `chrome://extensions` in Chrome and enable **Developer mode**.
4. Choose **Load unpacked** and select this project's `dist` folder.
5. Refresh existing video tabs. Pin Glace in the toolbar for easy access to its settings.

After changes, rebuild, click **Reload** on the extension card, and refresh the video tab. `npm run dev` rebuilds TypeScript and imported CSS automatically; run a full build after editing files in `public`.

## Controls

The pill appears at the top left of visible videos, including videos inserted as you scroll a feed. At rest it shows only the speed at 50% opacity by default; settings let you customize the resting and hovered opacity separately. Hover over it (or focus it with the keyboard) to reveal decrease, current speed/reset, increase, picture-in-picture, a move handle, and hide. The translucent glass pill stays anchored to its spot on the video as the page scrolls. Drag the dotted move handle to place it elsewhere over the video; arrow keys move the focused handle in 10px steps (Shift for 20px), and double-clicking the handle restores the configured corner. Custom placement lasts for that video on the current page and adapts when the video resizes. A small restore control remains after hiding; the toggle shortcut also restores it. With several videos, keyboard shortcuts target the hovered video, then the active or recently used visible video.

| Default shortcut | Action |
| --- | --- |
| D / S | Increase / decrease by the configured step |
| R | Reset speed (initially 1×) |
| B | Apply your default speed |
| G | Apply your preferred speed (initially 1.5×) |
| V | Hide / restore controls |
| P | Toggle picture-in-picture |
| Z / X | Rewind / forward (initially 10 seconds) |
| K | Play / pause |

Shortcuts can be recorded, changed, or cleared in settings. They use physical key codes, so the key's location is consistent across keyboard layouts. They are inactive while typing in inputs or editable content. Assigned shortcuts take precedence over a site's shortcuts when a visible video is available.

Open the toolbar popup for quick settings, then **Personalize Glace** for default, preferred and reset speeds, step, limits, seek distance, shortcuts, controller position and opacity. Remember speed shares your latest rate across videos in this browser profile; disable it to initialize each video at the default speed. A changed default speed applies to already discovered videos.

## Development and verification

The pill uses the video's local player stacking context, one step above its layers (normally 1). This keeps it hoverable over transparent player interaction layers while headers and dialogs outside the player cover it through normal browser stacking. No site-specific player selectors are required.

```sh
npm run check          # TypeScript, unit tests, production build
npm run test:browser   # Browser integration against dist; build first
```

Browser tests use Playwright Chromium. If no browser is installed, run `npx playwright install chromium`, or point `GLACE_CHROMIUM` to a Chromium executable. Tests exercise dynamic feed discovery, speed changes, shortcuts and typing exclusions including open shadow DOM, settings propagation, hiding/restoring, video removal, fullscreen wrapper positioning, unavailable picture-in-picture, and settings-page saves and shortcut conflict handling. The detailed UI tests mock Chrome storage; a separate smoke test loads the actual unpacked Manifest V3 extension in a fresh browser profile and verifies automatic content injection and speed changes with real extension storage. Native picture-in-picture playback still needs a manual smoke test with a loaded video.

Source layout:

- `src/content`: video discovery, target selection, keyboard controls, isolated glass overlay.
- `src/shared`: validated settings, Chrome storage access, shortcut matching.
- `src/options` and `src/popup`: settings and toolbar UI.
- `public`: manifest, HTML shells, original extension icons.
- `scripts`: esbuild bundling, tests, reproducible icon generation.

## Access and privacy

Glace runs on all ordinary websites and in embedded frames so it can find native HTML video elements, including those added by feeds or navigation. The manifest requests website access through its content-script matches and `storage` for preferences. It has no analytics, external requests, remote code, or account requirement. Preferences use Chrome's synced storage; the remembered playback speed stays in local extension storage. Chrome may synchronize preferences if browser sync is enabled.

Chrome blocks extensions on internal browser pages, the Chrome Web Store, and some protected surfaces. File URLs and incognito require enabling access in Chrome's extension settings. Closed shadow roots, canvas-based players, and some protected/custom players cannot expose a video to this extension. Native picture-in-picture depends on browser/site support and a loaded video; Chrome and the operating system control that window's outer corners and appearance. Fullscreen wrappers support the overlay; native fullscreen of the video element itself may hide overlays, while keyboard controls remain usable. Some sites may impose or reapply their own playback speed.

This project creates a local unpacked extension. It has not been submitted to the Chrome Web Store.
