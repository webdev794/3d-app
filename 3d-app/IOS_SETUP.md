# Run 3DEEZI on your iPhone

The native iOS project is included. Building and signing it requires a **Mac with Xcode**; connecting an iPhone to this Windows computer cannot run the native Flutter iOS build. The source handoff is not a signed iOS app. Native compilation, signing and on-device behavior have not been validated in this Windows workspace. [Flutter iOS release guide](https://docs.flutter.dev/deployment/ios)

## Build an IPA from Windows using a cloud Mac

The included GitHub Actions workflow, `.github/workflows/ios-ipa.yml`, compiles the native app on a GitHub macOS runner and packages an **unsigned IPA for Sideloadly**. No Apple signing credentials are needed in GitHub: Sideloadly signs the compiled app later on your Windows PC using your Apple account. The workflow runs only when started manually. It has been prepared and checked locally, but has not yet run on a Mac.

1. Extract the latest `dist/3DEEZI_Flutter_Source.zip` and publish its inner project folder to your own **private GitHub repository**. Include the hidden `.github` folder. `pubspec.yaml` and `.github` must be at the repository root, not inside another `3DEEZI_Flutter_Source` folder. GitHub Desktop can publish the extracted folder. The source archive excludes the local SDK, API key, caches and crash dumps.
2. Put the workflow on the repository's default branch. Open **Actions > Build iPhone IPA for Sideloadly > Run workflow**. GitHub account access and available Actions minutes are required; private-repository macOS jobs consume the account's Actions allowance. [GitHub manual workflows](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow), [GitHub runner availability](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
3. When the build succeeds, download the **3DEEZI-iPhone-IPA-unsigned** artifact from that run. Extract the download to obtain `3DEEZI_iOS_Unsigned.ipa` and its SHA-256 checksum. The source ZIP itself is not the IPA.
4. Install [Sideloadly](https://sideloadly.io/) on Windows with the Apple components listed on its site. Connect and unlock your iPhone by USB, trust the computer, select the phone in Sideloadly, load the IPA, and sign/install with your Apple account. Enter Apple credentials only in the installation tool; the cloud workflow does not need them.
5. On iOS 16 or later, enable **Settings > Privacy & Security > Developer Mode** when required and restart as prompted. Trust the developer account under **Settings > General > VPN & Device Management**. Free-account installations need renewal every seven days; Sideloadly supports refresh while the computer can reach the device. [Sideloadly setup and limits](https://sideloadly.io/faq)

The cloud build uses Flutter 3.47.5 and the bundled viewer/assets, and enables the OpenAI features when the repository has an `OPENAI_API_KEY` Actions secret (otherwise the demo flow runs without AI). It produces a physical-device release build, not a simulator app. Signing, installation and actual iPhone behavior must still be verified. This unsigned IPA is not a TestFlight/App Store upload.

For another macOS build service, install Flutter and Xcode there, place this source folder on it and run:

```sh
bash scripts/build-ios-sideload.sh
```

The expected output is `dist/3DEEZI_iOS_Unsigned.ipa`. This command cannot compile the app on Windows. The sections below describe using a Mac directly with Apple signing instead.

## Prepare your Mac and phone

1. Copy/extract the source project onto a Mac. Install Flutter stable with Dart 3.10 or later and add `flutter` to `PATH`. The Windows source checks used Flutter 3.47.5 / Dart 3.13.4; install the macOS Flutter SDK instead of copying the Windows `.tools/flutter` folder.
2. Install Xcode with iOS platform support and finish its first-launch setup and license prompts. Run `flutter doctor -v` and resolve its iOS toolchain issues. This project uses Swift Package Manager for its native plugins; if previously disabled, enable it with `flutter config --enable-swift-package-manager`. Install CocoaPods only if Flutter requests it for a dependency fallback. [Flutter package setup](https://docs.flutter.dev/packages-and-plugins/swift-package-manager/for-app-developers)
3. Connect an **iPhone running iOS 15 or later** by USB, unlock it, and tap **Trust** when prompted. Enable **Settings > Privacy & Security > Developer Mode** on iOS 16 or later and complete the restart/confirmation. Keep it connected and unlocked for installation.

Flutter's [iOS setup guide](https://docs.flutter.dev/platform-integration/ios/setup) covers the Mac toolchain and phone setup. A personal Apple account supports testing on your own device; exported IPA distribution depends on the signing capabilities of your developer team.

## Configure signing once

Run these commands from the project folder on the Mac to regenerate machine-specific Flutter configuration, then open Xcode:

```sh
flutter pub get
flutter build ios --config-only --no-codesign
open ios/Runner.xcworkspace
```

In Xcode, add your Apple account under **Xcode > Settings > Apple Accounts**. Select the **Runner** project, then the **Runner** target and **Signing & Capabilities**. Enable **Automatically manage signing**, choose your own **Team**, and replace `com.example.threeDeezi` with a unique bundle identifier belonging to you. Select the connected iPhone as the destination and resolve any signing/device preparation messages. Team credentials are intentionally not bundled. [Apple's device setup instructions](https://developer.apple.com/documentation/xcode/running-your-app-on-simulated-or-physical-devices)

## Install and run on the connected iPhone

List devices, then replace `IPHONE_DEVICE_ID` with your physical phone's ID:

```sh
flutter devices
bash scripts/run-ios.sh "IPHONE_DEVICE_ID"
```

This builds, signs, installs and launches a release build. It can be reopened from the phone's Home Screen while its provisioning remains valid. If iOS requests developer trust, enable it under **Settings > General > VPN & Device Management**. For hot reload, use `bash scripts/run-ios.sh "IPHONE_DEVICE_ID" --debug` and leave Flutter connected.

## Export a development IPA

After signing is configured with a team/profile that supports development export:

```sh
bash scripts/build-ios.sh
```

The helper runs `flutter build ipa --release --export-method development`. A successful export appears in `build/ios/ipa/`; the Xcode archive is in `build/ios/archive/`. The helper checks that a new IPA was actually created because Flutter can finish archiving even when export fails. Install the IPA through **Xcode > Window > Devices and Simulators**, select the registered iPhone, and add it under **Installed Apps**. The phone must be allowed by the provisioning profile. [Flutter export options](https://docs.flutter.dev/deployment/ios), [Apple registered-device distribution](https://developer.apple.com/documentation/xcode/distributing-your-app-to-registered-devices)

If a Personal Team cannot export an IPA, use the direct run command above. An unsigned archive or `.app` is not an installable iPhone package. A development IPA is not a TestFlight/App Store submission.

## Optional AI configuration

Both helpers run without an API key, using the demo behavior. To enable AI for a private test build, create your own JSON defines file **outside the project** with an `OPENAI_API_KEY` entry, then pass its absolute path:

```sh
bash scripts/run-ios.sh "IPHONE_DEVICE_ID" --dart-define-from-file="/absolute/path/to/private-defines.json"
bash scripts/build-ios.sh --dart-define-from-file="/absolute/path/to/private-defines.json"
```

Arguments are passed directly to Flutter. The helpers do not read `.tools/openai.key`. Do not include that key file or your private defines in a source handoff. A key compiled into a mobile app is extractable; use private test credentials only and place API calls behind a server before public distribution.

## Try the web demo from Windows

The web preview can be opened in Safari over the same local network; see [README.md](README.md) for the preview command and address. It is a browser demo, not a signed native installation. The web code includes the 3D studio, but mobile Safari rendering and native camera/photo behavior still need testing on your phone.
