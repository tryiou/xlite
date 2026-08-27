// Copyright (c) 2020 The Blocknet developers
// Distributed under the MIT software license, see the accompanying
// file LICENSE or http://www.opensource.org/licenses/mit-license.php.
import {logger} from './logger';
import {storageKeys} from '../constants';
import Token from '../../app/types/token';
import XBridgeInfo from '../../app/types/xbridgeinfo';
import RPCController from './rpc-controller';
import ConfigHelper from '../../app/util/config-helper';

import _ from 'lodash';

/**
 * Coin config provider — daemon is source of truth via master getCoins.
 * No filesystem blockchain-configuration-files usage. Vendored snapshot removed.
 */
class ConfController {

  _storage = null;

  constructor(storage) {
    this._storage = storage;
  }

  /**
   * Fetch coin configs from daemon master getCoins (11-field DTO) and cache.
   * Migrates legacy MANIFEST/XBRIDGE_INFO → COIN_CONFIGS once.
   * @return {Promise<boolean>} true if configs available (fresh or cached), false if daemon missing getCoins and no cache.
   */
  async init() {
    // Retry getCoins at startup — master may not yet be listening (daemon spawn race)
    const maxAttempts = 3;
    let lastErr = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const cfg = new ConfigHelper('master');
        const port = cfg.getMasterRpcPort();
        const user = cfg.getRpcUsername();
        const pass = cfg.getRpcPassword();
        const rpc = new RPCController(port, user, pass);
        const dtos = await rpc.getCoins();
        if (!Array.isArray(dtos))
          throw new Error('getCoins returned non-array');
        // Validate DTO shape (daemon 11-field: ticker,blockchain,verId,addressPrefix,scriptPrefix,secretPrefix,coin,feePerByte,minTxFee,port,dustAmount)
        for (const d of dtos) {
          if (!d.ticker || typeof d.blockchain === 'undefined' || typeof d.verId === 'undefined'
              || typeof d.addressPrefix === 'undefined' || typeof d.scriptPrefix === 'undefined'
              || typeof d.secretPrefix === 'undefined' || typeof d.coin === 'undefined'
              || typeof d.feePerByte === 'undefined' || typeof d.minTxFee === 'undefined'
              || typeof d.port === 'undefined')
            throw new Error(`malformed DTO for ${d.ticker}`);
          // Normalize dustAmount to number|null for downstream isDust (bcf 0 already mapped to null in daemon toDtoMap)
          if (d.dustAmount != null && typeof d.dustAmount !== 'number')
            throw new Error(`malformed dustAmount for ${d.ticker}`);
        }
        this._storage.setItem(storageKeys.COIN_CONFIGS, dtos);
        return true;
      } catch (e) {
        lastErr = e;
        if (attempt < maxAttempts)
          await new Promise(r => setTimeout(r, 500 * attempt));
      }
    }
    logger.error(`ConfController init failed (getCoins): ${lastErr?.message ?? String(lastErr)}`);
    const cached = this._storage.getItem(storageKeys.COIN_CONFIGS);
    if (_.isArray(cached) && cached.length > 0) {
      logger.warn('using cached COIN_CONFIGS');
      return true;
    }
    const legacy = this._storage.getItem(storageKeys.MANIFEST);
    if (_.isArray(legacy) && legacy.length > 0) {
      logger.warn('using legacy MANIFEST — daemon upgrade required for getCoins');
      return true;
    }
    return false;
  }

  /**
   * Get manifest-like array derived from COIN_CONFIGS DTOs for TokenManifest compat.
   * Synthetic xbridge_conf is not used for file lookup (daemon is source) — kept for Token shape compat only.
   * DTO fields verified against daemon getCoins serialization (verId, feePerByte, port, coin, dustAmount) at init().
   * @returns {Array<Object>}
   */
  getManifest() {
    const dtos = this._storage.getItem(storageKeys.COIN_CONFIGS);
    if (_.isArray(dtos) && dtos.length > 0) {
      return dtos.map(d => ({
        blockchain: d.blockchain,
        ticker: d.ticker,
        ver_id: d.verId,
        ver_name: '',
        conf_name: '',
        dir_name_linux: '',
        dir_name_mac: '',
        dir_name_win: '',
        repo_url: '',
        versions: [],
        xbridge_conf: `${String(d.ticker).toLowerCase()}--${d.verId}.conf`,
        wallet_conf: ''
      }));
    }
    const legacy = this._storage.getItem(storageKeys.MANIFEST);
    if (_.isArray(legacy))
      return legacy;
    return [];
  }

  getManifestHash() {
    // Deprecated — MANIFEST_SHA removed with vendored BCF; keep IPC for compat
    return '';
  }

  /**
   * Get XBridgeInfo array derived from COIN_CONFIGS DTOs.
   * @returns {XBridgeInfo[]}
   */
  getXBridgeInfo() {
    const dtos = this._storage.getItem(storageKeys.COIN_CONFIGS);
    if (_.isArray(dtos) && dtos.length > 0) {
      return dtos.map(d => new XBridgeInfo({
        ticker: d.ticker,
        feeperbyte: d.feePerByte,
        mintxfee: d.minTxFee,
        coin: d.coin,
        rpcport: d.port,
        dustAmount: d.dustAmount
      }));
    }
    const legacy = this._storage.getItem(storageKeys.XBRIDGE_INFO);
    if (_.isArray(legacy))
      return legacy.map(info => new XBridgeInfo(info));
    return [];
  }

  getCoinConfigs() {
    const v = this._storage.getItem(storageKeys.COIN_CONFIGS);
    if (_.isArray(v))
      return v;
    return [];
  }
}

export default ConfController;
