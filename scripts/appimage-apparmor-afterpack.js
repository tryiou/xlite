// afterPack hook for electron-builder: AppImage sandbox-preserving AppArmor loader
// Keeps the Chromium userns sandbox on systems that restrict unprivileged
// user namespaces, via XLite-scoped AppArmor profiles + pkexec.
// See: electron#41066, electron-builder#8635/#8636, Launchpad#2046844, tamim.blog
//
// What it does on Linux:
// - Renames the electron executable (e.g. xlite -> xlite.bin) to <name>.bin
// - Writes a loader at XLite that:
//   1) probes `unshare -Ur true` (true ns test, as in PR #9590)
//   2) if OK -> exec .bin (sandbox kept)
//   3) if blocked -> tries once to install the XLite AppImage + unpacked profiles {userns,} via pkexec/apparmor_parser
//   4) re-probes; if now OK and we are inside AppImage ($APPIMAGE set) re-exec outer AppImage so profile attaches, else exec .bin
//   5) still blocked -> fallback --no-sandbox with warning (functional but degraded)
//
// This preserves sandbox for AppImage after one password prompt. The hook
// runs for every linux target (AppImage/deb/tar.gz); where userns already
// works the loader is a transparent passthrough to the renamed binary.
// AppRun itself is not patched — we patch the binary that AppRun execs, which is how gergof/electron-builder-sandbox-fix works.

const fs = require('fs/promises');
const path = require('path');

async function afterPack(context) {
  const { electronPlatformName, appOutDir, packager } = context;

  if (electronPlatformName !== 'linux') return;

  const executableName = packager.executableName; // e.g. xlite (lowercase in production)
  const productName = packager.appInfo.productName; // e.g. XLite
  // Profile bodies derive from the real names: the unpacked attachment must
  // match the renamed binary exactly (BIN below), the AppImage attachment
  // the distributed artifact name. Never hardcode either.
  const profileAppimageBody = `abi <abi/4.0>,
include <tunables/global>
profile xlite-appimage /**/${productName}*.AppImage flags=(unconfined) {
  userns,
  include if exists <local/xlite-appimage>
}`;
  const profileUnpackedBody = `abi <abi/4.0>,
include <tunables/global>
profile xlite-unpacked /**/${executableName}.bin flags=(unconfined) {
  userns,
  include if exists <local/xlite-unpacked>
}`;
  const executable = path.join(appOutDir, executableName);
  const binPath = executable + '.bin';

  // Ensure executable exists
  try {
    await fs.access(executable);
  } catch (_) {
    // Nothing to patch (e.g. unpacked dir not yet created for this target)
    return;
  }

  // Avoid double-patching on re-runs — if already patched, verify loader is up-to-date by checking for xlite-unpacked marker.
  // Size-bounded: a multi-hundred-MB ELF here means "not yet patched", never read it fully.
  try {
    await fs.access(binPath);
    let content = '';
    try {
      const st = await fs.stat(executable);
      if (st.size < 65536) content = await fs.readFile(executable, 'utf8');
    } catch (_) { /* unreadable: recreate below */ }
    if (content.includes('xlite-unpacked') && content.includes('filter_args')) {
      // already patched with latest version
      return;
    }
    // outdated loader (before unpacked fix) — recreate
    try { await fs.unlink(executable); } catch (_) { /* already gone */ }
    await fs.rename(binPath, executable);
  } catch (_) { /* nothing staged to restore */ }

  // Loader script — keep it POSIX bash, no extra deps except pkexec/apparmor_parser/unshare
  const loaderScript = `#!/usr/bin/env bash
set -u

# Resolve script dir (handles symlink /usr/bin -> /opt)
SCRIPT_DIR="$( cd "$( dirname "\${BASH_SOURCE[0]}" )" && pwd )"
if [ "$SCRIPT_DIR" = "/usr/bin" ]; then
  SCRIPT_DIR="/opt/${productName}"
fi
BIN="$SCRIPT_DIR/${executableName}.bin"

# Helper: test if userns works (same as electron-builder PR #9590)
can_unshare() {
  unshare -Ur true 2>/dev/null
}

# Helper: filter out --no-sandbox when sandbox can be kept (desktop file Exec=AppRun --no-sandbox)
filter_args() {
  FILTERED=()
  for a in "$@"; do
    if [ "$a" != "--no-sandbox" ]; then
      FILTERED+=("$a")
    fi
  done
}

# Fast path: userns already works (no restriction, or an installed profile already allows it)
# Strip --no-sandbox coming from AppImage desktop Exec=AppRun --no-sandbox so we keep sandbox
if can_unshare; then
  filter_args "$@"
  exec "$BIN" \${FILTERED[@]+"\${FILTERED[@]}"}
fi

# Blocked — one sudo call max: install both AppArmor profiles (AppImage + unpacked) if needed
PROFILE_APPIMAGE="/etc/apparmor.d/xlite-appimage"
PROFILE_UNPACKED="/etc/apparmor.d/xlite-unpacked"
NEEDS_APPIMAGE=0
NEEDS_UNPACKED=0
if [ ! -f "$PROFILE_APPIMAGE" ]; then NEEDS_APPIMAGE=1; fi
if [ ! -f "$PROFILE_UNPACKED" ]; then NEEDS_UNPACKED=1; fi
if command -v aa-status >/dev/null 2>&1; then
  if ! aa-status 2>/dev/null | grep -q "xlite-appimage"; then
    if [ -f "$PROFILE_APPIMAGE" ]; then NEEDS_APPIMAGE=1; fi
  else
    NEEDS_APPIMAGE=0
  fi
  if ! aa-status 2>/dev/null | grep -q "xlite-unpacked"; then
    if [ -f "$PROFILE_UNPACKED" ]; then NEEDS_UNPACKED=1; fi
  else
    NEEDS_UNPACKED=0
  fi
fi
if [ "$NEEDS_APPIMAGE" = "1" ] || [ "$NEEDS_UNPACKED" = "1" ]; then
  # Friendly pre-notify before pkexec (proper message) — explains one-time sandbox setup
  if command -v zenity >/dev/null 2>&1; then
    zenity --info --title="XLite — One-time setup" --text="XLite needs to install AppArmor profiles to keep the Chromium sandbox enabled on this system (unprivileged user namespaces are restricted).\\n\\nYou will be asked for your password once. This is required only once." --width 420 2>/dev/null || true
  elif command -v kdialog >/dev/null 2>&1; then
    kdialog --msgbox "XLite needs to install AppArmor profiles to keep the Chromium sandbox enabled on this system. You will be asked for your password once." 2>/dev/null || true
  fi
  if command -v pkexec >/dev/null 2>&1; then
    pkexec sh -c '
      mkdir -p /etc/apparmor.d
      # Resolve the parser INSIDE the privileged shell: absolute paths first
      # (a user shell may lack sbin in PATH while root has it, or vice versa).
      PARSER_BIN=""
      for _p in /usr/sbin/apparmor_parser /sbin/apparmor_parser; do
        if [ -x "$_p" ]; then PARSER_BIN="$_p"; break; fi
      done
      if [ -z "$PARSER_BIN" ]; then PARSER_BIN="$(command -v apparmor_parser || true)"; fi
      if [ "'$NEEDS_APPIMAGE'" = "1" ]; then
        cat > /etc/apparmor.d/xlite-appimage <<'\\''APPARMOR_EOF'\\''
${profileAppimageBody}
APPARMOR_EOF
      fi
      if [ "'$NEEDS_UNPACKED'" = "1" ]; then
        cat > /etc/apparmor.d/xlite-unpacked <<'\\''APPARMOR_EOF'\\''
${profileUnpackedBody}
APPARMOR_EOF
      fi
      if [ -n "$PARSER_BIN" ]; then
        "$PARSER_BIN" -r /etc/apparmor.d/xlite-appimage
        echo "XLite: apparmor_parser xlite-appimage rc=$?" >&2
        "$PARSER_BIN" -r /etc/apparmor.d/xlite-unpacked
        echo "XLite: apparmor_parser xlite-unpacked rc=$?" >&2
      else
        echo "XLite: apparmor_parser not found; profiles written but not loaded." >&2
        echo "XLite: load them manually: sudo apparmor_parser -r /etc/apparmor.d/xlite-appimage" >&2
      fi
    ' || echo "XLite: privileged install step failed; continuing without sandbox profiles." >&2
  elif command -v sudo >/dev/null 2>&1 && [ -t 0 ]; then
    echo "XLite: Installing AppArmor profiles for sandbox (requires sudo, one-time)..." >&2
    sudo sh -c '
      mkdir -p /etc/apparmor.d
      # Same inside-privilege parser resolution as the pkexec branch above.
      PARSER_BIN=""
      for _p in /usr/sbin/apparmor_parser /sbin/apparmor_parser; do
        if [ -x "$_p" ]; then PARSER_BIN="$_p"; break; fi
      done
      if [ -z "$PARSER_BIN" ]; then PARSER_BIN="$(command -v apparmor_parser || true)"; fi
      if [ "'$NEEDS_APPIMAGE'" = "1" ]; then
        cat > /etc/apparmor.d/xlite-appimage <<'\\''APPARMOR_EOF'\\''
${profileAppimageBody}
APPARMOR_EOF
      fi
      if [ "'$NEEDS_UNPACKED'" = "1" ]; then
        cat > /etc/apparmor.d/xlite-unpacked <<'\\''APPARMOR_EOF'\\''
${profileUnpackedBody}
APPARMOR_EOF
      fi
      if [ -n "$PARSER_BIN" ]; then
        "$PARSER_BIN" -r /etc/apparmor.d/xlite-appimage
        echo "XLite: apparmor_parser xlite-appimage rc=$?" >&2
        "$PARSER_BIN" -r /etc/apparmor.d/xlite-unpacked
        echo "XLite: apparmor_parser xlite-unpacked rc=$?" >&2
      else
        echo "XLite: apparmor_parser not found; profiles written but not loaded." >&2
        echo "XLite: load them manually: sudo apparmor_parser -r /etc/apparmor.d/xlite-appimage" >&2
      fi
    ' || true
  fi
fi

# Re-probe after attempted install
if can_unshare; then
  # Inside AppImage, need to re-exec outer AppImage so the AppImage profile attaches to outer path
  if [ -n "\${APPIMAGE:-}" ] && [ -f "\${APPIMAGE:-}" ]; then
    # Avoid infinite loop: only re-exec if we haven't already
    if [ "\${XLITE_SANDBOX_REEXEC:-0}" != "1" ]; then
      export XLITE_SANDBOX_REEXEC=1
      filter_args "$@"
      exec "$APPIMAGE" \${FILTERED[@]+"\${FILTERED[@]}"}
    fi
  fi
  filter_args "$@"
  exec "$BIN" \${FILTERED[@]+"\${FILTERED[@]}"}
fi

# Still blocked — last resort: degraded launch (sandbox disabled) so app still starts
# Ensure --no-sandbox is present exactly once
NEED_SANDBOX=1
for a in "$@"; do
  if [ "$a" = "--no-sandbox" ]; then
    NEED_SANDBOX=0
    break
  fi
done
if [ "$NEED_SANDBOX" = "1" ]; then
  echo "XLite: AppArmor userns blocked and profile not installed/cancelled. Running with --no-sandbox (sandbox disabled). Install profile for full sandbox: sudo apparmor_parser -r /etc/apparmor.d/xlite-appimage" >&2
  exec "$BIN" --no-sandbox "$@"
else
  echo "XLite: AppArmor userns blocked. Running with --no-sandbox (sandbox disabled)." >&2
  exec "$BIN" "$@"
fi
`;

  try {
    await fs.rename(executable, binPath);
    await fs.writeFile(executable, loaderScript, { mode: 0o755 });
    await fs.chmod(executable, 0o755);
    console.log(`  • XLite AppArmor loader installed for ${executableName} (sandbox-preserving XLite profiles + pkexec)`);
  } catch (e) {
    console.error(`  • Failed to install XLite sandbox loader: ${e.message}`);
    throw e;
  }
}

module.exports = afterPack;
module.exports.default = afterPack;
