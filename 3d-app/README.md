# 3DEEZI — Flutter presentation prototype

A working, static-data prototype based on the supplied **3DEEZI Full App Flow** PDF. The interface follows the black, electric-cyan and blue visual direction, with bundled reference imagery, a responsive phone layout, and a desktop presentation navigator.

## Laravel / React website

The separate [website application](website/README.md) implements the sportswear design flow with a React frontend, the shared interactive 3D renderer, and a Laravel backend for accounts, projects, versions, assets and exports. See the [mobile API integration guide](website/docs/API.md) to connect the existing apps. The Flutter project below remains a separate client; adding the website does not change its network behavior.

## Run the Flutter source

Install Flutter stable with Dart 3.10 or newer, then open a terminal in this folder:

```sh
flutter pub get
flutter run -d chrome
```

The project was verified with Flutter 3.47.5 and Dart 3.13.4. Chrome is the recommended presentation target. Internet access is needed for initial Flutter setup and dependency resolution. The app itself uses local assets and makes no API requests.

For a connected Android emulator/device, use `flutter run -d <device-id>`. Android builds require an Android SDK and Java. iOS scaffolding is included for use on macOS with Xcode; the iOS build has not been verified in this Windows environment.

## Run on an iPhone

On this Windows PC, double-click `scripts/Start-iPhone-Preview.cmd` (or run `node scripts/serve_preview.mjs --lan`). Connect the iPhone to the same local network and open the printed **Phone preview** address in Safari. Keep the preview server running. The server shares only `build/web`; it does not serve the project source or local configuration. If the phone cannot connect, check that both devices are on the same network and that Windows Firewall permits Node.js on your private network.

This is a browser preview, not an installed iOS app. It uses the bundled 3D viewer in an iframe and runs the scripted demo when built without an AI key. The latest source can be rebuilt with `flutter build web --release --no-web-resources-cdn`. Actual Safari/device behavior still needs checking on an iPhone.

A native iOS build requires macOS with Xcode, either on a Mac or a cloud Mac build service, plus signing for the target iPhone. Windows cannot create that build locally. See [IOS_SETUP.md](IOS_SETUP.md) for the Mac setup and the `scripts/run-ios.sh` and `scripts/build-ios.sh` commands. `dist/3DEEZI_Flutter_Source.zip` contains the source to transfer; it is not an installable IPA.

For Windows USB installation, `.github/workflows/ios-ipa.yml` prepares a native, unsigned IPA on a GitHub cloud Mac. Run **Build iPhone IPA for Sideloadly** in your repository's Actions tab, then download its IPA artifact and sign/install it with Sideloadly. This workflow still needs a connected GitHub repository and an actual cloud build; no IPA has been produced locally. [Cloud build steps](IOS_SETUP.md#build-an-ipa-from-windows-using-a-cloud-mac).

## Android demo

To build the APK from source after installing the Android SDK:

```sh
flutter build apk --release
```

The file is written to `build/app/outputs/flutter-apk/app-release.apk`. The supplied configuration uses a development signing key for client demonstrations. Configure your own production key before publishing to an app store.

The demo targets Android 7.0/API 24 or newer. Transfer the APK to a compatible Android phone and open it to install, or use `adb install -r 3DEEZI_Android_Demo.apk` with a connected development device. The Android version uses native system bars, supports the system Back button, and opens Android’s standard document picker when you save a sample export.

## Present without installing Flutter

The separate **3DEEZI_Web_Preview.zip** contains the compiled app. Extract it and double-click `Start-Preview.cmd` on Windows with Node.js installed. Alternatively, from that extracted folder run:

```sh
node serve.mjs
```

Then visit **http://localhost:8088**. Keep the terminal open while presenting; Ctrl+C stops the server. The built preview uses bundled fonts and CanvasKit and can run without an internet connection. Do not open `index.html` directly with a `file://` URL.

To host under XAMPP, copy the preview folder into `htdocs`, start Apache, and visit its URL, for example `http://localhost/3deezi-preview/`.

## Suggested client walkthrough

The app follows the client's 14-screen "Complete App Flow":

1. **Splash → Onboarding → Sign in.** Apple, Google and Email are demo sign-ins.
2. **Create home.** Choose **AI Powered** or **Design Your Own**.
3. **AI Designer.** Type a brief (or tap **Inspire** / **Improve**), add up to three reference images, and send. **Match** and **Modify** steer how references are used.
4. **AI Generating → Choose a design.** OpenAI returns four concept directions with quick renders; pick one and open it in the studio.
5. **Design Your Own.** Swipe the sport carousel, tap **Design this**, then pick a garment.
6. **Design Studio.** Spin, zoom and snap the live 3D kit (Front/Side/Back). Use the Colours, Patterns, Logos, Text and Garment tools, Undo/Redo, Preview, the AI prompt and the quick chips.
7. **Save project** (versioned) → **Export**: 3D mock-up, front & back, high resolution, social media image or the full design pack, shared through the phone's share sheet.
8. **My Projects** (All / AI / DYO) and **Assets** (Logos, Patterns, Artwork, Uploads).

On the web build, `?screen=studio` (any screen name) opens a single step for presenting.

## OpenAI generation

When built with an OpenAI key, the create flow uses real AI:

- **Analysis**: `gpt-6-luna` reads the brief and the reference image (uploaded photo, camera shot or bundled sample) and returns a structured design: name, colours, pattern, fabric, wordmark and a render description. The editable vector designer adopts these values.
- **Generation**: `gpt-image-2` renders the kit (1024 x 1536). A reference image is passed as style guidance. The back view is rendered on demand from the front render so the two match.
- **Designer**: "Ask 3DEEZI to change anything" revises the design and edits the render; "Re-render with my settings" applies the Customise panel. Saved projects and exports include the renders.

The key is supplied at build time and is never stored in source:

```sh
flutter build apk --release --dart-define=OPENAI_API_KEY=sk-...
```

`.tools/build-android.ps1` reads it from the git-ignored `.tools/openai.key`. Override the models with `--dart-define=OPENAI_TEXT_MODEL=...` and `OPENAI_IMAGE_MODEL=...`. Without a key the app runs the original scripted demo. A key compiled into an app can be extracted from the APK, so use a spend-limited project key for test builds and move the calls behind a server before public release. `test/ai_live_test.dart` exercises the full pipeline against the real API when a key is defined.
## Real-time 3D studio

The design studio shows a live Three.js garment (`assets/viewer/index.html`) inside a WebView:

- **Garment:** built in code from the jersey or singlet sewing outline, inflated into a rounded 3D shape with open hem, cuffs and neck. Its texture layout is the flat print pattern, so colours, panels, the AI pattern, wordmark, crest and number land exactly. Artist-made glTF models replace it in Phase 2.
- **Look:** studio environment lighting, cool rim lights, knit normal map with fabric sheen, satin podium with a glow ring and light pool tinted to the kit, soft contact shadow, bloom on the emissive rings only.
- **Interaction:** drag to spin with inertia, pinch to zoom, two-finger pan within limits, double-tap to reset, idle turntable, GSAP-animated Front/Side/Back snaps.
- **AI:** `gpt-image-2` draws a seamless black-on-white pattern tile (`generatePattern`); the viewer converts it to a stencil in the kit's colours and wraps it across the shoulders and sleeves. Chat edits recolour the 3D kit as soon as the design spec returns.
- **Export:** tapping Export captures real 3D mock-ups (front and back PNG) into the download.

Source is in `viewer/src`. Rebuild the single-file bundle with `cd viewer && npm install && node build.mjs`; `node viewer/shot.cjs <dir>` saves headless-Chrome screenshots. The web build hosts the 3D viewer in an iframe; tests fall back to the 2D preview.
## Working interactions and boundaries

- Navigation, selection cards, form validation, editable briefs, colour swatches, garment views, pattern choices, team wordmarks, project search/filtering, session saves, progress animations and sample downloads work locally.
- AI generation, account sign-in, camera/file upload and export processing are scripted demonstrations. Upload actions open a sample reference picker. Nothing is uploaded, and no real credentials are needed.
- The garment preview is a vector illustration with front/back/side views and a simulated rotation, not a 3D mesh. A real 3D renderer and AI service would be a later integration.
- Projects are stored in memory for the current session. Reloading resets the demo data.
- Every export selection produces a clearly labelled sample ZIP containing an SVG illustration, `design-brief.json`, and `READ-ME.txt`. The selected output type is recorded in the brief. Production patterns, PDFs, 3D assets and manufacturing tech packs are not generated.
- Browser downloads save through the browser. Android opens its standard save-file picker so you can select a Downloads folder or another location; no storage permission is requested. Other native targets write to the app-accessible temporary directory and show its path.

## Build and check

```sh
flutter analyze
flutter test
flutter build web --release --no-web-resources-cdn
```

The last command creates a web build at `build/web`. Serve it over HTTP at the server root. To rebuild for an XAMPP subfolder, add the matching base path, for example `--base-href /3deezi-preview/`. The supplied prebuilt preview already uses a relative base path for flexible hosting. All visual assets and fonts are bundled, so no CDN is needed by this build.

## Source guide

| File | Purpose |
| --- | --- |
| `lib/app.dart` | App theme, responsive presentation frame, welcome/auth/home/assets/profile |
| `lib/app_controller.dart` | Session state, navigation, projects and design choices |
| `lib/screens/create_flow.dart` | Sport, garment, reference, analysis, generation and reveal |
| `lib/screens/studio_screens.dart` | Designer, editing, project library, export and files |
| `lib/widgets/ui.dart` | Reusable controls and the configurable garment painter |
| `lib/export_service.dart` | Sample SVG, design JSON and ZIP generation |
| `web/download.js` | Local browser download bridge |
| `test/` | Creation and editing flow/widget tests |

The reference images are extracted from the user-supplied PDF. Inter and Rajdhani fonts are bundled with their OFL licenses in `assets/fonts`. No paid assets or services are required to run this prototype.
