#!/bin/bash
# Package an already signed iPhone .app produced by Xcode; this does not sign it.
set -euo pipefail
if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo "Usage: bash scripts/package-ipa.sh /path/to/Marinara.app [output.ipa]" >&2
  exit 2
fi
app_path="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
if [ "$(/usr/libexec/PlistBuddy -c 'Print :DTPlatformName' "$app_path/Info.plist")" != "iphoneos" ]; then
  echo "Use a device build, not a simulator app." >&2
  exit 1
fi
test -f "$app_path/embedded.mobileprovision"
codesign --verify --deep --strict "$app_path"
ipa_path="${2:-ios/build/Marinara.ipa}"
mkdir -p "$(dirname "$ipa_path")"
ipa_path="$(cd "$(dirname "$ipa_path")" && pwd)/$(basename "$ipa_path")"
if [ -e "$ipa_path" ]; then
  echo "Output already exists; choose a new filename: $ipa_path" >&2
  exit 1
fi
package_temp="$(mktemp -d "${TMPDIR:-/tmp}/marinara-ipa.XXXXXX")"
trap 'rm -rf "$package_temp"' EXIT
mkdir "$package_temp/Payload"
ditto "$app_path" "$package_temp/Payload/Marinara.app"
ditto -c -k --keepParent "$package_temp/Payload" "$ipa_path"
echo "Packaged the existing signed app: $ipa_path"
