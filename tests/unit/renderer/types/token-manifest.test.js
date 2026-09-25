import {describe, it, expect} from 'vitest';
import _ from 'lodash';
import TokenManifest from '../../../../src/app/modules/token-manifest.js';
import XBridgeInfo from '../../../../src/app/types/xbridgeinfo.js';
import {sanitize, Blacklist, Whitelist} from '../../../../src/app/modules/api-r.js';

// Verbatim ticker sets from the live 2026-09-24 VM state (12-entry legacy
// MANIFEST vs 8-entry legacy XBRIDGE_INFO).
const MANIFEST_TICKERS = ['BCH', 'BLOCK', 'BTC', 'DASH', 'DGB', 'DOGE', 'LTC', 'PHR', 'PIVX', 'RVN', 'SYS', 'UNO'];
const XBINFO_TICKERS = ['BLOCK', 'BTC', 'DASH', 'DOGE', 'LTC', 'PIVX', 'SYS', 'UNO'];

const manifestEntries = MANIFEST_TICKERS.map(t => ({ticker: t, blockchain: t, ver_id: `${t.toLowerCase()}--v1`}));
const xbinfoEntries = XBINFO_TICKERS.map(t => new XBridgeInfo({ticker: t, feeperbyte: 20}));

describe('TokenManifest orphan tokens', () => {
  it('every token has a defined xbinfo, orphans get defaults', () => {
    const manifest = new TokenManifest(manifestEntries, xbinfoEntries);
    for (const t of MANIFEST_TICKERS) {
      const token = manifest.getToken(t);
      expect(token).not.toBeNull();
      expect(token.xbinfo, t).toBeDefined();
    }
    expect(manifest.getToken('DGB').xbinfo.ticker).toBe('DGB');
    expect(manifest.getToken('RVN').xbinfo.ticker).toBe('RVN');
  });

  it('BLOCK rpcport override still applies on present xbinfo', () => {
    const manifest = new TokenManifest(manifestEntries, xbinfoEntries);
    expect(manifest.getToken('BLOCK').xbinfo.rpcport).toBe(41419);
  });

  it('orphan wallets sanitize clean end-to-end (live crash replay)', () => {
    const manifest = new TokenManifest(manifestEntries, xbinfoEntries);
    const wallets = MANIFEST_TICKERS.map(t => ({ticker: t, _token: manifest.getToken(t)}));
    expect(() => sanitize(_.cloneDeep(wallets), Blacklist, Whitelist)).not.toThrow();
  });
});
