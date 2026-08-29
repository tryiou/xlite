// Copyright (c) 2020 The Blocknet developers
// Distributed under the MIT software license, see the accompanying
// file LICENSE or http://www.opensource.org/licenses/mit-license.php.
import CCWalletConf from '../types/ccwalletconf';
import {parseAPIError} from '../util';

/**
 * xlite-daemon renderer counterpart.
 */
class XliteDaemon {
  /**
   * @type {Object}
   * @private
   */
  _api = null;

  /**
   * @type {LWDB}
   * @private
   */
  _db = null;

  /**
   * @type {DOMStorage}
   * @private
   */
  _storage = null;

  /**
   * Constructor
   * @param api {Object} Context bridge api
   * @param db {LWDB}
   * @param storage {DOMStorage}
   */
  constructor(api, db, storage) {
    this._api = api;
    this._db = db;
    this._storage = storage;
  }

  /**
   * Returns true if xlite-daemon has been installed (or run for the first time).
   * @return {boolean}
   */
  async isInstalled() {
    try {
      return await this._api.xliteDaemon_isInstalled();
    } catch (_err) {
      return false;
    }
  }

  /**
   * Returns true if the settings path exists.
   * @return {boolean}
   */
  async hasSettings() {
    try {
      return await this._api.xliteDaemon_hasSettings();
    } catch (_err) {
      return false;
    }
  }

  /**
   * Return the wallet conf with the specified ticker. Returns null
   * if no config was found.
   * @param ticker {string}
   * @return {CCWalletConf|null}
   */
  async getWalletConf(ticker) {
    try {
      const conf = await this._api.xliteDaemon_getWalletConf(ticker);
      return new CCWalletConf(ticker, conf);
    } catch (_err) {
      return null;
    }
  }

  /**
   * Return the wallet confs.
   * @return {Array<CCWalletConf>}
   */
  async getWalletConfs() {
    try {
      const confs = await this._api.xliteDaemon_getWalletConfs();
      const r = [];
      for (const conf of confs)
        r.push(new CCWalletConf('', conf));
      return r;
    } catch (_err) {
      return [];
    }
  }

  /**
   * Return a copy of the master conf file.
   * @return {CCWalletConf}
   */
  async getMasterConf() {
    try {
      const conf = await this._api.xliteDaemon_getMasterConf();
      return new CCWalletConf('', conf);
    } catch (_err) {
      return null;
    }
  }

  /**
   * Return the wallet created state.
   * @return {boolean}
   */
  async isWalletCreated() {
    try {
      return await this._api.xliteDaemon_isWalletCreated();
    } catch (_err) {
      return null;
    }
  }

  /**
   * Save the xlite-daemon wallet credentials.
   * @param password {string}
   * @param salt {string|null} If null the salt is created
   */
  async saveWalletCredentials(password, salt) {
    try {
      return await this._api.xliteDaemon_saveWalletCredentials(password, salt);
    } catch (_err) {
      return false;
    }
  }

  /**
   * Return the last known xlite-daemon wallet password. This is encrypted.
   * @return {string|null}
   */
  async getStoredPassword() {
    try {
      return await this._api.xliteDaemon_getStoredPassword();
    } catch (_err) {
      return null;
    }
  }

  /**
   * Return the password salt.
   * @return {string|null}
   */
  async getStoredSalt() {
    try {
      return await this._api.xliteDaemon_getStoredSalt();
    } catch (_err) {
      return null;
    }
  }

  /**
   * Return the last known xlite-daemon wallet mnemonic. This is decrypted.
   * @param password {string}
   * @return {string|null}
   */
  async getDecryptedMnemonic(password) {
    try {
      return await this._api.xliteDaemon_getDecryptedMnemonic(password);
    } catch (_err) {
      return null;
    }
  }

  /**
   * Read all xlite-daemon token confs from disk. Returns false on error.
   * Fatal error throws. Individual token conf failures do not result in fatal error,
   * however, will return false. Returns true if no errors occurred.
   * @return {Promise<boolean>}
   * @throws {Error} on fatal error (e.g. failure to read settings dir)
   */
  async loadConfs() {
    try {
      return await this._api.xliteDaemon_loadConfs();
    } catch (_err) {
      return false;
    }
  }

  /**
   * Gets the version of the CC CLI and returns an empty string on failure
   * @returns {Promise<string>}
   */
  async getXliteDaemonVersion() {
    try {
      return await this._api.xliteDaemon_getXliteDaemonVersion();
    } catch (_err) {
      return '';
    }
  }

  /**
   * Returns true if the wallet rpc is accepting connections. Calls the rpc
   * "help" method.
   * @return {boolean}
   */
  async isWalletRPCRunning() {
    try {
      return await this._api.xliteDaemon_isWalletRPCRunning();
    } catch (_err) {
      return false;
    }
  }

  /**
   * Returns whether or not the cli is currently running
   * @returns {boolean}
   */
  async spvIsRunning() {
    try {
      return await this._api.xliteDaemon_spvIsRunning();
    } catch (_err) {
      return false;
    }
  }

  /**
   * Starts the xlite-daemon CLI
   * @param password {string}
   * @returns {Promise<boolean>}
   */
  async startSPV(password = '') {
    try {
      return await this._api.xliteDaemon_startSPV(password);
    } catch (_err) {
      return false;
    }
  }

  /**
   * Stops the xlite-daemon CLI
   * @returns {boolean}
   */
  async stopSPV() {
    try {
      return await this._api.xliteDaemon_stopSPV();
    } catch (_err) {
      return false;
    }
  }

  /**
   * Creates a new xlite-daemon wallet.
   * Propagates errors to caller for UI display.
   * @param password {string}
   * @param mnemonic {string}
   * @returns {Promise<string>} mnemonic on success
   * @throws {Error} on failure with descriptive message
   */
  async createSPVWallet(password, mnemonic = '') {
    if (password)
      await this._clearWalletStorage();
    // Let errors propagate - caller needs to know WHY it failed
    return await this._api.xliteDaemon_createSPVWallet(password, mnemonic);
  }

  /**
   * Enables all wallets using the xlite-daemon CLI param --enablerpcandconfigure
   * @returns {boolean}
   */
  async enableAllWallets() {
    try {
      return await this._api.xliteDaemon_enableAllWallets();
    } catch (_err) {
      return false;
    }
  }

  /**
   * Changes the password and re-encrypts the stored mnemonic. Fails if the old
   * and new passwords don't match or if there's an error.
   * @param oldPassword
   * @param newPassword
   * @return {Promise<boolean>}
   * @throws {Error}
   */
  async changePassword(oldPassword, newPassword) {
    try {
      return await this._api.xliteDaemon_changePassword(oldPassword, newPassword);
    } catch (e) {
      parseAPIError(e);
      throw e; // bubble up
    }
  }

  /**
   * Returns true if password matches stored password.
   * Returns false otherwise.
   * @param password
   * @return {Promise<boolean>}
   * @throws {Error}
   */
  async matchesStoredPassword(password) {
    try {
      return await this._api.xliteDaemon_matchesStoredPassword(password);
    } catch (e) {
      parseAPIError(e);
      throw e; // bubble up
    }
  }

  /**
   * Returns true if this is a new install.
   * @return {Promise<boolean>}
   */
  async isNewInstall() {
    try {
      return await this._api.xliteDaemon_isNewInstall();
    } catch (_err) {
      return false;
    }
  }

  /**
   * Sets the addressCount of all wallet config files and reloads configs via RPC.
   * @param addressCount {number} The number of addresses to check for UTXOs and Transactions
   * @returns {Promise<boolean>}
   */
  async setAllConfigAddressCounts(addressCount) {
    try {
      return await this._api.xliteDaemon_setAllConfigAddressCounts(addressCount);
    } catch (_err) {
      return false;
    }
  }

  // Deprecated alias for one release
  async getCCSPVVersion() {
    return this.getXliteDaemonVersion();
  }

  /**
   * Clear wallet dbs.
   * @return {Promise<void>}
   * @private
   */
  async _clearWalletStorage() {
    await this._db.clear(); // <- clear all indexeddb data
    this._storage.clear(); // <- clear all stored data
  }
}

export default XliteDaemon;
