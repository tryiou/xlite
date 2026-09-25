// Copyright (c) 2020 The Blocknet developers
// Distributed under the MIT software license, see the accompanying
// file LICENSE or http://www.opensource.org/licenses/mit-license.php.
const {contextBridge, ipcRenderer, webFrame} = require('electron');

/**
 * API constants.
 * When updating the api here be sure to update: server/modules/api.js
 */
export const apiConstants = {
  env_shouldAutoLogin: 'env_shouldAutoLogin',
  env_resetAutoLogin: 'env_resetAutoLogin',

  general_isDev: 'general_isDev', // synchronous
  general_getError: 'general_getError',
  general_storeScreenSize: 'general_storeScreenSize',
  general_requestClose: 'general_requestClose',
  general_userLocale: 'general_userLocale',
  general_getLocaleData: 'general_getLocaleData',
  general_getAppVersion: 'general_getAppVersion',
  general_getStaticDir: 'general_getStaticDir',
  general_openUrl: 'general_openUrl',
  general_qrCode: 'general_qrCode',
  general_setClipboard: 'general_setClipboard',
  general_getClipboard: 'general_getClipboard',
  general_zoomIn: 'general_zoomIn',
  general_zoomOut: 'general_zoomOut',
  general_zoomReset: 'general_zoomReset',
  general_getZoomFactor: 'general_getZoomFactor',
  general_setZoomFactor: 'general_setZoomFactor',
  general_onZoomIn: 'general_onZoomIn',
  general_onZoomOut: 'general_onZoomOut',
  general_onZoomReset: 'general_onZoomReset',
  general_getPlatform: 'general_getPlatform',
  general_onShutdown: 'general_onShutdown',
  general_onUpdateAvailable: 'general_onUpdateAvailable',
  general_onUpdateDownloaded: 'general_onUpdateDownloaded',
  general_downloadAvailableUpdate: 'general_downloadAvailableUpdate',
  general_restartInstallUpdate: 'general_restartInstallUpdate',
  general_ccStartupError: 'general_ccStartupError',

  contextMenu_showCopyMenu: 'contextMenu_showCopyMenu',
  contextMenu_showPasteMenu: 'contextMenu_showPasteMenu',
  contextMenu_showStandardMenu: 'contextMenu_showStandardMenu',

  xliteDaemon_isInstalled: 'xliteDaemon_isInstalled',
  xliteDaemon_hasSettings: 'xliteDaemon_hasSettings',
  xliteDaemon_getWalletConf: 'xliteDaemon_getWalletConf',
  xliteDaemon_getWalletConfs: 'xliteDaemon_getWalletConfs',
  xliteDaemon_getMasterConf: 'xliteDaemon_getMasterConf',
  xliteDaemon_isWalletCreated: 'xliteDaemon_isWalletCreated',
  xliteDaemon_saveWalletCredentials: 'xliteDaemon_saveWalletCredentials',
  xliteDaemon_getStoredPassword: 'xliteDaemon_getStoredPassword',
  xliteDaemon_getStoredSalt: 'xliteDaemon_getStoredSalt',
  xliteDaemon_getDecryptedMnemonic: 'xliteDaemon_getDecryptedMnemonic',
  xliteDaemon_loadConfs: 'xliteDaemon_loadConfs',
  xliteDaemon_getXliteDaemonVersion: 'xliteDaemon_getXliteDaemonVersion',
  xliteDaemon_isWalletRPCRunning: 'xliteDaemon_isWalletRPCRunning',
  xliteDaemon_spvIsRunning: 'xliteDaemon_spvIsRunning',
  xliteDaemon_startSPV: 'xliteDaemon_startSPV',
  xliteDaemon_stopSPV: 'xliteDaemon_stopSPV',
  xliteDaemon_createSPVWallet: 'xliteDaemon_createSPVWallet',
  xliteDaemon_enableAllWallets: 'xliteDaemon_enableAllWallets',
  xliteDaemon_changePassword: 'xliteDaemon_changePassword',
  xliteDaemon_matchesStoredPassword: 'xliteDaemon_matchesStoredPassword',
  xliteDaemon_isNewInstall: 'xliteDaemon_isNewInstall',
  xliteDaemon_setAllConfigAddressCounts: 'xliteDaemon_setAllConfigAddressCounts',

  confController_getManifest: 'confController_getManifest',
  confController_getManifestHash: 'confController_getManifestHash',
  confController_getXBridgeInfo: 'confController_getXBridgeInfo',
  confController_getCoinConfigs: 'confController_getCoinConfigs',
  confController_refreshCoins: 'confController_refreshCoins',

  walletController_getWallets: 'walletController_getWallets',
  walletController_getWallet: 'walletController_getWallet',
  walletController_getEnabledWallets: 'walletController_getEnabledWallets',
  walletController_getBalances: 'walletController_getBalances',
  walletController_getCurrencyMultipliers: 'walletController_getCurrencyMultipliers',
  walletController_loadWallets: 'walletController_loadWallets',
  walletController_updatePriceMultipliers: 'walletController_updatePriceMultipliers',
  walletController_updateBalanceInfo: 'walletController_updateBalanceInfo',
  walletController_updateAllBalances: 'walletController_updateAllBalances',
  walletController_walletRpcReady: 'walletController_walletRpcReady',

  wallet_rpcEnabled: 'wallet_rpcEnabled',
  wallet_getBalance: 'wallet_getBalance',
  wallet_getTransactions: 'wallet_getTransactions',
  wallet_getAddresses: 'wallet_getAddresses',
  wallet_generateNewAddress: 'wallet_generateNewAddress',
  wallet_getCachedUnspent: 'wallet_getCachedUnspent',
  wallet_send: 'wallet_send',
  wallet_getExplorerLink: 'wallet_getExplorerLink',
  wallet_getExplorerLinkForTx: 'wallet_getExplorerLinkForTx',
  wallet_getWebsiteLink: 'wallet_getWebsiteLink',

  pricing_getPrice: 'pricing_getPrice',
};

/**
 * Renderer API
 * When updating the api here be sure to update: server/modules/api.js
 */

// ENV var api
const env_API = {
  [apiConstants.env_shouldAutoLogin]: async () => {
    return ipcRenderer.invoke(apiConstants.env_shouldAutoLogin);
  },
  [apiConstants.env_resetAutoLogin]: () => {
    ipcRenderer.send(apiConstants.env_resetAutoLogin);
  },
};

// General api
const general_API = {
  [apiConstants.general_getError]: async () => {
    return ipcRenderer.invoke(apiConstants.general_getError);
  },
  [apiConstants.general_storeScreenSize]: (screenSize) => {
    ipcRenderer.send(apiConstants.general_storeScreenSize, screenSize);
  },
  [apiConstants.general_requestClose]: (reason) => {
    ipcRenderer.send(apiConstants.general_requestClose, reason);
  },
  [apiConstants.general_userLocale]: async () => {
    return ipcRenderer.invoke(apiConstants.general_userLocale);
  },
  [apiConstants.general_getLocaleData]: async (locale) => {
    return ipcRenderer.invoke(apiConstants.general_getLocaleData, locale);
  },
  [apiConstants.general_getAppVersion]: async () => {
    return ipcRenderer.invoke(apiConstants.general_getAppVersion);
  },
  [apiConstants.general_getStaticDir]: () => {
    return ipcRenderer.sendSync(apiConstants.general_getStaticDir);
  },
  [apiConstants.general_openUrl]: async (data) => {
    ipcRenderer.send(apiConstants.general_openUrl, data);
  },
  [apiConstants.general_qrCode]: async (data) => {
    return ipcRenderer.invoke(apiConstants.general_qrCode, data);
  },
  [apiConstants.general_setClipboard]: async (text) => {
    return ipcRenderer.invoke(apiConstants.general_setClipboard, text);
  },
  [apiConstants.general_getClipboard]: async () => {
    return ipcRenderer.invoke(apiConstants.general_getClipboard);
  },
  [apiConstants.general_zoomIn]: () => {
    ipcRenderer.send(apiConstants.general_zoomIn);
  },
  [apiConstants.general_zoomOut]: () => {
    ipcRenderer.send(apiConstants.general_zoomOut);
  },
  [apiConstants.general_zoomReset]: () => {
    ipcRenderer.send(apiConstants.general_zoomReset);
  },
  [apiConstants.general_getZoomFactor]: () => {
    return webFrame.getZoomFactor();
  },
  [apiConstants.general_setZoomFactor]: zoomFactor => {
    webFrame.setZoomFactor(zoomFactor);
  },
  [apiConstants.general_getPlatform]: () => {
    return ipcRenderer.sendSync(apiConstants.general_getPlatform);
  },
  [apiConstants.general_onZoomIn]: callback => {
    ipcRenderer.on(apiConstants.general_onZoomIn, (evt, zoomFactor) => {
      callback(zoomFactor);
    });
  },
  [apiConstants.general_onZoomOut]: callback => {
    ipcRenderer.on(apiConstants.general_onZoomOut, (evt, zoomFactor) => {
      callback(zoomFactor);
    });
  },
  [apiConstants.general_onZoomReset]: callback => {
    ipcRenderer.on(apiConstants.general_onZoomReset, () => {
      callback();
    });
  },
  [apiConstants.general_onShutdown]: callback => {
    ipcRenderer.on(apiConstants.general_onShutdown, () => {
      callback();
    });
  },
  [apiConstants.general_onUpdateAvailable]: callback => {
    ipcRenderer.on(apiConstants.general_onUpdateAvailable, (evt, version) => {
      callback(version);
    });
  },
  [apiConstants.general_onUpdateDownloaded]: callback => {
    ipcRenderer.on(apiConstants.general_onUpdateDownloaded, (evt, version) => {
      callback(version);
    });
  },
  [apiConstants.general_downloadAvailableUpdate]: () => {
    ipcRenderer.send(apiConstants.general_downloadAvailableUpdate);
  },
  [apiConstants.general_restartInstallUpdate]: () => {
    ipcRenderer.send(apiConstants.general_restartInstallUpdate);
  },
  [apiConstants.general_ccStartupError]: dependencyMissing => {
    ipcRenderer.send(apiConstants.general_ccStartupError, dependencyMissing);
  },
};

// Context menu api
const contextMenu_API = {
  [apiConstants.contextMenu_showCopyMenu]: () => {
    ipcRenderer.send(apiConstants.contextMenu_showCopyMenu);
  },
  [apiConstants.contextMenu_showPasteMenu]: () => {
    ipcRenderer.send(apiConstants.contextMenu_showPasteMenu);
  },
  [apiConstants.contextMenu_showStandardMenu]: () => {
    ipcRenderer.send(apiConstants.contextMenu_showStandardMenu);
  },
};

// xlite-daemon api
const xliteDaemon_API = {
  [apiConstants.xliteDaemon_isInstalled]: async () => {
    return ipcRenderer.invoke(apiConstants.xliteDaemon_isInstalled);
  },
  [apiConstants.xliteDaemon_hasSettings]: async () => {
    return ipcRenderer.invoke(apiConstants.xliteDaemon_hasSettings);
  },
  [apiConstants.xliteDaemon_getWalletConf]: async (token) => {
    return ipcRenderer.invoke(apiConstants.xliteDaemon_getWalletConf, token);
  },
  [apiConstants.xliteDaemon_getWalletConfs]: async () => {
    return ipcRenderer.invoke(apiConstants.xliteDaemon_getWalletConfs);
  },
  [apiConstants.xliteDaemon_getMasterConf]: async () => {
    return ipcRenderer.invoke(apiConstants.xliteDaemon_getMasterConf);
  },
  [apiConstants.xliteDaemon_isWalletCreated]: async () => {
    return ipcRenderer.invoke(apiConstants.xliteDaemon_isWalletCreated);
  },
  [apiConstants.xliteDaemon_saveWalletCredentials]: async (hashedPassword, salt, encryptedMnemonic) => {
    return ipcRenderer.invoke(apiConstants.xliteDaemon_saveWalletCredentials, hashedPassword, salt, encryptedMnemonic);
  },
  [apiConstants.xliteDaemon_getStoredPassword]: async () => {
    return ipcRenderer.invoke(apiConstants.xliteDaemon_getStoredPassword);
  },
  [apiConstants.xliteDaemon_getStoredSalt]: async () => {
    return ipcRenderer.invoke(apiConstants.xliteDaemon_getStoredSalt);
  },
  [apiConstants.xliteDaemon_getDecryptedMnemonic]: async (password) => {
    return ipcRenderer.invoke(apiConstants.xliteDaemon_getDecryptedMnemonic, password);
  },
  [apiConstants.xliteDaemon_loadConfs]: async () => {
    return ipcRenderer.invoke(apiConstants.xliteDaemon_loadConfs);
  },
  [apiConstants.xliteDaemon_getXliteDaemonVersion]: async () => {
    return ipcRenderer.invoke(apiConstants.xliteDaemon_getXliteDaemonVersion);
  },
  [apiConstants.xliteDaemon_isWalletRPCRunning]: async () => {
    return ipcRenderer.invoke(apiConstants.xliteDaemon_isWalletRPCRunning);
  },
  [apiConstants.xliteDaemon_spvIsRunning]: async () => {
    return ipcRenderer.invoke(apiConstants.xliteDaemon_spvIsRunning);
  },
  [apiConstants.xliteDaemon_startSPV]: async (password) => {
    return ipcRenderer.invoke(apiConstants.xliteDaemon_startSPV, password);
  },
  [apiConstants.xliteDaemon_stopSPV]: async () => {
    return ipcRenderer.invoke(apiConstants.xliteDaemon_stopSPV);
  },
  [apiConstants.xliteDaemon_createSPVWallet]: async (password, mnemonic) => {
    return ipcRenderer.invoke(apiConstants.xliteDaemon_createSPVWallet, password, mnemonic);
  },
  [apiConstants.xliteDaemon_enableAllWallets]: async () => {
    return ipcRenderer.invoke(apiConstants.xliteDaemon_enableAllWallets);
  },
  [apiConstants.xliteDaemon_changePassword]: async (oldPassword, newPassword) => {
    return ipcRenderer.invoke(apiConstants.xliteDaemon_changePassword, oldPassword, newPassword);
  },
  [apiConstants.xliteDaemon_matchesStoredPassword]: async (password) => {
    return ipcRenderer.invoke(apiConstants.xliteDaemon_matchesStoredPassword, password);
  },
  [apiConstants.xliteDaemon_isNewInstall]: async () => {
    return ipcRenderer.invoke(apiConstants.xliteDaemon_isNewInstall);
  },
  [apiConstants.xliteDaemon_setAllConfigAddressCounts]: async (addressCount) => {
    return ipcRenderer.invoke(apiConstants.xliteDaemon_setAllConfigAddressCounts, addressCount);
  },
};

// ConfController api
const confController_API = {
  [apiConstants.confController_getManifest]: async () => {
    return ipcRenderer.invoke(apiConstants.confController_getManifest);
  },
  [apiConstants.confController_getManifestHash]: async () => {
    return ipcRenderer.invoke(apiConstants.confController_getManifestHash);
  },
  [apiConstants.confController_getXBridgeInfo]: async () => {
    return ipcRenderer.invoke(apiConstants.confController_getXBridgeInfo);
  },
  [apiConstants.confController_getCoinConfigs]: async () => {
    return ipcRenderer.invoke(apiConstants.confController_getCoinConfigs);
  },
  [apiConstants.confController_refreshCoins]: async () => {
    return ipcRenderer.invoke(apiConstants.confController_refreshCoins);
  },
};

// WalletController api
const walletController_API = {
  [apiConstants.walletController_getWallets]: async () => {
    return ipcRenderer.invoke(apiConstants.walletController_getWallets);
  },
  [apiConstants.walletController_getWallet]: async (ticker) => {
    return ipcRenderer.invoke(apiConstants.walletController_getWallet, ticker);
  },
  [apiConstants.walletController_getEnabledWallets]: async () => {
    return ipcRenderer.invoke(apiConstants.walletController_getEnabledWallets);
  },
  [apiConstants.walletController_getBalances]: async () => {
    return ipcRenderer.invoke(apiConstants.walletController_getBalances);
  },
  [apiConstants.walletController_getCurrencyMultipliers]: async () => {
    return ipcRenderer.invoke(apiConstants.walletController_getCurrencyMultipliers);
  },
  [apiConstants.walletController_loadWallets]: async () => {
    return ipcRenderer.invoke(apiConstants.walletController_loadWallets);
  },
  [apiConstants.walletController_updatePriceMultipliers]: async () => {
    return ipcRenderer.invoke(apiConstants.walletController_updatePriceMultipliers);
  },
  [apiConstants.walletController_updateAllBalances]: async () => {
    return ipcRenderer.invoke(apiConstants.walletController_updateAllBalances);
  },
  [apiConstants.walletController_updateBalanceInfo]: async (ticker) => {
    return ipcRenderer.invoke(apiConstants.walletController_updateBalanceInfo, ticker);
  },
  [apiConstants.walletController_walletRpcReady]: async (ticker, timeOut = 0) => {
    return ipcRenderer.invoke(apiConstants.walletController_walletRpcReady, ticker, timeOut);
  },
};

// Wallet api
const wallet_API = {
  [apiConstants.wallet_rpcEnabled]: async (ticker) => {
    return ipcRenderer.invoke(apiConstants.wallet_rpcEnabled, ticker);
  },
  [apiConstants.wallet_getBalance]: async (ticker) => {
    return ipcRenderer.invoke(apiConstants.wallet_getBalance, ticker);
  },
  [apiConstants.wallet_getTransactions]: async (ticker, startTime, endTime) => {
    return ipcRenderer.invoke(apiConstants.wallet_getTransactions, ticker, startTime, endTime);
  },
  [apiConstants.wallet_getAddresses]: async (ticker) => {
    return ipcRenderer.invoke(apiConstants.wallet_getAddresses, ticker);
  },
  [apiConstants.wallet_generateNewAddress]: async (ticker) => {
    return ipcRenderer.invoke(apiConstants.wallet_generateNewAddress, ticker);
  },
  [apiConstants.wallet_getCachedUnspent]: async (ticker, cacheExpirySeconds) => {
    return ipcRenderer.invoke(apiConstants.wallet_getCachedUnspent, ticker, cacheExpirySeconds);
  },
  [apiConstants.wallet_send]: async (ticker, recipients) => {
    return ipcRenderer.invoke(apiConstants.wallet_send, ticker, recipients);
  },
  [apiConstants.wallet_getExplorerLink]: (ticker) => {
    return ipcRenderer.sendSync(apiConstants.wallet_getExplorerLink, ticker);
  },
  [apiConstants.wallet_getExplorerLinkForTx]: (ticker, tx) => {
    return ipcRenderer.sendSync(apiConstants.wallet_getExplorerLinkForTx, ticker, tx);
  },
  [apiConstants.wallet_getWebsiteLink]: (ticker) => {
    return ipcRenderer.sendSync(apiConstants.wallet_getWebsiteLink, ticker);
  },
};

// Pricing api
const pricing_API = {
  [apiConstants.pricing_getPrice]: async (ticker, currency) => {
    return ipcRenderer.invoke(apiConstants.pricing_getPrice, ticker, currency);
  },
};

let init = false;
if (contextBridge && !init) {
  init = true;
  // Set isDev state
  const isDev = ipcRenderer.sendSync(apiConstants.general_isDev);
  contextBridge.exposeInMainWorld('api', {
    isDev,
    ...env_API,
    ...general_API,
    ...contextMenu_API,
    ...xliteDaemon_API,
    ...confController_API,
    ...walletController_API,
    ...wallet_API,
    ...pricing_API,
  });
}
