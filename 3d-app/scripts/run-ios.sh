#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  printf '%s\n' \
    'Usage: bash scripts/run-ios.sh DEVICE_ID [flutter run options]' \
    'Find your physical iPhone ID with: flutter devices' \
    'Defaults to release mode. Pass --debug for hot reload.' \
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

if [[ $# -eq 0 || "$1" == -* ]]; then
  flutter devices
  printf '%s\n' 'Pass the physical iPhone ID: bash scripts/run-ios.sh DEVICE_ID' >&2
  exit 2
fi
device_id="$1"
shift

has_mode=false
for argument in "$@"; do
  case "$argument" in
    --debug|--profile|--release) has_mode=true ;;
  esac
done
flutter_args=(run -d "$device_id")
if [[ "$has_mode" == false ]]; then
  flutter_args+=(--release)
fi
flutter_args+=("$@")

flutter pub get
exec flutter "${flutter_args[@]}"
