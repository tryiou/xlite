import {describe, it, expect} from 'vitest';
import _ from 'lodash';
import {sanitize, Blacklist, Whitelist} from '../../../../src/app/modules/api-r.js';

describe('sanitize undefined values', () => {
  it('skips undefined object values instead of throwing', () => {
    const payload = {a: 1, b: undefined, c: {d: undefined, e: 'x'}};
    expect(() => sanitize(_.cloneDeep(payload), Blacklist, Whitelist)).not.toThrow();
    const out = sanitize(_.cloneDeep(payload), Blacklist, Whitelist);
    expect(out.a).toBe(1);
    expect(out.c.e).toBe('x');
  });

  it('skips undefined array items and Map values', () => {
    const payload = {arr: [1, undefined, {x: undefined}], m: new Map([['k', undefined]])};
    expect(() => sanitize(_.cloneDeep(payload), Blacklist, Whitelist)).not.toThrow();
  });

  it('survives the orphan-token wallets payload (live 2026-09-24 replay)', () => {
    // Token built from a manifest entry with no XBridgeInfo (undefined xbinfo).
    const wallets = [
      {ticker: 'BLOCK', _token: {ticker: 'BLOCK', xbinfo: {ticker: 'BLOCK', feeperbyte: 20}}},
      {ticker: 'DGB', _token: {ticker: 'DGB', xbinfo: undefined}},
      {ticker: 'RVN', _token: {ticker: 'RVN', xbinfo: undefined}},
    ];
    const out = sanitize(_.cloneDeep(wallets), Blacklist, Whitelist);
    expect(out).toHaveLength(3);
    expect(out[0]._token.ticker).toBe('BLOCK');
  });
});
