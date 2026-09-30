import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {execFileSync} from 'child_process';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';

import afterPack from '../../../scripts/appimage-apparmor-afterpack.js';

let hasBash = false;
try {
  execFileSync('bash', ['--version'], {stdio: 'ignore'});
  hasBash = true;
} catch (_) { /* no bash here: syntax lock skipped */ }

// Production case: executableName is lowercase (electron-builder), the
// distributed artifact keeps the productName case (XLite-*.AppImage).
function linuxCtx(dir, exe = 'xlite', prod = 'XLite') {
  return {
    electronPlatformName: 'linux',
    appOutDir: dir,
    packager: {executableName: exe, appInfo: {productName: prod}},
  };
}

let workDir;

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'afterpack-'));
});

afterEach(() => {
  fs.removeSync(workDir);
});

describe('appimage-apparmor-afterpack', () => {
  it('is a no-op on non-linux platforms', async () => {
    await afterPack({...linuxCtx(workDir), electronPlatformName: 'darwin'});
    expect(fs.readdirSync(workDir)).toEqual([]);
  });

  it('is a no-op when the executable is absent', async () => {
    await afterPack(linuxCtx(path.join(workDir, 'missing')));
  });

  it('renames the executable and installs a consistently-named loader', async () => {
    fs.writeFileSync(path.join(workDir, 'xlite'), 'FAKE-ELF');
    await afterPack(linuxCtx(workDir));
    expect(fs.existsSync(path.join(workDir, 'xlite.bin'))).toBe(true);
    const loader = fs.readFileSync(path.join(workDir, 'xlite'), 'utf8');
    expect(loader.startsWith('#!/usr/bin/env bash')).toBe(true);
    // Attachment paths must match the real names: BIN basename in the
    // unpacked profile, artifact name in the AppImage profile.
    expect(loader).toContain('BIN="$SCRIPT_DIR/xlite.bin"');
    expect(loader).toContain('profile xlite-unpacked /**/xlite.bin');
    expect(loader).toContain('profile xlite-appimage /**/XLite*.AppImage');
    expect(loader).not.toContain('/**/*.AppImage');
    expect((fs.statSync(path.join(workDir, 'xlite')).mode & 0o777)).toBe(0o755);
  });

  it('writes the matching profile body in each privileged branch', async () => {
    fs.writeFileSync(path.join(workDir, 'xlite'), 'FAKE-ELF');
    await afterPack(linuxCtx(workDir));
    const loader = fs.readFileSync(path.join(workDir, 'xlite'), 'utf8');
    // Both the pkexec and the sudo branch must install the appimage body
    // into xlite-appimage and the unpacked body into xlite-unpacked.
    for (const [file, profile] of [
      ['xlite-appimage', 'profile xlite-appimage /**/XLite*.AppImage'],
      ['xlite-unpacked', 'profile xlite-unpacked /**/xlite.bin'],
    ]) {
      let idx = -1;
      let count = 0;
      const marker = `cat > /etc/apparmor.d/${file}`;
      while ((idx = loader.indexOf(marker, idx + 1)) !== -1) {
        count++;
        // Closing delimiter is a bare APPARMOR_EOF line (the opening
        // <<'...' carries the name inline and must not match).
        const end = loader.indexOf('\nAPPARMOR_EOF\n', idx);
        expect(end).toBeGreaterThan(idx);
        expect(loader.slice(idx, end)).toContain(profile);
      }
      expect(count).toBe(2);
    }
  });

  it('is idempotent across re-runs', async () => {
    fs.writeFileSync(path.join(workDir, 'xlite'), 'FAKE-ELF');
    await afterPack(linuxCtx(workDir));
    const first = fs.readFileSync(path.join(workDir, 'xlite'), 'utf8');
    await afterPack(linuxCtx(workDir));
    const second = fs.readFileSync(path.join(workDir, 'xlite'), 'utf8');
    expect(second).toBe(first);
    expect(fs.readFileSync(path.join(workDir, 'xlite.bin'), 'utf8')).toBe('FAKE-ELF');
  });

  it('upgrades an outdated loader without the current marker', async () => {
    fs.writeFileSync(path.join(workDir, 'xlite'), '#!/usr/bin/env bash\nold loader\n');
    fs.writeFileSync(path.join(workDir, 'xlite.bin'), 'FAKE-ELF');
    await afterPack(linuxCtx(workDir));
    const loader = fs.readFileSync(path.join(workDir, 'xlite'), 'utf8');
    expect(loader).toContain('profile xlite-appimage /**/XLite*.AppImage');
    expect(fs.readFileSync(path.join(workDir, 'xlite.bin'), 'utf8')).toBe('FAKE-ELF');
  });

  it('upgrades the previous aa-status-gated loader instead of keeping it', async () => {
    // The shipped-then-buggy loader contained the profile bodies and
    // filter_args but decided via `aa-status | grep` — it re-prompted every
    // launch for unprivileged users. It must not pass the freshness check.
    fs.writeFileSync(
      path.join(workDir, 'xlite'),
      '#!/usr/bin/env bash\n# aa-status era\nBIN="$SCRIPT_DIR/xlite.bin"\nfilter_args() { :; }\nprofile xlite-unpacked /**/xlite.bin\nif command -v aa-status >/dev/null 2>&1; then\n :; \nfi\n'
    );
    fs.writeFileSync(path.join(workDir, 'xlite.bin'), 'FAKE-ELF');
    await afterPack(linuxCtx(workDir));
    const loader = fs.readFileSync(path.join(workDir, 'xlite'), 'utf8');
    expect(loader).toContain('profile_ok');
    expect(loader).toContain('NEEDS_CURRENT');
    // No aa-status invocation (a comment may name it, but it must never run:
    // unprivileged users get no profile list, so executing it re-prompts).
    expect(loader).not.toMatch(/aa-status\s+2?>/);
    expect(loader).not.toContain('command -v aa-status');
    expect(fs.readFileSync(path.join(workDir, 'xlite.bin'), 'utf8')).toBe('FAKE-ELF');
  });

  it('never gates the install prompt on aa-status (unprivileged users get no profile list)', async () => {
    fs.writeFileSync(path.join(workDir, 'xlite'), 'FAKE-ELF');
    await afterPack(linuxCtx(workDir));
    const loader = fs.readFileSync(path.join(workDir, 'xlite'), 'utf8');
    expect(loader).not.toMatch(/aa-status\s+2?>/);
    expect(loader).not.toContain('command -v aa-status');
  });

  it('gates the prompt on profile file content, scoped to the launch mode', async () => {
    fs.writeFileSync(path.join(workDir, 'xlite'), 'FAKE-ELF');
    await afterPack(linuxCtx(workDir));
    const loader = fs.readFileSync(path.join(workDir, 'xlite'), 'utf8');
    // Build-time markers must exactly match the shipped profile bodies.
    expect(loader).toContain('MARK_APPIMAGE="profile xlite-appimage /**/XLite*.AppImage"');
    expect(loader).toContain('MARK_UNPACKED="profile xlite-unpacked /**/xlite.bin"');
    expect(loader).toContain('profile_ok() {');
    // Only the relevant profile decides: AppImage run -> appimage profile,
    // unpacked run -> unpacked profile.
    expect(loader).toContain('NEEDS_CURRENT="$NEEDS_APPIMAGE"');
    expect(loader).toContain('NEEDS_CURRENT="$NEEDS_UNPACKED"');
    expect(loader).toContain('if [ "$NEEDS_CURRENT" = "1" ]; then');
  });

  it.runIf(hasBash)('shipped profile_ok predicate accepts current profiles, rejects stale ones', async () => {
    fs.writeFileSync(path.join(workDir, 'xlite'), 'FAKE-ELF');
    await afterPack(linuxCtx(workDir));
    const loader = fs.readFileSync(path.join(workDir, 'xlite'), 'utf8');
    // Extract the shipped predicate verbatim — this tests the real code,
    // not a copy of it.
    const fnStart = loader.indexOf('profile_ok() {');
    expect(fnStart).toBeGreaterThan(-1);
    const fnEnd = loader.indexOf('\n}\n', fnStart);
    expect(fnEnd).toBeGreaterThan(fnStart);
    const fn = loader.slice(fnStart, fnEnd + 3);
    const markApp = loader.match(/MARK_APPIMAGE="([^"]+)"/)[1];
    const markUnp = loader.match(/MARK_UNPACKED="([^"]+)"/)[1];
    const dir = workDir.replace(/'/g, `'\\''`);
    const script = `${fn}
MARK_APPIMAGE='${markApp}'
MARK_UNPACKED='${markUnp}'
set -e
D='${dir}'
printf 'abi <abi/4.0>,\\ninclude <tunables/global>\\nprofile xlite-appimage /**/XLite*.AppImage flags=(unconfined) {\\n  userns,\\n}\\n' > "$D/good-app"
printf 'abi <abi/4.0>,\\nprofile xlite-unpacked /**/xlite.bin flags=(unconfined) {\\n  userns,\\n}\\n' > "$D/good-unp"
printf 'old body without marker\\n' > "$D/stale"
profile_ok "$D/good-app" "$MARK_APPIMAGE" || { echo "FAIL: good appimage rejected" >&2; exit 1; }
profile_ok "$D/good-unp" "$MARK_UNPACKED" || { echo "FAIL: good unpacked rejected" >&2; exit 1; }
profile_ok "$D/stale" "$MARK_UNPACKED" && { echo "FAIL: stale accepted" >&2; exit 1; }
profile_ok "$D/missing" "$MARK_UNPACKED" && { echo "FAIL: missing accepted" >&2; exit 1; }
echo PROFILE_OK_PREDICATE_GREEN
`;
    const out = execFileSync('bash', ['-c', script], {encoding: 'utf8'});
    expect(out).toContain('PROFILE_OK_PREDICATE_GREEN');
  });

  it.runIf(hasBash)('generated loader passes bash syntax check', async () => {
    fs.writeFileSync(path.join(workDir, 'xlite'), 'FAKE-ELF');
    await afterPack(linuxCtx(workDir));
    const loaderPath = path.join(workDir, 'xlite');
    execFileSync('bash', ['-n', loaderPath], {stdio: 'ignore'});
  });

  it('gates post-install exec on parser success, never re-probes', async () => {
    fs.writeFileSync(path.join(workDir, 'xlite'), 'FAKE-ELF');
    await afterPack(linuxCtx(workDir));
    const loader = fs.readFileSync(path.join(workDir, 'xlite'), 'utf8');
    // Decision signal is the privileged block's exit status...
    expect(loader).toContain('exit $FAIL');
    // ...defaulting to trust (NEEDS_CURRENT=0 means the relevant profile
    // file is already correct on disk), reset to 0 on entering the install
    // flow...
    expect(loader).toContain('INSTALL_OK=1\nif [ "$NEEDS_CURRENT"');
    // ...not a re-probe: no can_unshare call may follow the install block.
    const installAt = loader.indexOf('INSTALL_OK=1');
    expect(loader.indexOf('can_unshare', installAt)).toBe(-1);
  });
});
