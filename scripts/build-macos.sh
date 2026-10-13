#!/usr/bin/env bash
# Build DSH Office for macOS (arm64 = Apple Silicon, x64 = Intel).
# Run ON a macOS machine/runner:
#   bash scripts/build-macos.sh arm64
#   bash scripts/build-macos.sh x64
# The app is ad-hoc signed (no Apple Developer certificate): on first launch
# the user right-clicks → Open, or runs:  xattr -dr com.apple.quarantine "DSH Office.app"
#
# Output:
#   dist/DSH Office-<arch>.app/                 unpacked application
#   dist/DSH-Office-macos-<arch>.zip            distributable (preserves symlinks)
#   dist/DSH-Office-macos-<arch>.tar.gz         same payload as tarball
set -euo pipefail

ARCH="${1:-$(uname -m)}"
case "$ARCH" in
  arm64|aarch64) ARCH="arm64" ;;
  x64|amd64)     ARCH="x64" ;;
  *) echo "unknown arch: $1 (expected arm64 or x64)" >&2; exit 1 ;;
esac
[ "$(uname -s)" = "Darwin" ] || { echo "build-macos.sh must run on macOS" >&2; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VER="39.8.5"
EL_ARCH="darwin-$ARCH"
ZIP="electron-v${VER}-${EL_ARCH}.zip"
CACHE="${ELECTRON_CACHE:-$HOME/Library/Caches/electron}"
APP="DSH Office"
DIST_APP="$ROOT/dist/$APP-$ARCH.app"
OUT_ZIP="$ROOT/dist/DSH-Office-macos-$ARCH.zip"
OUT_TGZ="$ROOT/dist/DSH-Office-macos-$ARCH.tar.gz"
MIRROR="${ELECTRON_MIRROR:-https://github.com/electron/electron/releases/download/}"
URL="${MIRROR%/}/v${VER}/${ZIP}"

if [ ! -f "$CACHE/$ZIP" ]; then
  echo "downloading $URL"
  mkdir -p "$CACHE"
  curl -fL --retry 3 --connect-timeout 20 -o "$CACHE/$ZIP.tmp" "$URL"
  mv "$CACHE/$ZIP.tmp" "$CACHE/$ZIP"
fi

rm -rf "$DIST_APP"
mkdir -p "$(dirname "$DIST_APP")"
# unzip keeps the .app bundle structure and symlinks intact
ditto -x -k "$CACHE/$ZIP" "$ROOT/dist/_extract-$ARCH"
mv "$ROOT/dist/_extract-$ARCH/Electron.app" "$DIST_APP"
rm -rf "$ROOT/dist/_extract-$ARCH"

RES="$DIST_APP/Contents/Resources"
rm -f "$RES/default_app.asar"
rm -rf "$RES/app"
cp -R "$ROOT/app" "$RES/app"

# ---- bundle metadata ----
PLIST="$DIST_APP/Contents/Info.plist"
BUNDLE_EXE=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$PLIST")
mv "$DIST_APP/Contents/MacOS/$BUNDLE_EXE" "$DIST_APP/Contents/MacOS/$APP"
/usr/libexec/PlistBuddy -c "Set :CFBundleExecutable $APP" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleName 'DSH Office'" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName 'DSH Office'" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier com.dsh.office" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString 1.0.0" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion 1.0.0" "$PLIST"
/usr/libexec/PlistBuddy -c "Delete :CFBundleIconFile" "$PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :CFBundleIconFile string icon.icns" "$PLIST"
/usr/libexec/PlistBuddy -c "Add :NSHighResolutionCapable bool true" "$PLIST" 2>/dev/null || true

# ---- icon.icns from a crisp 1024px render (sips + iconutil ship with macOS) ----
ICONSET="$ROOT/dist/icon-$ARCH.iconset"
rm -rf "$ICONSET"; mkdir -p "$ICONSET"
SRC="$ROOT/dist/icon-src-1024.png"
node "$ROOT/scripts/make-icon.cjs" /tmp/dsh-office-icon.ico "$SRC" 1024
for spec in "16 icon_16x16.png" "32 icon_16x16@2x.png" "32 icon_32x32.png" "64 icon_32x32@2x.png" \
            "128 icon_128x128.png" "256 icon_128x128@2x.png" "256 icon_256x256.png" "512 icon_256x256@2x.png" \
            "512 icon_512x512.png" "1024 icon_512x512@2x.png"; do
  set -- $spec
  sips -z "$1" "$1" "$SRC" --out "$ICONSET/$2" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$RES/icon.icns"
rm -rf "$ICONSET"

# ---- ad-hoc signature (no Apple Developer ID) ----
codesign --force --deep --sign - "$DIST_APP" --options runtime 2>/dev/null || codesign --force --deep --sign - "$DIST_APP"

# ---- distributables: ditto zip preserves the bundle; tar.gz as a fallback ----
rm -f "$OUT_ZIP" "$OUT_TGZ"
ditto -c -k --keepParent "$DIST_APP" "$OUT_ZIP"
tar -czf "$OUT_TGZ" -C "$ROOT/dist" "$(basename "$DIST_APP")"

echo "built ($ARCH):"
echo "  $DIST_APP"
echo "  $OUT_ZIP"
echo "  $OUT_TGZ"
