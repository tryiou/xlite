// Copyright (c) 2020 The Blocknet developers
// Distributed under the MIT software license, see the accompanying
// file LICENSE or http://www.opensource.org/licenses/mit-license.php.

import fs from 'fs-extra';
import path from 'path';
import electron from 'electron';
import { DEFAULT_MASTER_PORT } from '../constants';

/**
 * Minimal ConfigHelper for master daemon RPC.
 * Reads config-master.json from xlite-daemon settings dir.
 * Used by ConfController to fetch getCoins via localhost RPC.
 */
class ConfigHelper {
  _ticker = 'master';
  _conf = null;

  constructor(ticker = 'master') {
    this._ticker = ticker;
    this._conf = this._loadConf();
  }

  _getSettingsDir() {
    // Mirrors XliteDaemon.defaultPathFunc (xlite-daemon.js) plus the
    // /settings join; kept local so ConfController needs no daemon instance.
    // NOTE: the no-electron.app fallback below joins $HOME directly while
    // real Electron appData is $HOME/.config — that branch only runs in
    // tests, do not "align" either side.
    try {
      const appData = electron.app ? electron.app.getPath('appData') : (process.env.APPDATA || process.env.HOME || '/tmp');
      const newPath = path.join(appData, 'xlite-daemon', 'settings');
      const oldPath = path.join(appData, 'CloudChains', 'settings');
      if (fs.existsSync(newPath)) return newPath;
      if (fs.existsSync(oldPath)) return oldPath;
      return newPath;
    } catch (_) {
      return path.join('/tmp', 'xlite-daemon', 'settings');
    }
  }

  _loadConf() {
    try {
      const dir = this._getSettingsDir();
      const file = path.join(dir, `config-${this._ticker}.json`);
      if (fs.existsSync(file)) {
        return fs.readJsonSync(file);
      }
    } catch (_) { /* ignore: fall through to null conf */ }
    return null;
  }

  getMasterRpcPort() {
    // Hardened mirror of XliteDaemon._checkUpdateMasterConf: a non-default
    // privileged or non-numeric port in a (possibly hand-edited)
    // config-master.json is never trusted for localhost RPC (the original
    // keeps non-numeric strings; this falls back to default instead).
    const port = this._conf && Number(this._conf.rpcPort);
    if (!Number.isFinite(port) || port <= 0) return DEFAULT_MASTER_PORT;
    if (port !== DEFAULT_MASTER_PORT && port <= 1024) return DEFAULT_MASTER_PORT;
    return port;
  }

  getRpcUsername() {
    if (this._conf && this._conf.rpcUsername) return this._conf.rpcUsername;
    return '';
  }

  getRpcPassword() {
    if (this._conf && this._conf.rpcPassword) return this._conf.rpcPassword;
    return '';
  }
}

export default ConfigHelper;
