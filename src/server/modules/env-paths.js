// Copyright (c) 2020 The Blocknet developers
// Distributed under the MIT software license, see the accompanying
// file LICENSE or http://www.opensource.org/licenses/mit-license.php.
import path from 'path';

/**
 * XLITE_DATA_HOME support — one variable redirecting BOTH xlite apps' state.
 *
 * When set, it replaces the platform application-data root for:
 *  - this GUI:   appData → $XLITE_DATA_HOME, userData → $XLITE_DATA_HOME/xlite
 *  - xlite-daemon: its own state root ($XLITE_DATA_HOME/CloudChains), see
 *    App.resolveUserConfigDir() in the daemon source.
 *
 * This module MUST be imported before anything resolves
 * app.getPath('appData') or app.getPath('userData') (i.e. before
 * ./constants and ./modules/logger evaluate). It self-applies on import
 * when running inside Electron and stays inert under plain node (tests).
 */

/** Pure: extract a non-blank XLITE_DATA_HOME override from an env-like object. */
export function xliteDataHome(env = process.env) {
  const v = env && env.XLITE_DATA_HOME;
  if (!v || !String(v).trim())
    return null;
  return path.resolve(String(v).trim());
}

/**
 * Redirect an Electron app's appData/userData beneath the given data root.
 * @param app {Electron.App}
 * @param root {string|null} resolved data root; defaults to xliteDataHome()
 * @returns {string|null} the applied root, or null when no override is set
 */
export function applyDataHome(app, root = xliteDataHome()) {
  if (!root || !app)
    return null;
  app.setPath('appData', root);
  app.setPath('userData', path.join(root, 'xlite'));
  return root;
}

try {
  const electron = require('electron');
  if (electron && typeof electron === 'object' && electron.app)
    applyDataHome(electron.app);
} catch (_) { /* non-electron context (unit tests) */ }
