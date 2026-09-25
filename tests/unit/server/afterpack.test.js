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
    // ...defaulting to trust (NEEDS=0 means files exist AND aa-status
    // confirmed them loaded), reset to 0 on entering the install flow...
    expect(loader).toContain('INSTALL_OK=1\nif [ "$NEEDS_APPIMAGE"');
    // ...not a re-probe: no can_unshare call may follow the install block.
    const installAt = loader.indexOf('INSTALL_OK=1');
    expect(loader.indexOf('can_unshare', installAt)).toBe(-1);
  });
});
