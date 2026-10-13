# Continuation from Claude Code — 13 October 2026

The local Claude Code session titled **Run on desktop without phone connection** was checked against the source. Its last implementation stopped while wiring `pick`, `processImage`, `board` and `select` into the shared garment viewer. The client's later references requested an artboard, preset designs and a new homepage, with matching website/app functionality.

## Work resumed

- Finish and connect the shared artboard/layers protocol rather than replace the existing project.
- Preserve gradients, per-area patterns and artwork through project saves, version history and app synchronization.
- Add usable image, text and shape editing, artwork placement, plain-background removal, tint and PNG export.
- Provide the same preset catalog and renderer to React and Flutter.
- Update the homepage to three creation paths: AI, design your own, and artboard.
- Use the supplied final logo PDF and provide an honest apps/downloads page. Store links remain **Coming soon** until listing URLs are supplied.
- Fix local desktop preview paths and provide a launcher for the React site and Flutter browser app.

## Run without a phone

From the project root, double-click `scripts/Start-Desktop.cmd`.

- React website: http://127.0.0.1:8000
- Artboard: http://127.0.0.1:8000/artboard
- Flutter app in the desktop browser: http://127.0.0.1:8088

The launcher starts local services with hidden helper windows, records their logs under `.tools/desktop`, and reuses an already-running matching service. `scripts/Stop-Desktop.cmd` stops only matching processes started by this launcher. No USB device, emulator or phone connection is required.

After source changes, run `powershell -NoProfile -File scripts/Build-Desktop.ps1`. Dependencies must already be installed (`composer install` and `npm install` under `website`, `npm install` under `viewer`, plus Flutter packages). The web build uses `/` and the app preview proxies `/api/v1` to Laravel. Existing deployments and live data are not overwritten by these local launch commands.

## Scope

The artboard is a focused garment artwork editor, not a full CorelDRAW implementation. Plain-background removal uses the border color and preserves internal detail; photographic subject segmentation is not included. Existing physical garment models remain procedural until properly licensed, production-quality models are supplied. App Store/Google Play publishing, physical-device installation, live-site deployment and paid subscription activation are separate steps.

See [VIEWER_BRIDGE.md](VIEWER_BRIDGE.md) for the shared protocol, [API.md](API.md) for mobile integration, and [SHOWROOM.md](SHOWROOM.md) for model requirements.
