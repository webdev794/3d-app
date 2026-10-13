#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  printf '%s\n' \
    'Usage: bash scripts/build-ios.sh [flutter build ipa options]' \
    'Defaults to a release build exported for development devices.' \
    'Configure signing in Xcode first. See IOS_SETUP.md.' \
    'Optional: --dart-define-from-file=/absolute/path/to/private-defines.json'
  exit 0
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  printf '%s\n' 'Native iOS builds require macOS and Xcode. See IOS_SETUP.md.' >&2
  exit 1
fi
if ! command -v flutter >/dev/null 2>&1; then
  printf '%s\n' 'Install Flutter on this Mac and add flutter to PATH. See IOS_SETUP.md.' >&2
  exit 1
fi
if ! xcodebuild -version || ! xcrun --sdk iphoneos --find clang >/dev/null; then
  printf '%s\n' 'Finish Xcode setup and install iOS platform support. Run flutter doctor -v.' >&2
  exit 1
fi

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd -- "$project_dir"

has_mode=false
has_export_options=false
for argument in "$@"; do
  case "$argument" in
    --debug|--profile|--release) has_mode=true ;;
    --export-method|--export-method=*|--export-options-plist|--export-options-plist=*) has_export_options=true ;;
  esac
done
flutter_args=(build ipa)
if [[ "$has_mode" == false ]]; then
  flutter_args+=(--release)
fi
if [[ "$has_export_options" == false ]]; then
  flutter_args+=(--export-method development)
fi
flutter_args+=("$@")

flutter pub get
build_marker="$(mktemp "${TMPDIR:-/tmp}/3deezi-ios.XXXXXX")"
trap 'rm -f -- "$build_marker"' EXIT
flutter "${flutter_args[@]}"

# Flutter can return success for an archive even when IPA export fails.
# Require a new IPA so an old export cannot be mistaken for this build.
ipa_created=false
for ipa_path in build/ios/ipa/*.ipa; do
  if [[ -f "$ipa_path" && "$ipa_path" -nt "$build_marker" ]]; then
    printf 'Created IPA: %s/%s\n' "$project_dir" "$ipa_path"
    ipa_created=true
  fi
done
if [[ "$ipa_created" != true ]]; then
  printf '%s\n' \
    'No new IPA was exported to build/ios/ipa. Check the signing/export messages above.' \
    'Open the archive in build/ios/archive with Xcode to inspect export requirements.' \
    'For direct installation on your own iPhone, use scripts/run-ios.sh instead.' >&2
  exit 1
fi
