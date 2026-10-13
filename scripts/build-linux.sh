#!/usr/bin/env bash
# Build DSH Office for Linux x64 from the official Electron prebuilt.
# Run on Linux (or in the provided Docker image): bash scripts/build-linux.sh
#
# Output:
#   dist/dsh-office-linux-x64/          portable folder (binary + resources)
#   dist/dsh-office-linux-x64.tar.gz    distributable archive
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VER="39.8.5"
ARCH="linux-x64"
NAME="dsh-office-${ARCH}"
ZIP="electron-v${VER}-${ARCH}.zip"
CACHE="${ELECTRON_CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/electron}"
DIST="$ROOT/dist/$NAME"
OUT_ZIP="$ROOT/dist/$NAME.tar.gz"
MIRROR="${ELECTRON_MIRROR:-https://github.com/electron/electron/releases/download/}"
URL="${MIRROR%/}/v${VER}/${ZIP}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }; }
need curl

if [ ! -f "$CACHE/$ZIP" ]; then
  echo "downloading $URL"
  mkdir -p "$CACHE"
  curl -fL --retry 3 --connect-timeout 20 -o "$CACHE/$ZIP.tmp" "$URL"
  mv "$CACHE/$ZIP.tmp" "$CACHE/$ZIP"
fi

rm -rf "$DIST"
mkdir -p "$DIST"
# Regenerate icon.ico + 256px icon.png from the pixel-art source script.
if command -v node >/dev/null 2>&1; then
  node "$ROOT/scripts/make-icon.cjs" "$ROOT/app/icon.ico" >/dev/null || true
fi
if command -v unzip >/dev/null 2>&1; then
  (cd "$DIST" && unzip -q "$CACHE/$ZIP")
elif command -v python3 >/dev/null 2>&1; then
  python3 -m zipfile -e "$CACHE/$ZIP" "$DIST"
else
  echo "need unzip or python3 to extract Electron" >&2; exit 1
fi

# Ship the app unpacked (same layout as the Windows build).
rm -f "$DIST/resources/default_app.asar"
rm -rf "$DIST/resources/app"
cp -r "$ROOT/app" "$DIST/resources/app"

# Rename the Electron binary; the Chromium SUID sandbox stays beside it.
mv -f "$DIST/electron" "$DIST/dsh-office"
chmod 0755 "$DIST/dsh-office"
[ -f "$DIST/chrome-sandbox" ] && chmod 4755 "$DIST/chrome-sandbox" || true

cp "$ROOT/app/icon.png" "$DIST/dsh-office.png"

# Launcher: adds --no-sandbox only where the OS sandbox genuinely can't work
# (running as root in a container, or the user opted in with DSH_OFFICE_NO_SANDBOX=1).
cat > "$DIST/DSH Office.sh" <<'LAUNCH'
#!/usr/bin/env bash
HERE="$(cd "$(dirname "$0")" && pwd)"
ARGS=()
if [ "${DSH_OFFICE_NO_SANDBOX:-}" = "1" ] || [ "$(id -u)" = "0" ]; then
  ARGS=(--no-sandbox --disable-gpu-sandbox)
fi
exec "$HERE/dsh-office" "${ARGS[@]}" "$@"
LAUNCH
chmod 0755 "$DIST/DSH Office.sh"

# Desktop template; install.sh substitutes the final install directory.
cat > "$DIST/dsh-office.desktop.in" <<'DESKTOP'
[Desktop Entry]
Name=DSH Office
Name[zh_CN]=DSH 办公室
Comment=Pixel-office multi-agent desktop app over DeepSeek Harness
Comment[zh_CN]=DeepSeek Harness 像素办公室：多 Agent 协作桌面应用
Exec=__APP_DIR__/DSH Office.sh %U
Icon=__APP_DIR__/dsh-office.png
Terminal=false
Type=Application
Categories=Development;Office;
StartupWMClass=DSH Office
DESKTOP

# Per-user installer: puts the folder under ~/Applications and registers it.
cat > "$DIST/install.sh" <<'INSTALL'
#!/usr/bin/env bash
set -euo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${DSH_OFFICE_HOME:-$HOME/Applications/dsh-office}"
mkdir -p "$(dirname "$TARGET")"
if [ "$SRC" != "$TARGET" ]; then
  rm -rf "$TARGET"
  cp -r "$SRC" "$TARGET"
fi
chmod +x "$TARGET/dsh-office" "$TARGET/DSH Office.sh" 2>/dev/null || true
APPS="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
ICONS="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/256x256/apps"
mkdir -p "$APPS" "$ICONS"
cp "$TARGET/dsh-office.png" "$ICONS/dsh-office.png"
sed "s#__APP_DIR__#$TARGET#g" "$TARGET/dsh-office.desktop.in" > "$APPS/dsh-office.desktop"
chmod +x "$APPS/dsh-office.desktop"
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPS" || true
echo "installed to $TARGET"
INSTALL
chmod 0755 "$DIST/install.sh"

# Build-time convenience: a .desktop pointing at this exact folder.
sed "s#__APP_DIR__#$DIST#g" "$DIST/dsh-office.desktop.in" > "$DIST/dsh-office.desktop"

tar -czf "$OUT_ZIP" -C "$ROOT/dist" "$NAME"
echo "built:"
echo "  folder $DIST"
echo "  tarball $OUT_ZIP"
