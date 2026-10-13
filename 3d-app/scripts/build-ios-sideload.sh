#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

usage() {
  printf '%s\n' \
    'Usage: bash scripts/build-ios-sideload.sh [--dart-define=KEY=VALUE ...]' \
    'Optional: --dart-define-from-file=/absolute/path/to/private-defines.json' \
    'Requires macOS, Xcode with the iOS SDK, and Flutter on PATH.' \
    'Builds an unsigned release IPA for a physical iPhone.' \
    'Output: dist/3DEEZI_iOS_Unsigned.ipa' \
    'Sign and install this IPA with Sideloadly; it cannot be installed directly.'
}

# Restrict forwarded options so callers cannot accidentally package a simulator,
# debug/config-only build, another target, or output from a different directory.
# Flutter only prepares the Xcode project; xcodebuild compiles it below so
# code signing can be disabled for every target, including plugin bundles.
flutter_args=(build ios --config-only --release --no-codesign)
while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      usage
      exit 0
      ;;
    --dart-define=*|--dart-define-from-file=*)
      [[ -n "${1#*=}" ]] || fail 'A Dart define option requires a value.'
      flutter_args+=("$1")
      shift
      ;;
    --dart-define|--dart-define-from-file)
      [[ $# -ge 2 && -n "${2:-}" && "${2:-}" != --* ]] || fail 'A Dart define option requires a value.'
      flutter_args+=("$1" "$2")
      shift 2
      ;;
    *)
      fail 'Only --dart-define and --dart-define-from-file build options are supported. Use --help.'
      ;;
  esac
done

[[ "$(uname -s)" == Darwin ]] || fail 'Native iOS compilation requires macOS and Xcode. Run this script on a Mac or macOS CI runner.'
command -v flutter >/dev/null 2>&1 || fail 'Install Flutter and add flutter to PATH.'
xcodebuild -version || fail 'Finish Xcode setup and select Xcode with xcode-select.'
xcrun --sdk iphoneos --find clang >/dev/null || fail 'Install the iOS platform in Xcode.'

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd -- "$project_dir"
[[ -f pubspec.yaml && -d ios/Runner.xcodeproj ]] || fail 'The Flutter iOS project is missing.'

# Keep every generated path inside the project, including temporary cleanup.
for generated_path in dist build build/ios build/ios/iphoneos; do
  [[ ! -L "$project_dir/$generated_path" ]] || fail "Generated directory must not be a symlink: $generated_path"
done
mkdir -p -- "$project_dir/dist"
dist_dir="$(cd -- "$project_dir/dist" && pwd -P)"
[[ "$dist_dir" == "$project_dir/dist" ]] || fail 'The dist directory must be inside this project.'
app_path="$project_dir/build/ios/Release-iphoneos/Runner.app"
ipa_path="$dist_dir/3DEEZI_iOS_Unsigned.ipa"
[[ ! -L "$app_path" ]] || fail 'The app output must not be a symlink.'
[[ ! -L "$ipa_path" && ( ! -e "$ipa_path" || -f "$ipa_path" ) ]] || fail 'The IPA output must be a regular file or an unused path.'
stage_dir="$(mktemp -d "$dist_dir/.ios-sideload.XXXXXX")"
build_complete=false
cleanup() {
  # Preserve the previous successful app if this build fails. An existing IPA
  # stays in place until a fully validated replacement is ready.
  if [[ "$build_complete" != true && -e "$stage_dir/previous-Runner.app" ]]; then
    if [[ -e "$app_path" || -L "$app_path" ]]; then
      mv -- "$app_path" "$stage_dir/failed-Runner.app" || return
    fi
    mv -- "$stage_dir/previous-Runner.app" "$app_path" || return
  fi
  if [[ "$build_complete" != true && -f "$ipa_path" ]]; then
    printf 'Build did not create a replacement IPA. Existing file retained: %s\n' "$ipa_path" >&2
  fi
  case "$stage_dir" in
    "$dist_dir"/.ios-sideload.*) rm -rf -- "$stage_dir" ;;
  esac
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Temporarily move the previous app aside. A successful command that produces
# no new app must never package old output, including with a custom build dir.
if [[ -e "$app_path" || -L "$app_path" ]]; then
  mv -- "$app_path" "$stage_dir/previous-Runner.app"
fi

flutter pub get
flutter "${flutter_args[@]}"
xcode_log="$project_dir/build/ios/xcodebuild.log"
mkdir -p -- "$project_dir/build/ios"
# Signing is done later by Sideloadly. Show only errors and the result; the
# full log is kept for the workflow artifact.
xcodebuild \
  -workspace ios/Runner.xcworkspace \
  -scheme Runner \
  -configuration Release \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  SYMROOT="$project_dir/build/ios" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  EXPANDED_CODE_SIGN_IDENTITY="" \
  DEVELOPMENT_TEAM="" \
  build 2>&1 | tee "$xcode_log" | grep -v -E 'DART_DEFINES|-D[A-Z_]+=' \
  | grep -E 'error:|BUILD (SUCCEEDED|FAILED)|\*\* ' || true
grep -q 'BUILD SUCCEEDED' "$xcode_log" || fail 'xcodebuild failed; see the errors above (full log: build/ios/xcodebuild.log).'

[[ -d "$app_path" && ! -L "$app_path" ]] || fail 'No new build/ios/Release-iphoneos/Runner.app was created.'
plist_path="$app_path/Info.plist"
[[ -f "$plist_path" ]] || fail 'The compiled app has no Info.plist.'
platform="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleSupportedPlatforms:0' "$plist_path")"
[[ "$platform" == iPhoneOS ]] || fail 'The compiled app is not for a physical iPhone.'
executable_name="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$plist_path")"
[[ -n "$executable_name" && "$executable_name" != */* && "$executable_name" != . && "$executable_name" != .. ]] || fail 'The app executable name is invalid.'
app_executable="$app_path/$executable_name"
[[ -x "$app_executable" ]] || fail 'The compiled app executable is missing or not executable.'
[[ "$(file -b "$app_executable")" == *executable* ]] || fail 'The app entry point is not a compiled executable.'

validate_ios_binary() {
  local binary_path="$1" binary_type architectures load_commands binary_platform
  [[ -s "$binary_path" ]] || fail "Missing compiled binary: $binary_path"
  binary_type="$(file -b "$binary_path")"
  [[ "$binary_type" == *Mach-O* ]] || fail "Not a Mach-O binary: $binary_path"
  architectures="$(xcrun lipo -archs "$binary_path")"
  [[ " $architectures " == *' arm64 '* ]] || fail "No arm64 device code in: $binary_path"
  load_commands="$(xcrun otool -l -arch arm64 "$binary_path")"
  binary_platform="$(printf '%s\n' "$load_commands" | awk '
    $1 == "cmd" { command = $2 }
    platform == "" && command == "LC_BUILD_VERSION" && $1 == "platform" { platform = $2 }
    platform == "" && command == "LC_VERSION_MIN_IPHONEOS" { platform = "2" }
    END { print platform }
  ')"
  [[ "$binary_platform" == 2 || "$binary_platform" == IOS ]] || fail "Binary is not built for the iOS device platform: $binary_path"
}

validate_ios_binary "$app_executable"
validate_ios_binary "$app_path/Frameworks/App.framework/App"
validate_ios_binary "$app_path/Frameworks/Flutter.framework/Flutter"

mkdir -- "$stage_dir/Payload"
# ditto preserves the entire bundle, nested frameworks, permissions and symlinks.
ditto "$app_path" "$stage_dir/Payload/Runner.app"
ditto -c -k --norsrc --keepParent "$stage_dir/Payload" "$stage_dir/archive.ipa"
unzip -tq "$stage_dir/archive.ipa"
mv -- "$stage_dir/archive.ipa" "$ipa_path"
build_complete=true

printf '\nCreated unsigned IPA: %s\n' "$ipa_path"
printf '%s\n' 'Sign and install it with Sideloadly on Windows. This unsigned IPA cannot be installed directly on an iPhone.'
