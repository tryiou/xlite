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
//   3) if blocked -> checks the root-owned profile files for our expected
//      content (no aa-status: it refuses unprivileged users, so it must
//      never gate here) and, only if the profile for THIS launch mode
//      (AppImage outer file vs unpacked .bin) is missing/stale, installs +
//      loads the XLite AppImage + unpacked profiles {userns,} via
//      pkexec/apparmor_parser — one password prompt, truly once
//   4) if the parser confirms loads (or nothing was needed) -> exec now
//      (re-exec outer AppImage when inside one, else .bin); attachment
//      happens at that exec, so no re-probe (this shell predates the load
//      and could never observe it)
//   5) if loads fail -> fallback --no-sandbox with warning (functional but degraded)
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

  // Avoid double-patching on re-runs — if already patched, verify loader is up-to-date by checking for the privilege-free detection markers.
  // Size-bounded: a multi-hundred-MB ELF here means "not yet patched", never read it fully.
  try {
    await fs.access(binPath);
    let content = '';
    try {
      const st = await fs.stat(executable);
      if (st.size < 65536) content = await fs.readFile(executable, 'utf8');
    } catch (_) { /* unreadable: recreate below */ }
    if (content.includes('profile_ok') && content.includes('NEEDS_CURRENT') && content.includes('filter_args')) {
      // already patched with latest version
      return;
    }
    // outdated loader (aa-status gate or pre-marker version) — recreate
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

# Blocked — at most one password prompt, and only when actually needed.
# Detection works WITHOUT privilege: aa-status refuses unprivileged users
# ("You do not have enough privilege to read the profile set"), so a failing
# aa-status grep would re-trigger the prompt on EVERY launch even with the
# profiles installed and loaded. It must never gate here. Instead trust the
# root-owned on-disk state: our uniquely-named profiles with the expected
# attachment + userns rule. Kernel load is confirmed by the parser (rc=0) at
# install time and preserved across reboots by apparmor.service, which
# autoloads /etc/apparmor.d.
PROFILE_APPIMAGE="/etc/apparmor.d/xlite-appimage"
PROFILE_UNPACKED="/etc/apparmor.d/xlite-unpacked"
# Markers baked at build time from the profile bodies below: if the bodies
# ever change, stale files stop matching and a one-time reinstall triggers.
MARK_APPIMAGE="profile xlite-appimage /**/${productName}*.AppImage"
MARK_UNPACKED="profile xlite-unpacked /**/${executableName}.bin"
profile_ok() {
  # $1 = file, $2 = expected header marker
  [ -f "$1" ] && grep -qF "$2" "$1" 2>/dev/null && grep -q "userns," "$1" 2>/dev/null
}
NEEDS_APPIMAGE=0
NEEDS_UNPACKED=0
if ! profile_ok "$PROFILE_APPIMAGE" "$MARK_APPIMAGE"; then NEEDS_APPIMAGE=1; fi
if ! profile_ok "$PROFILE_UNPACKED" "$MARK_UNPACKED"; then NEEDS_UNPACKED=1; fi
# Only the profile for THIS launch mode gates the prompt: inside an AppImage
# the outer file needs confinement, otherwise the unpacked .bin does. The
# other profile is still (re)installed opportunistically in the same sudo
# call whenever it is missing, so each mode prompts at most once, ever.
if [ -n "\${APPIMAGE:-}" ] && [ -f "\${APPIMAGE:-}" ]; then
  NEEDS_CURRENT="$NEEDS_APPIMAGE"
else
  NEEDS_CURRENT="$NEEDS_UNPACKED"
fi
# INSTALL_OK=1 on entry means "nothing to do: the relevant profile is
# already correct on disk, $BIN attaches at its exec below". The install
# flow below resets it to 0 first and sets it back to 1 only on
# parser-confirmed loads.
# (Edge: userns blocked by sysctl rather than AppArmor with a compliant
# parser still yields rc=0 and a clean exec; Chromium then fails that launch
# visibly instead of degrading silently. Rare, and loud beats silent.)
INSTALL_OK=1
if [ "$NEEDS_CURRENT" = "1" ]; then
  # Friendly pre-notify before pkexec (proper message) — explains one-time sandbox setup
  if command -v zenity >/dev/null 2>&1; then
    zenity --info --title="XLite — One-time setup" --text="XLite needs to install AppArmor profiles to keep the Chromium sandbox enabled on this system (unprivileged user namespaces are restricted).\\n\\nYou will be asked for your password once. This is required only once." --width 420 2>/dev/null || true
  elif command -v kdialog >/dev/null 2>&1; then
    kdialog --msgbox "XLite needs to install AppArmor profiles to keep the Chromium sandbox enabled on this system. You will be asked for your password once." 2>/dev/null || true
  fi
  # Install + load, trusting the parser result — never re-probe here.
  # Attachment happens at exec, so this already-running shell can never gain
  # the confinement $BIN will inherit at its own exec below; a re-probe would
  # test the wrong process context and always fail. Parser rc=0 is the
  # kernel's own acknowledgment and the only guarantee $BIN needs (its
  # attachment path is unit-locked to the profile).
  INSTALL_OK=0
  if command -v pkexec >/dev/null 2>&1; then
    PK_RC=0
    pkexec sh -c '
      mkdir -p /etc/apparmor.d
      # Resolve the parser INSIDE the privileged shell: absolute paths first
      # (a user shell may lack sbin in PATH while root has it, or vice versa).
      PARSER_BIN=""
      for _p in /usr/sbin/apparmor_parser /sbin/apparmor_parser; do
        if [ -x "$_p" ]; then PARSER_BIN="$_p"; break; fi
      done
      if [ -z "$PARSER_BIN" ]; then PARSER_BIN="$(command -v apparmor_parser || true)"; fi
      FAIL=0
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
        if "$PARSER_BIN" -r /etc/apparmor.d/xlite-appimage; then
          echo "XLite: loaded xlite-appimage profile." >&2
        else
          echo "XLite: apparmor_parser xlite-appimage failed (rc=$?)." >&2
          FAIL=1
        fi
        if "$PARSER_BIN" -r /etc/apparmor.d/xlite-unpacked; then
          echo "XLite: loaded xlite-unpacked profile." >&2
        else
          echo "XLite: apparmor_parser xlite-unpacked failed (rc=$?)." >&2
          FAIL=1
        fi
      else
        echo "XLite: apparmor_parser not found; profiles written but not loaded." >&2
        echo "XLite: load them manually: sudo apparmor_parser -r /etc/apparmor.d/xlite-appimage" >&2
        FAIL=1
      fi
      exit $FAIL
    ' || PK_RC=$?
    if [ "$PK_RC" = "0" ]; then
      INSTALL_OK=1
    fi
  elif command -v sudo >/dev/null 2>&1 && [ -t 0 ]; then
    echo "XLite: Installing AppArmor profiles for sandbox (requires sudo, one-time)..." >&2
    SU_RC=0
    sudo sh -c '
      mkdir -p /etc/apparmor.d
      # Same inside-privilege parser resolution as the pkexec branch above.
      PARSER_BIN=""
      for _p in /usr/sbin/apparmor_parser /sbin/apparmor_parser; do
        if [ -x "$_p" ]; then PARSER_BIN="$_p"; break; fi
      done
      if [ -z "$PARSER_BIN" ]; then PARSER_BIN="$(command -v apparmor_parser || true)"; fi
      FAIL=0
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
        if "$PARSER_BIN" -r /etc/apparmor.d/xlite-appimage; then
          echo "XLite: loaded xlite-appimage profile." >&2
        else
          echo "XLite: apparmor_parser xlite-appimage failed (rc=$?)." >&2
          FAIL=1
        fi
        if "$PARSER_BIN" -r /etc/apparmor.d/xlite-unpacked; then
          echo "XLite: loaded xlite-unpacked profile." >&2
        else
          echo "XLite: apparmor_parser xlite-unpacked failed (rc=$?)." >&2
          FAIL=1
        fi
      else
        echo "XLite: apparmor_parser not found; profiles written but not loaded." >&2
        echo "XLite: load them manually: sudo apparmor_parser -r /etc/apparmor.d/xlite-appimage" >&2
        FAIL=1
      fi
      exit $FAIL
    ' || SU_RC=$?
    if [ "$SU_RC" = "0" ]; then
      INSTALL_OK=1
    fi
  else
    echo "XLite: no privilege helper (pkexec/sudo) available; continuing without sandbox profiles." >&2
  fi
fi

# Parser-confirmed loaded above: attachment happens at the next exec, so exec
# now — never re-probe here (this shell predates the load and can never gain
# the confinement $BIN is about to inherit). Re-exec the outer AppImage when
# inside one (fresh attach for the whole tree), else exec $BIN directly.
if [ "$INSTALL_OK" = "1" ]; then
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
