import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';

import {DEFAULT_MASTER_PORT} from '../../../../src/app/constants/index.js';

let homeDir;
let savedHome;
let savedAppData;

function writeConf(obj) {
  const dir = path.join(homeDir, 'xlite-daemon', 'settings');
  fs.ensureDirSync(dir);
  if (typeof obj === 'string') {
    fs.writeFileSync(path.join(dir, 'config-master.json'), obj);
  } else {
    fs.writeJsonSync(path.join(dir, 'config-master.json'), obj);
  }
}

beforeEach(() => {
  savedHome = process.env.HOME;
  savedAppData = process.env.APPDATA;
  delete process.env.APPDATA;
  homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfghelper-'));
  process.env.HOME = homeDir;
});

afterEach(() => {
  process.env.HOME = savedHome;
  if (savedAppData === undefined) {
    delete process.env.APPDATA;
  } else {
    process.env.APPDATA = savedAppData;
  }
  fs.removeSync(homeDir);
});

describe('ConfigHelper master conf', () => {
  it('falls back to defaults when no config exists', async () => {
    const {default: ConfigHelper} = await import('../../../../src/app/util/config-helper.js');
    const cfg = new ConfigHelper('master');
    expect(cfg.getMasterRpcPort()).toBe(DEFAULT_MASTER_PORT);
    expect(cfg.getRpcUsername()).toBe('');
    expect(cfg.getRpcPassword()).toBe('');
  });

  it('falls back to defaults on malformed JSON', async () => {
    writeConf('{{{ not json');
    const {default: ConfigHelper} = await import('../../../../src/app/util/config-helper.js');
    const cfg = new ConfigHelper('master');
    expect(cfg.getMasterRpcPort()).toBe(DEFAULT_MASTER_PORT);
    expect(cfg.getRpcUsername()).toBe('');
  });

  it('trusts a valid custom port and credentials', async () => {
    writeConf({rpcPort: 18233, rpcUsername: 'u', rpcPassword: 'p'});
    const {default: ConfigHelper} = await import('../../../../src/app/util/config-helper.js');
    const cfg = new ConfigHelper('master');
    expect(cfg.getMasterRpcPort()).toBe(18233);
    expect(cfg.getRpcUsername()).toBe('u');
    expect(cfg.getRpcPassword()).toBe('p');
  });

  it('rejects privileged and non-numeric ports', async () => {
    const {default: ConfigHelper} = await import('../../../../src/app/util/config-helper.js');
    writeConf({rpcPort: 80, rpcUsername: 'u', rpcPassword: 'p'});
    expect(new ConfigHelper('master').getMasterRpcPort()).toBe(DEFAULT_MASTER_PORT);
    writeConf({rpcPort: 'garbage', rpcUsername: 'u', rpcPassword: 'p'});
    expect(new ConfigHelper('master').getMasterRpcPort()).toBe(DEFAULT_MASTER_PORT);
  });
});
