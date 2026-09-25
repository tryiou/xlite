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
});
