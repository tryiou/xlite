import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import http from 'http';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';

vi.mock('../../../../src/app/util/index.js', () => ({
  unixTime: () => Math.floor(Date.now() / 1000),
}));

const {default: ConfController} = await import('../../../../src/server/modules/conf-controller.js');
const {default: SimpleStorage} = await import('../../../../src/server/modules/storage.js');

const TEST_PORT = 18233;
const DTO = t => ({
  ticker: t, blockchain: `${t} chain`, verId: `${t.toLowerCase()}--v9`,
  addressPrefix: 26, scriptPrefix: 28, secretPrefix: 154,
  coin: 100000000, feePerByte: 20, minTxFee: 10000, port: 41419, dustAmount: 546,
});

let homeDir;
let server = null;

function writeMasterConf() {
  const dir = path.join(homeDir, 'xlite-daemon', 'settings');
  fs.ensureDirSync(dir);
  fs.writeJsonSync(path.join(dir, 'config-master.json'),
    {rpcPort: TEST_PORT, rpcUsername: 'u', rpcPassword: 'p'});
}

function startStub(dtos, delayMs = 0) {
  return new Promise(resolve => {
    const startAt = Date.now() + delayMs;
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        const payload = {jsonrpc: '1.0', id: JSON.parse(body).id, result: dtos, error: null};
        res.writeHead(200, {'content-type': 'application/json'});
        res.end(JSON.stringify(payload));
      });
    });
    const wait = () => {
      if (Date.now() >= startAt) {
        server.listen(TEST_PORT, '127.0.0.1', () => resolve());
      } else {
        setTimeout(wait, 50);
      }
    };
    wait();
  });
}

function stopStub() {
  return new Promise(resolve => {
    if (!server) return resolve();
    server.close(() => resolve());
    server = null;
  });
}

describe('ConfController.init master wait', () => {
  beforeEach(() => {
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-init-test-'));
    process.env.HOME = homeDir;
    writeMasterConf();
  });

  afterEach(async () => {
    await stopStub();
    fs.removeSync(homeDir);
  });

  it('succeeds when master appears late (spawn race)', async () => {
    const storage = new SimpleStorage();
    const controller = new ConfController(storage);
    const started = startStub([DTO('BLOCK'), DTO('PIVX')], 2500);
    const ok = await controller.init();
    await started;
    expect(ok).toBe(true);
    const cached = storage.getItem('COIN_CONFIGS');
    expect(cached.map(d => d.ticker).sort()).toEqual(['BLOCK', 'PIVX']);
  }, 30000);

  it('returns false on dead master within the cap (no 120 s hang)', async () => {
    const storage = new SimpleStorage();
    const controller = new ConfController(storage);
    const t0 = Date.now();
    const ok = await controller.init(3000);
    expect(Date.now() - t0).toBeLessThan(20000);
    expect(ok).toBe(false);
  }, 30000);

  it('preserves legacy fallback past the cap', async () => {
    const storage = new SimpleStorage();
    storage.setItem('MANIFEST', [{ticker: 'BLOCK'}], false);
    const controller = new ConfController(storage);
    expect(await controller.init(2500)).toBe(true);
    expect(storage.getItem('COIN_CONFIGS')).toBeUndefined();
  }, 20000);

  it('prunes legacy split lists on fresh success', async () => {
    const storage = new SimpleStorage();
    storage.setItem('MANIFEST', [{ticker: 'BLOCK'}], false);
    storage.setItem('XBRIDGE_INFO', [{ticker: 'BLOCK'}], false);
    await startStub([DTO('BLOCK')]);
    const controller = new ConfController(storage);
    expect(await controller.init()).toBe(true);
    expect(storage.getItem('MANIFEST')).toBeUndefined();
    expect(storage.getItem('XBRIDGE_INFO')).toBeUndefined();
  }, 30000);
});

describe('ConfController.init default cap (no startup block)', () => {
  let homeDir2;

  beforeEach(() => {
    homeDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-init-def-'));
    process.env.HOME = homeDir2;
    const dir = path.join(homeDir2, 'xlite-daemon', 'settings');
    fs.ensureDirSync(dir);
    fs.writeJsonSync(path.join(dir, 'config-master.json'),
      {rpcPort: TEST_PORT, rpcUsername: 'u', rpcPassword: 'p'});
  });

  afterEach(() => {
    fs.removeSync(homeDir2);
  });

  it('fails fast by default on dead master (window must never wait)', async () => {
    const storage = new SimpleStorage();
    const controller = new ConfController(storage);
    const t0 = Date.now();
    expect(await controller.init()).toBe(false);
    expect(Date.now() - t0).toBeLessThan(30000);
  }, 30000);
});
