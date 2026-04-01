// Copyright (c) 2020 The Blocknet developers
// Distributed under the MIT software license, see the accompanying
// file LICENSE or http://www.opensource.org/licenses/mit-license.php.
import { ccBinDirs, ccBinNames, DEFAULT_MASTER_PORT, UNKNOWN_CC_VERSION } from '../../app/constants';
import CCWalletConf from '../../app/types/ccwalletconf';
import {generateSalt, pbkdf2} from '../../app/modules/crypt';
import {logger} from './logger';
import {storageKeys} from '../constants';
import RPCController from './rpc-controller';
import {unixTime} from '../../app/util';
import {
  DAEMON_EXIT,
  DAEMON_STDOUT,
  DAEMON_STDOUT_ERRORS,
  DAEMON_STDERR_PATTERNS,
} from './daemon-protocol';

import _ from 'lodash';
import electron from 'electron';
import fs from 'fs-extra';
import path from 'path';
import childProcess from 'child_process';
import { v4 as uuidV4 } from 'uuid';
import moment from 'moment';

const isDev = process.env.ELECTRON_IS_DEV === 'true'; 
/**
 * Manage CloudChains litewallet configuration.
 */
class CloudChains {

  /**
   * @type {ChildProcess}
   * @private
   */
  _cli = null;
  /**
   * @type {RPCController}
   * @private
   */
  _rpc = null;

  /**
   * @type {string}
   * @private
   */
  _cloudChainsDir = '';
  /**
   * @type {string}
   * @private
   */
  _cloudChainsSettingsDir = '';
  /**
   * @type {string}
   * @private
   */
  _cloudChainsBackupDir = '';
  /**
   * @type {string}
   * @private
   */
  _cloudChainsKeyPath = '';
  /**
   * @type {Map<string, CCWalletConf>}
   * @private
   */
  _cloudChainsConfs = new Map();
  /**
   * @param filePath {string}
   * @param args {string[]}
   * @param callback {function}
   * @returns {ChildProcess}
   * @private
   */
  _execFile = childProcess.execFile;
  /**
   * @param filePath {string}
   * @param args {string[]}
   * @param callback {function}
   * @returns {ChildProcess}
   * @private
   */
  _spawn = childProcess.spawn;
  /**
   * @type {CCWalletConf}
   * @private
   */
  _masterConf = null;
  /**
   * @type {"darwin" | "linux" | "win32"}
   * @private
   */
  _platform = process.platform;
  /**
   * Compiled regex for conf filenames.
   * @type {RegExp}
   * @private
   */
  _reConfFile = /^config-([^\s]+)\.json$/i;
  /**
   * @type {RegExp}
   * @private
   */
  _selectionPatt = /selection/i;
  /**
   * @type {RegExp}
   * @private
   */
  _badPasswordPatt = /(?:BADPASSWORD|BADMNEMONIC)/i;
  /**
   * @type {SimpleStorage}
   * @private
   */
  _storage = null;
  /**
   * @type {boolean}
   * @private
   */
  _newInstall = false;
  /**
   * @type {number}
   * @private
   */
  _rpcWaitDelay = 3500;
  /**
   * @type {number}
   * @private
   */
  _rpcStartExpirySeconds = 30;
  /**
   * @type {number}
   * @private
   */
  _defaultAddressCount = 30;

  /**
   * Default path function for cloudchains installations.
   * @return {string}
   */
  static defaultPathFunc() {
    switch (process.platform) {
      case 'win32':
        return path.join(electron.app.getPath('appData'), 'CloudChains');
      case 'darwin':
        return path.join(electron.app.getPath('appData'), 'CloudChains');
      default: // linux distros
        return path.join(electron.app.getPath('appData'), 'CloudChains');
    }
  }

  /**
   * Constructor
   * @param pathFunc {function}
   * @param storage {SimpleStorage}
   */
  constructor(pathFunc, storage) {
    this._cloudChainsDir = pathFunc();
    this._cloudChainsSettingsDir = path.join(this._cloudChainsDir, 'settings');
    this._cloudChainsBackupDir = path.join(this._cloudChainsDir, 'backups');
    this._cloudChainsKeyPath = path.join(this._cloudChainsDir, 'key.dat');
    this._storage = storage;
  }

  /**
   * Returns true if cloudchains has been installed (or run for the first time).
   * @return {boolean}
   */
  isInstalled() {
    try {
      return fs.pathExistsSync(this._cloudChainsKeyPath);
    } catch (err) {
      logger.error('is installed check failed', err);
      return false;
    }
  }

  /**
   * Returns true if the settings path exists.
   * @return {boolean}
   */
  hasSettings() {
    try {
      return fs.pathExistsSync(path.join(this._cloudChainsSettingsDir, 'config-master.json'));
    } catch (err) {
      logger.error('has settings check failed', err);
      return false;
    }
  }

  /**
   * CloudChains configuration directory.
   * @return {string}
   */
  getCloudChainsDir() {
    return this._cloudChainsDir;
  }

  /**
   * Return CloudChains wallet settings directory.
   * @return {string}
   */
  getSettingsDir() {
    return this._cloudChainsSettingsDir;
  }

  /**
   * Return CloudChains wallet backup directory.
   * @return {string}
   */
  getBackupDir() {
    return this._cloudChainsBackupDir;
  }

  /**
   * Return CloudChains wallet key file
   * @return {string}
   */
  getKeyPath() {
    return this._cloudChainsKeyPath;
  }

  /**
   * Return the wallet conf with the specified ticker. Returns null
   * if no config was found.
   * @param ticker {string}
   * @return {CCWalletConf|null}
   */
  getWalletConf(ticker) {
    if (this._cloudChainsConfs.has(ticker))
      return this._cloudChainsConfs.get(ticker);
    return null;
  }

  /**
   * Return the wallet confs.
   * @return {Array<CCWalletConf>}
   */
  getWalletConfs() {
    return Array.from(this._cloudChainsConfs.values());
  }

  /**
   * Return a copy of the master conf file.
   * @return {CCWalletConf}
   */
  getMasterConf() {
    return this._masterConf;
  }

  /**
   * Return the wallet created state.
   * @return {boolean}
   */
  isWalletCreated() {
    const pw = this._storage.getItem(storageKeys.PASSWORD);
    const s = this._storage.getItem(storageKeys.SALT);
    return _.isString(pw) && _.isString(s) && pw.length > 0 && s.length > 0;
  }

  /**
   * Save the cloudchains wallet credentials.
   * @param password {string}
   * @param salt {string|null}
   */
  saveWalletCredentials(password, salt) {
    if (!salt)
      salt = generateSalt(32);

    const hashedPassword = pbkdf2(password, salt);
    this._storage.setItems({
      [storageKeys.PASSWORD]: hashedPassword,
      [storageKeys.SALT]: salt,
    });

    return true;
  }

  /**
   * Return the last known cloudchains wallet password. This is encrypted.
   * @return {string|null}
   */
  getStoredPassword() {
    const pw = this._storage.getItem(storageKeys.PASSWORD);
    if (!pw || !_.isString(pw))
      return null;
    return pw;
  }

  /**
   * Return the password salt.
   * @return {string|null}
   */
  getStoredSalt() {
    const s = this._storage.getItem(storageKeys.SALT);
    if (!s || !_.isString(s))
      return null;
    return s;
  }

  /**
   * Return the last known cloudchains wallet mnemonic. This is encrypted.
   * @param currentPassword {string} Used to decrypt the mnemonic
   * @return {string|null} Returns null if the decryption failed or the mnemonic doesn't exist
   */
  async getDecryptedMnemonic(currentPassword) {
    try {
      const mnemonic = await this.getCCMnemonic(currentPassword);
      if (!mnemonic)
        return null;
      return mnemonic;
    } catch (e) {
      logger.error('failed to get mnemonic', e);
      return null;
    }
  }

  /**
   * Synchronously read all CloudChains token confs from disk. Returns false on error.
   * Fatal error throws. Individual token conf failures do not result in fatal error,
   * however, will return false. Returns true if no errors occurred. If the token
   * manifest is provided this call will overwrite rpc port values for the configs
   * to match those in the manifest.
   * @param manifest {TokenManifest} Override with manifest values if specified
   * @return {boolean}
   * @throws {Error} on fatal error (e.g. failure to read settings dir)
   */
  loadConfs(manifest = null) {
    const settingsDir = this.getSettingsDir();
    let success = true;
    const defaultAddressCount = 1;
    const confs = fs.readdirSync(settingsDir)
      .map(f => {
        if (!this._reConfFile.test(f))
          return null; // ignore files that don't match expected conf filename
        const ticker = f.match(this._reConfFile)[1];
        // Load json data from conf file
        const filePath = path.join(settingsDir, f);
        try {
          const data = fs.readJsonSync(filePath);
          const conf = new CCWalletConf(ticker, data);
          if (ticker === 'master') {
            this._masterConf = this._checkUpdateMasterConf(conf, filePath, fs.writeJsonSync);
            return null;
          } else if (manifest && manifest.getToken(ticker)) { // update with manifest rpc ports
            const token = manifest.getToken(ticker);
            conf.rpcPort = token.xbinfo.rpcport;
            if (conf.addressCount < defaultAddressCount)
              conf.addressCount = defaultAddressCount;
            this._updateConfRpc(conf, filePath, fs.writeJsonSync);
            return conf;
          } else {
            if (conf.addressCount < defaultAddressCount) {
              conf.addressCount = defaultAddressCount;
              this._updateConfRpc(conf, filePath, fs.writeJsonSync);
            }
            return conf;
          }
        } catch (err) {
          logger.error(`failed to read token conf: ${f}`, err); // non-fatal
          success = false;
          return null;
        }
      }, this)
      .filter(conf => conf); // remove null

    this._cloudChainsConfs = new Map();
    for (const conf of confs)
      this._cloudChainsConfs.set(conf.ticker(), conf);

    // Create master rpc
    this._rpc = new RPCController(this._masterConf.rpcPort, this._masterConf.rpcUsername, this._masterConf.rpcPassword);

    return success;
  }

  /**
   * Checks master conf and updates it if necessary to enable the master RPC server
   * @param conf
   * @param filePath
   * @param writeJsonSync
   * @returns {*}
   */
  _checkUpdateMasterConf(conf, filePath, writeJsonSync) {
    if(!conf.rpcEnabled
      || !conf.rpcUsername
      || !conf.rpcPassword
      || (conf.rpcPort !== DEFAULT_MASTER_PORT && conf.rpcPort <= 1024)) {
      const rpcUsername = uuidV4();
      const rpcPassword = uuidV4();
      const rpcPort = DEFAULT_MASTER_PORT;
      conf = new CCWalletConf('master', {
        ...conf,
        rpcEnabled: true,
        rpcUsername,
        rpcPassword,
        rpcPort
      });
      writeJsonSync(filePath, conf, {spaces: 4});
    }
    return conf;
  }

  /**
   * Gets the working directory of the CC executable
   * @returns {string}
   */
  getCLIDir() {
    const dirname = ccBinDirs[this._platform];
    if(isDev) {
      return path.resolve(__dirname, `../../../bin/${dirname}`);
    } else {
      return path.resolve(__dirname, `../../../bin/${dirname}`).replace('app.asar', 'app.asar.unpacked');
    }
  }

  /**
   * Gets the CloudChains CLI file path
   * @returns {string}
   */
  getCCSPVFilePath() {
    const platform = this._platform;
    return path.join(this.getCLIDir(), ccBinNames[platform]);
  }

  /**
   * Gets the version of the CC CLI and returns an empty string on failure
   * @returns {Promise<string>}
   */
  getCCSPVVersion() {
    const versionPatt = /\d+\.\d+\.\d+/;
    let version = '';
    let closed = false;
    let resolve = () => {};
    const closeHandler = err => {
      if (closed)
        return;
      closed = true;
      if (err) {
        const { code } = err;
        logger.error(err);
        if(code === 3221225781)
          resolve('');
        else
          resolve(UNKNOWN_CC_VERSION);
      } else
        resolve(version);
    };
    return new Promise(res => {
      resolve = res;
      const cli = this._execFile(this.getCCSPVFilePath(), ['--version'], {detached: false, windowsHide: true}, closeHandler);
      cli.stdout.on('data', data => {
        const str = data.toString('utf8');
        if(versionPatt.test(str)) {
          version = str.match(versionPatt)[0];
        }
      });
      cli.stdout.on('close', closeHandler);
    });
  }

  /**
   * Gets the wallet mnemonic.
   * @param password {string}
   * @returns {Promise<string>}
   */
  getCCMnemonic(password) {
    let mnemonic = '';
    return new Promise((resolve, reject) => {
      let closed = false;
      const closeHandler = err => {
        if (closed)
          return;
        closed = true;
        if (err || !mnemonic) {
          logger.error(err);
          reject(new Error('failed to get the mnemonic'));
        } else
          resolve(mnemonic);
      };
      const cli = this._spawn(this.getCCSPVFilePath(), ['--getmnemonic'],
        {detached: false, windowsHide: true, env: this._getDaemonEnv(password)});
      cli.stdin.end();
      cli.stdout.on('data', data => {
        mnemonic = data.toString('utf8');
      });
      cli.stdout.on('close', closeHandler);
      cli.stderr.on('data', data => {
        const str = data.toString('utf8');
        logger.error(`getCCMnemonic error: ${str}`);
      });
    });
  }

  /**
   * Returns true if the wallet rpc is accepting connections. Calls the rpc
   * "help" method.
   * @return {boolean}
   */
  async isWalletRPCRunning() {
    if (!this._masterConf || !this._masterConf.rpcEnabled || !this._rpc)
      return false;
    try {
      const res = await this._rpc.ccHelp();
      return !(res instanceof Error);
    } catch (e) {
      return false;
    }
  }

  /**
   * Returns whether or not the cli is currently running
   * @returns {boolean}
   */
  spvIsRunning() {
    if (this._isCLIAvailable())
      return this._cli && !_.isNumber(this._cli.exitCode);
    return false;
  }

  /**
   * Starts the CloudChains CLI.
   * Uses env-var-only credential passing (no stdin writes).
   * @param password {string}
   * @returns {Promise<boolean>}
   */
  startSPV(password = '') {
    return new Promise(resolve => {
      this.isWalletRPCRunning().then(running => {
        if (running) {
          logger.info('CloudChains wallet running');
          resolve(true);
          return;
        }

        if (this.spvIsRunning()) {
          this._cli.kill('SIGINT');
          this._cli = null;
        }

        logger.info('Starting CloudChains daemon');

        let settled = false;
        const settle = (value) => {
          if (settled) return;
          settled = true;
          resolve(value);
        };

        const args = password ? ['--password'] : [];
        let cli;
        try {
          cli = this._spawn(
            this.getCCSPVFilePath(),
            args,
            {
              detached: false,
              windowsHide: true,
              env: this._getDaemonEnv(password),
            }
          );
        } catch (err) {
          logger.error(`startSPV spawn error: ${err.message}`);
          settle(false);
          return;
        }

        let sawBadPassword = false;
        let sawSelection = false;

        cli.stdout.on('data', (data) => {
          try {
            if (settled) return;
            const str = data.toString('utf8');

            if (this._badPasswordPatt.test(str)) {
              sawBadPassword = true;
            } else if (this._selectionPatt.test(str)) {
              sawSelection = true;
            } else if (DAEMON_STDOUT.RPC_SERVER_READY.test(str)) {
              const expiry = unixTime() + this._rpcStartExpirySeconds;
              this._waitForRpc(expiry, this._rpcWaitDelay)
                .then((available) => settle(available))
                .catch(() => settle(false));
            }
          } catch(e) { logger.error(`startSPV stdout handler error: ${e.message}`); }
        });

        // Daemon writes all output to stdout via ConsoleHandler; stderr means JVM error
        try {
          cli.stderr.on('data', (data) => {
            try {
              if (settled) return;
              const str = data.toString('utf8');
              logger.error(`startSPV stderr: ${str}`);

              const isFatal = DAEMON_STDERR_PATTERNS.FATAL.some(p => p.test(str));
              if (isFatal) {
                settle(false);
              }
            } catch(e) { logger.error(`startSPV stderr handler error: ${e.message}`); }
          });
        } catch(e) {
          logger.error(`startSPV stderr registration error: ${e.message}`);
        }

        cli.stdout.on('close', () => {
          if (settled) return;
          clearTimeout(timeout);
          this._cli = null;
          const code = cli.exitCode;
          logger.info(`startSPV daemon exited with code ${code}`);
          if (sawBadPassword || (!password && sawSelection)) {
            settle(false);
          } else if (code === DAEMON_EXIT.SUCCESS) {
            this.isWalletRPCRunning()
              .then((running) => settle(running))
              .catch(() => settle(false));
          } else {
            settle(false);
          }
        });

        // Timeout safety net
        const timeout = setTimeout(() => {
          if (!settled) {
            cli.kill('SIGINT');
            settle(false);
          }
        }, this._rpcStartExpirySeconds * 1000 * 3);

        this._cli = cli;
      });
    });
  }

  /**
   * Stops the CloudChains CLI
   * @returns {Promise<boolean>}
   */
  async stopSPV() {
    // If no CLI reference or the process has already exited, nothing to stop
    if (!this._cli || _.isNumber(this._cli.exitCode)) {
      this._cli = null;
      return true;
    }
    let r = false;
    if (await this.isWalletRPCRunning())
      r = await this._rpc.ccStop();
    else {
      if (this._isCLIAvailable())
        return this._cli.kill('SIGINT');
    }
    return r;
  }

  /**
   * Creates a new CloudChains wallet.
   * Uses env-var-only credential passing (no stdin writes).
   * Resolves with mnemonic string on success, rejects with descriptive Error on failure.
   * @param password {string}
   * @param mnemonic {string}
   * @returns {Promise<string>}
   */
  createSPVWallet(password, mnemonic = '') {
    return new Promise((resolve, reject) => {
      // --- Pre-flight checks ---
      if (!password) {
        reject(new Error('failed to create wallet with empty password'));
        return;
      }

      // Kill existing process if running
      if (this.spvIsRunning()) {
        this._cli.kill('SIGINT');
        this._cli = null;
      }

      // Move existing key file to backup before creating new wallet
      if (this.isInstalled()) {
        const keyPath = this.getKeyPath();
        const keyExt = path.extname(keyPath);
        const keyName = path.basename(keyPath, keyExt);
        const backupFilePath = path.join(
          this.getBackupDir(),
          `${keyName}_${moment().format('YYYYMMDDHHmmss')}${keyExt}`
        );
        try {
          fs.moveSync(keyPath, backupFilePath, { overwrite: true });
        } catch (err) {
          logger.error(`Move key file failed with error: ${err.message}`);
        }
      }

      logger.info('Creating SPV wallet via daemon');

      // --- Build args ---
      const args = mnemonic
        ? ['--xliterpc', '--createwalletmnemonic']
        : ['--xliterpc', '--createdefaultwallet'];

      // --- State tracking ---
      let settled = false;
      const stderrChunks = [];

      const settle = (result, isReject = false) => {
        if (settled) return;
        settled = true;
        if (isReject) reject(result);
        else resolve(result);
      };

      // --- Spawn daemon ---
      let cli;
      try {
        cli = this._spawn(
          this.getCCSPVFilePath(),
          args,
          {
            detached: false,
            windowsHide: true,
            env: this._getDaemonEnv(password, mnemonic),
          }
        );
      } catch (err) {
        logger.error(`createSPVWallet spawn error: ${err.message}`);
        settle(new Error(`failed to spawn daemon: ${err.message}`), true);
        return;
      }

      // --- Stdout handler (pattern detection only) ---
      let sawBadPassword = false;
      let sawBadMnemonic = false;
      cli.stdout.on('data', (data) => {
        if (settled) return;
        const str = data.toString('utf8');

        if (DAEMON_STDOUT_ERRORS.BADPASSWORD.test(str)) {
          sawBadPassword = true;
        } else if (DAEMON_STDOUT_ERRORS.BADMNEMONIC.test(str)) {
          sawBadMnemonic = true;
        }
      });

      // --- Stderr handler (collect content, decide at close) ---
      cli.stderr.on('data', (data) => {
        const str = data.toString('utf8');
        stderrChunks.push(str);
        logger.error(`createSPVWallet stderr: ${str}`);
      });

      // --- Close handler (primary resolution via exit code) ---
      cli.stdout.on('close', () => {
        if (settled) return;
        clearTimeout(timeout);
        this._cli = null;
        const code = cli.exitCode;

        logger.info(`createSPVWallet daemon exited with code ${code}`);

        // Check stdout-detected errors first
        if (sawBadPassword) {
          settle(new Error('password does not meet strength requirements'), true);
          return;
        }
        if (sawBadMnemonic) {
          settle(new Error('invalid or corrupted mnemonic phrase'), true);
          return;
        }

        // Exit code 0: daemon succeeded, fetch the mnemonic
        if (code === DAEMON_EXIT.SUCCESS) {
          this.getCCMnemonic(password)
            .then((m) => settle(m))
            .catch((err) => settle(err, true));
          return;
        }

        // Non-zero exit: parse stderr for diagnosis
        const fullStderr = stderrChunks.join('\n').trim();
        const fatalMatch = DAEMON_STDERR_PATTERNS.FATAL.find((p) =>
          p.test(fullStderr)
        );
        if (fatalMatch) {
          settle(new Error(`daemon fatal error: ${fullStderr || 'unknown'}`), true);
        } else {
          settle(
            new Error(
              `failed to create wallet (exit ${code}): ${fullStderr || 'unknown error'}`
            ),
            true
          );
        }
      });

      // --- Timeout safety net ---
      const timeoutMs = this._rpcStartExpirySeconds * 1000 * 3; // 90 seconds
      const timeout = setTimeout(() => {
        cli.kill('SIGINT');
        settle(new Error('wallet creation timed out'), true);
      }, timeoutMs);

      // Watch this process
      this._cli = cli;
    });
  }

  /**
   * Enables all wallets using the CloudChains CLI param --enablerpcandconfigure.
   * @returns {Promise<boolean>}
   */
  enableAllWallets() {
    return new Promise(resolve => {
      let settled = false;
      let sawStdout = false;
      const settle = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      let cli;
      try {
        cli = this._spawn(
          this.getCCSPVFilePath(),
          ['--xliterpc', '--enablerpcandconfigure'],
          { detached: false, windowsHide: true }
        );
      } catch (err) {
        logger.error(`enableAllWallets spawn error: ${err.message}`);
        settle(false);
        return;
      }

      cli.stdout.on('data', (data) => {
        if (settled) return;
        const str = data.toString('utf8');
        if (this._selectionPatt.test(str)) {
          sawStdout = true;
          settle(true);
          cli.kill('SIGINT');
        }
      });

      // Only settle on fatal stderr
      cli.stderr.on('data', (data) => {
        if (settled) return;
        const str = data.toString('utf8');
        logger.error(`enableAllWallets stderr: ${str}`);

        const isFatal = DAEMON_STDERR_PATTERNS.FATAL.some(p => p.test(str));
        if (!sawStdout && isFatal) {
          settle(false);
        }
      });

      cli.stdout.on('close', () => {
        if (!settled) {
          clearTimeout(timeout);
          const code = cli.exitCode;
          logger.info(`enableAllWallets daemon exited with code ${code}`);
          settle(code === DAEMON_EXIT.SUCCESS);
        }
      });

      // Timeout safety net
      const timeout = setTimeout(() => {
        if (!settled) {
          cli.kill('SIGINT');
          settle(false);
        }
      }, this._rpcStartExpirySeconds * 1000);
    });
  }

  /**
   * Sets the addressCount of all wallet config files
   * @param addressCount {number} The number of addresses that should be checked for UTXOs and Transactions
   * @returns {boolean} Success
   */
  async setAllConfigAddressCounts(addressCount = this._defaultAddressCount) {
    try {
      const ccSettingsDir = this.getSettingsDir();
      const configFiles = fs.readdirSync(ccSettingsDir)
        .filter(f => path.extname(f) === '.json') // Only list json files
        .filter(f => !/master/.test(f)) // Ignore the master config
        .map(f => path.join(ccSettingsDir, f));
      for(const f of configFiles) {
        try {
          const contents = fs.readJsonSync(f);
          fs.writeJsonSync(f, {
            ...contents,
            addressCount
          }, {spaces: 4});
        } catch(err) {
          logger.error(err.message + '\n' + err.stack);
        }
      }
      const tokens = [...this._cloudChainsConfs.keys()];
      for(const token of tokens) { // Tell the CC daemon to reload each of the configs
        await this._rpc.ccReloadConfig(token);
      }
      return true;
    } catch(err) {
      logger.error(err.message + '\n' + err.stack);
      return false;
    }
  }

  /**
   * Change the wallet password using the CloudChains CLI param --changepassword.
   * Current password is passed via env var. New password is sent via stdin
   * when the daemon prompts for it on stdout.
   * @param oldpw {string} Old password
   * @param newpw {string} New password
   * @returns {Promise<boolean>}
   */
  changePassword(oldpw, newpw) {
    return new Promise(resolve => {
      let settled = false;
      let sawPasswordPrompt = false;

      const settle = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      let cli;
      try {
        cli = this._spawn(
          this.getCCSPVFilePath(),
          ['--changepassword'],
          { detached: false, windowsHide: true, env: this._getDaemonEnv(oldpw) }
        );
      } catch (err) {
        logger.error(`changePassword spawn error: ${err.message}`);
        settle(false);
        return;
      }

      cli.stdin.setEncoding('utf-8');

      cli.stdout.on('data', (data) => {
        if (settled) return;
        const str = data.toString('utf8');

        if (DAEMON_STDOUT.PASSWORD_CHANGED.test(str)) {
          if (sawPasswordPrompt) this.saveWalletCredentials(newpw, null);
          settle(sawPasswordPrompt);
          cli.kill('SIGINT');
        } else if (DAEMON_STDOUT_ERRORS.CHANGEPASSWORDFAILED.test(str)) {
          settle(false);
          cli.kill('SIGINT');
        } else if (DAEMON_STDOUT.PASSWORD_PROMPT.test(str) && !sawPasswordPrompt) {
          // Daemon prompts for new password on stdin (current password comes from env var)
          sawPasswordPrompt = true;
          cli.stdin.write(newpw + '\r\n');
        }
      });

      // Daemon writes all output to stdout; stderr means JVM error
      cli.stderr.on('data', (data) => {
        if (settled) return;
        logger.error(`changePassword stderr: ${data.toString('utf8')}`);
        settle(false);
      });

      cli.stdout.on('close', () => {
        if (!settled) {
          clearTimeout(timeout);
          const code = cli.exitCode;
          logger.info(`changePassword daemon exited with code ${code}`);
          settle(false);
        }
      });

      // Timeout
      const timeout = setTimeout(() => {
        if (!settled) {
          cli.kill('SIGINT');
          settle(false);
        }
      }, this._rpcStartExpirySeconds * 1000);
    });
  }

  /**
   * Returns true if the password matches the stored password.
   * Returns false otherwise.
   * @param password
   * @return {boolean}
   */
  matchesStoredPassword(password) {
    const currentPassword = this.getStoredPassword();
    const currentSalt = this.getStoredSalt();
    const checkPassword = pbkdf2(password, currentSalt);
    return checkPassword === currentPassword;
  }

  /**
   * Sets the new install state.
   */
  setNewInstall() {
    this._newInstall = true;
  }

  /**
   * Returns true if this is a new install.
   * @return {boolean}
   */
  isNewInstall() {
    return this._newInstall;
  }

  /**
   * Returns true if the cli is available.
   * @return {boolean}
   * @private
   */
  _isCLIAvailable() {
    return !!(this._cli);
  }

  /**
   * Checks master conf and updates it if necessary to enable the master RPC server
   * @param conf {CCWalletConf}
   * @param filePath {string}
   * @param writeJsonSync {function}
   * @return {boolean}
   */
  _updateConfRpc(conf, filePath, writeJsonSync) {
    try {
      writeJsonSync(filePath, conf, {spaces: 4});
      return true;
    } catch (e) {
      logger.error(`failed to write conf at path ${filePath}`);
      return false;
    }
  }

  /**
   * Wait for rpc to become available. Returns true if rpc is available
   * otherwise returns false on expiry.
   * @param expiry {number} Unix time
   * @param wait {number} Delay before retry in milliseconds
   * @returns {Promise<boolean>}
   * @private
   */
  async _waitForRpc(expiry, wait = 3500) {
    try {
      const res = await this._rpc.ccHelp();
      if (res && !(res instanceof Error))
        return true;
    } catch (e) {
      // non-fatal
    }
    if (unixTime() >= expiry)
      return false;
    else
      return await new Promise(resolve => {
        setTimeout(() => {
          this._waitForRpc(expiry, wait).then(res => resolve(res));
        }, wait);
      });
  }

  /**
   * Build an env object for spawning the daemon process.
   * Merges the current process env with WALLET_PASSWORD and WALLET_MNEMONIC.
   * Only sets env vars when values are non-empty strings.
   * @param password {string|null}
   * @param mnemonic {string|null}
   * @returns {Object}
   * @private
   */
  _getDaemonEnv(password = null, mnemonic = null) {
    const env = { ...process.env };
    if (password && password.length > 0) env.WALLET_PASSWORD = password;
    if (mnemonic && mnemonic.length > 0) env.WALLET_MNEMONIC = mnemonic;
    return env;
  }
}

export default CloudChains;
