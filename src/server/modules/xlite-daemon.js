// Copyright (c) 2020 The Blocknet developers
// Distributed under the MIT software license, see the accompanying
// file LICENSE or http://www.opensource.org/licenses/mit-license.php.
import { daemonBinDirs, daemonBinNames, DEFAULT_MASTER_PORT, UNKNOWN_XLITE_DAEMON_VERSION } from '../../app/constants';
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
  DAEMON_STOP_SIGNAL,
} from './daemon-protocol';
import { awaitDaemonExit } from './daemon-exit';

import _ from 'lodash';
import electron from 'electron';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import childProcess from 'child_process';
import { v4 as uuidV4 } from 'uuid';
import moment from 'moment';

const isDev = process.env.ELECTRON_IS_DEV === 'true';

/**
 * Manage xlite-daemon litewallet configuration.
 */
class XliteDaemon {

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
  _xliteDaemonDir = '';
  /**
   * @type {string}
   * @private
   */
  _xliteDaemonSettingsDir = '';
  /**
   * @type {string}
   * @private
   */
  _xliteDaemonBackupDir = '';
  /**
   * @type {string}
   * @private
   */
  _xliteDaemonKeyPath = '';
  /**
   * @type {Map<string, CCWalletConf>}
   * @private
   */
  _xliteDaemonConfs = new Map();
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
   * True when the running daemon was adopted (already running at startSPV)
   * rather than spawned by this session — shutdown must still stop it.
   * @type {boolean}
   * @private
   */
  _adopted = false;
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
   * Holds the wallet password from XLITE_DAEMON_WALLET_PASS env var.
   * Cleared after first use for security.
   * @type {string|null}
   * @private
   */
  _envPassword = null;

  /**
   * Default path function for xlite-daemon installations.
   * @return {string}
   */
  static defaultPathFunc() {
    const appData = electron.app.getPath('appData');
    const newPath = path.join(appData, 'xlite-daemon');
    const oldPath = path.join(appData, 'CloudChains');
    try {
      if (fs.existsSync(newPath)) return newPath;
      if (fs.existsSync(oldPath)) return oldPath;
    } catch (_) { /* ignore */ }
    return newPath;
  }

  /**
   * Constructor
   * @param pathFunc {function}
   * @param storage {SimpleStorage}
   */
  constructor(pathFunc, storage) {
    this._xliteDaemonDir = pathFunc();
    this._xliteDaemonSettingsDir = path.join(this._xliteDaemonDir, 'settings');
    this._xliteDaemonBackupDir = path.join(this._xliteDaemonDir, 'backups');
    this._xliteDaemonKeyPath = path.join(this._xliteDaemonDir, 'key.dat');
    this._storage = storage;
  }

  /**
   * Returns true if xlite-daemon has been installed (or run for the first time).
   * @return {boolean}
   */
  isInstalled() {
    try {
      return fs.pathExistsSync(this._xliteDaemonKeyPath);
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
      return fs.pathExistsSync(path.join(this._xliteDaemonSettingsDir, 'config-master.json'));
    } catch (err) {
      logger.error('has settings check failed', err);
      return false;
    }
  }

  /**
   * xlite-daemon configuration directory.
   * @return {string}
   */
  getXliteDaemonDir() {
    return this._xliteDaemonDir;
  }

  /**
   * Return xlite-daemon wallet settings directory.
   * @return {string}
   */
  getSettingsDir() {
    return this._xliteDaemonSettingsDir;
  }

  /**
   * Return xlite-daemon wallet backup directory.
   * @return {string}
   */
  getBackupDir() {
    return this._xliteDaemonBackupDir;
  }

  /**
   * Return xlite-daemon wallet key file
   * @return {string}
   */
  getKeyPath() {
    return this._xliteDaemonKeyPath;
  }

  /**
   * Return the wallet conf with the specified ticker. Returns null
   * if no config was found.
   * @param ticker {string}
   * @return {CCWalletConf|null}
   */
  getWalletConf(ticker) {
    if (this._xliteDaemonConfs.has(ticker))
      return this._xliteDaemonConfs.get(ticker);
    return null;
  }

  /**
   * Return the wallet confs.
   * @return {Array<CCWalletConf>}
   */
  getWalletConfs() {
    return Array.from(this._xliteDaemonConfs.values());
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
   * Save the xlite-daemon wallet credentials.
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
   * Return the last known xlite-daemon wallet password. This is encrypted.
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
   * Store the wallet password from XLITE_DAEMON_WALLET_PASS env var.
   * Called once at startup by the main process.
   * @param password {string}
   */
  setEnvPassword(password) {
    this._envPassword = password;
  }

  /**
   * Clear the stored env password. Called after auto-login or on reset.
   */
  clearEnvPassword() {
    this._envPassword = null;
  }

  /**
   * Return the last known xlite-daemon wallet mnemonic. This is encrypted.
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
   * Synchronously read all xlite-daemon token confs from disk. Returns false on error.
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
          } else if (manifest && manifest.getToken(ticker)) { // daemon owns rpcPort via getCoins — no overwrite
            if (conf.addressCount < defaultAddressCount) {
              conf.addressCount = defaultAddressCount;
              this._updateConfRpc(conf, filePath, fs.writeJsonSync);
            }
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

    this._xliteDaemonConfs = new Map();
    for (const conf of confs)
      this._xliteDaemonConfs.set(conf.ticker(), conf);

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
   * Gets the working directory of the xlite-daemon executable
   * @returns {string}
   */
  getCLIDir() {
    const dirname = daemonBinDirs[this._platform];
    if(isDev) {
      return path.resolve(__dirname, `../../../bin/${dirname}`);
    } else {
      return path.resolve(__dirname, `../../../bin/${dirname}`).replace('app.asar', 'app.asar.unpacked');
    }
  }

  /**
   * Gets the xlite-daemon CLI file path
   * @returns {string}
   */
  getCCSPVFilePath() {
    const platform = this._platform;
    return path.join(this.getCLIDir(), daemonBinNames[platform]);
  }

  /** @deprecated alias */
  getXliteDaemonFilePath() {
    return this.getCCSPVFilePath();
  }

  /**
   * Verifies the bundled daemon binary against its bin.json SHA256 pin.
   * The pin protects the DISTRIBUTION chain: packaged/released apps refuse
   * to run a binary that doesn't match bin.json. In development the local
   * bin/ directory IS the developer's build output — a mismatch there logs
   * a warning and proceeds, so swapping in a freshly built daemon needs no
   * manual bookkeeping.
   * @returns {Promise<void>} rejects on pin mismatch (packaged builds only)
   */
  async _verifyPinnedBinary() {
    const binKey = daemonBinDirs[this._platform];
    let binJson;
    try {
      binJson = await fs.readJson(path.resolve(__dirname, '../../../bin.json'));
    } catch (e) {
      logger.warn(`_verifyPinnedBinary: bin.json unavailable (${e.message}); skipping verification`);
      return;
    }
    const entry = binJson && binJson[binKey];
    if (!entry || !entry.hash) {
      logger.warn(`_verifyPinnedBinary: no pinned hash for platform '${binKey}'; skipping verification`);
      return;
    }
    const filePath = this.getCCSPVFilePath();
    const hash = crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex');
    if (hash !== entry.hash.toLowerCase()) {
      if (!isDev) {
        throw new Error(`daemon binary failed integrity check: sha256(${filePath})=${hash} != pinned ${entry.hash}`);
      }
      logger.warn(`_verifyPinnedBinary: running UNPINNED daemon binary in dev mode: `
        + `sha256(${filePath})=${hash} (pin: ${entry.hash})`);
    }
  }

  /**
   * Gets the version of the CC CLI and returns an empty string on failure
   * @returns {Promise<string>}
   */
  getXliteDaemonVersion() {
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
          resolve(UNKNOWN_XLITE_DAEMON_VERSION);
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
  /** @deprecated alias for one release */
  getCCSPVVersion() {
    return this.getXliteDaemonVersion();
  }

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
    } catch (_err) {
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
   * Starts the xlite-daemon CLI.
   * Uses env-var-only credential passing (no stdin writes).
   * @param password {string}
   * @returns {Promise<boolean>}
   */
  startSPV(password = '') {
    return new Promise(resolve => {
      this.isWalletRPCRunning().then(async running => {
        if (running) {
          logger.info('xlite-daemon wallet running');
          // We did not spawn this daemon — track it so shutdown still stops it.
          this._adopted = true;
          resolve(true);
          return;
        }

        this._adopted = false;

        if (this.spvIsRunning()) {
          const prior = this._cli;
          prior.kill(DAEMON_STOP_SIGNAL);
          this._cli = null;
          // Bounded wait for full exit: graceful shutdown flushes wallet
          // state and releases the master port; respawning before that
          // loses the 9955 bind race.
          await awaitDaemonExit(prior);
        }

        let settled = false;
        const settle = (value) => {
          if (settled) return;
          settled = true;
          resolve(value);
        };

        try {
          await this._verifyPinnedBinary();
        } catch (e) {
          logger.error(`startSPV: ${e.message}`);
          settle(false);
          return;
        }

        logger.info('Starting xlite-daemon daemon');

        // Use env password if caller provided none and env password is available
        const effectivePassword = (!password && this._envPassword) ? this._envPassword : password;

        const args = effectivePassword ? ['--password'] : [];
        let cli;
        try {
          cli = this._spawn(
            this.getCCSPVFilePath(),
            args,
            {
              detached: false,
              windowsHide: true,
              env: this._getDaemonEnv(effectivePassword),
            }
          );
        } catch (err) {
          logger.error(`startSPV spawn error: ${err.message}`);
          settle(false);
          return;
        }

        // One-shot use: clear env password after successful spawn
        if (effectivePassword) this._envPassword = null;

        let sawBadPassword = false;

        // Match patterns per LINE: daemon prompts are line-oriented, and
        // chunk boundaries on the pipe can coalesce earlier output (e.g.
        // startup warnings) into the same buffer, which broke ^-anchored
        // regexes tested against raw chunks and stalled stdin flows.
        const handleStdoutLine = (line) => {
          if (settled) return;
          if (this._badPasswordPatt.test(line)) {
            sawBadPassword = true;
          } else if (DAEMON_STDOUT.SELECTION_MENU.test(line)) {
            // Interactive menu means no wallet/no env password — fail fast
            // instead of idling until the safety timeout kills us.
            logger.warn('startSPV: selection menu detected; aborting');
            try { cli.kill(DAEMON_STOP_SIGNAL); } catch (e) { /* noop */ }
            settle(false);
          } else if (DAEMON_STDOUT.RPC_SERVER_READY.test(line)) {
            const expiry = unixTime() + this._rpcStartExpirySeconds;
            this._waitForRpc(expiry, this._rpcWaitDelay)
              .then((available) => settle(available))
              .catch(() => settle(false));
          }
        };

        cli.stdout.on('data', (data) => {
          try {
            if (settled) return;
            const str = data.toString('utf8');
            str.split(/\r?\n/).forEach(handleStdoutLine);
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
          if (sawBadPassword) {
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
            cli.kill(DAEMON_STOP_SIGNAL);
            settle(false);
          }
        }, this._rpcStartExpirySeconds * 1000 * 3);

        this._cli = cli;
      });
    });
  }

  /**
   * Stops the xlite-daemon CLI
   * @returns {Promise<boolean>}
   */
  async stopSPV() {
    // Adopted daemon: we never spawned it, so there is no child handle —
    // but an unlocked wallet must not be left running after quit.
    if ((!this._cli || _.isNumber(this._cli.exitCode)) && this._adopted) {
      this._cli = null;
      // Adopted daemon that already died on its own: nothing to stop, and
      // reporting failure here would spam a spurious shutdown error.
      const stopped = await this.isWalletRPCRunning()
        ? await this._rpc.ccStop()
        : true;
      this._adopted = false;
      return stopped;
    }
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
        return this._cli.kill(DAEMON_STOP_SIGNAL);
    }
    return r;
  }

  /**
   * Creates a new xlite-daemon wallet.
   * Uses env-var-only credential passing (no stdin writes).
   * Resolves with mnemonic string on success, rejects with descriptive Error on failure.
   * @param password {string}
   * @param mnemonic {string}
   * @returns {Promise<string>}
   */
  createSPVWallet(password, mnemonic = '') {
    // Async executor: the pre-spawn section must await the previous
    // daemon's full exit. The wrapper try/catch routes any accidental
    // throw to reject; explicit failure paths call settle()/reject.
    return new Promise(async (resolve, reject) => {
      try {
        await this._createSPVWalletInner(resolve, reject, password, mnemonic);
      } catch (e) {
        reject(e);
      }
    });
  }

  async _createSPVWalletInner(resolve, reject, password, mnemonic = '') {
    // --- Pre-flight checks ---
    if (!password) {
      reject(new Error('failed to create wallet with empty password'));
      return;
    }

    // Kill existing process if running
    const prior = this.spvIsRunning() ? this._cli : null;
    if (prior) {
      prior.kill(DAEMON_STOP_SIGNAL);
      this._cli = null;
    }

    // Wait (bounded) for full exit before touching its key file or
    // respawning: the daemon's shutdown hook flushes wallet state and
    // releases the master port; moving files or rebinding mid-flush
    // races that teardown.
    await awaitDaemonExit(prior);

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
      cli.kill(DAEMON_STOP_SIGNAL);
      settle(new Error('wallet creation timed out'), true);
    }, timeoutMs);

    // Watch this process
    this._cli = cli;
  }

  /**
   * Enables all wallets using the xlite-daemon CLI param --enablerpcandconfigure.
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
          cli.kill(DAEMON_STOP_SIGNAL);
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

      cli.on('exit', (code) => {
        if (!settled) {
          clearTimeout(timeout);
          logger.info(`enableAllWallets daemon exited with code ${code}`);
          settle(code === DAEMON_EXIT.SUCCESS);
        }
      });

      // Timeout safety net
      const timeout = setTimeout(() => {
        if (!settled) {
          cli.kill(DAEMON_STOP_SIGNAL);
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
      const tokens = [...this._xliteDaemonConfs.keys()];
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
   * Change the wallet password using the xlite-daemon CLI param --changepassword.
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
          cli.kill(DAEMON_STOP_SIGNAL);
        } else if (DAEMON_STDOUT_ERRORS.CHANGEPASSWORDFAILED.test(str)) {
          settle(false);
          cli.kill(DAEMON_STOP_SIGNAL);
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
          cli.kill(DAEMON_STOP_SIGNAL);
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
    } catch (_err) {
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
    } catch (_err) {
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

export default XliteDaemon;
