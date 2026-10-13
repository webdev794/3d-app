# Validation record

## iPhone preview and source handoff (2026-10-01)

- Added a manually triggered GitHub Actions macOS build (`.github/workflows/ios-ipa.yml`) for an unsigned, physical-device IPA to sign with Sideloadly on Windows. Workflow YAML validation passed; no cloud job has run because no GitHub repository/build account is connected.
- Added `scripts/build-ios-sideload.sh` to compile an iPhone release app and package its validated ARM64 binaries as `Payload/Runner.app`. Bash syntax/help, unsupported-argument and Windows-host checks passed. Packaging/compilation has not run on macOS; no IPA artifact currently exists.

- Added native camera/photo usage descriptions and explicit automatic signing. iOS plist/scheme XML, deployment target and signing configuration checks passed.
- Added Mac helpers for connected iPhone deployment and development IPA export. Bash syntax, help output and Windows prerequisite guards checked.
- Native iOS compilation/signing has not run: this workstation is Windows and no Mac build host or Apple signing team is configured. The source ZIP is not an IPA.
- Rebuilt the web preview with `flutter build web --release --no-web-resources-cdn --no-wasm-dry-run --optimization-level=1 --no-pub`, without an AI key. The default optimization build hit a Windows memory/thread limit; the lower optimization build succeeded.
- Preview server now supports explicit `--lan` for phone access. Verified HTTP 200 for the app, bootstrap and bundled 3D viewer at the LAN address. Chromium at 390 x 844 reached the welcome screen without browser errors. Physical iPhone/Safari behavior is not yet verified.

## Earlier validation

- Flutter: 3.47.5 stable; Dart: 3.13.4.
- `flutter analyze`: no issues.
- `flutter test`: 8 passing tests.
- Release web build: successful, with bundled rendering assets.
- Chrome checks: complete creation, editing, saving and download workflow at 1440 × 1000 and 390 × 844.
- Widget layout sweep: all non-splash screens at 375 × 720, including reference entry with the keyboard visible.
- Export package: sample SVG artwork, JSON design brief and a readme.

- Android: release APK built (`dist/3DEEZI_Android_Demo.apk`, arm/arm64/x64) with `.tools/build-android.ps1`. Not yet run on a physical device.
- Images: regenerated at 4x from the PDF's native 1536 x 1024 bitmap with Real-ESRGAN (`.tools/pdf/native.mjs` then `.tools/pdf/assets-hd.mjs`). Previous low-res copies are in `design-reference/images-lowres`. iOS scaffolding is supplied but has not been built on this Windows workstation.
