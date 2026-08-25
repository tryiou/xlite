// Copyright (c) 2020 The Blocknet developers
// Distributed under the MIT software license, see the accompanying
// file LICENSE or http://www.opensource.org/licenses/mit-license.php.

/**
 * Shared protocol constants for GUI-daemon communication.
 * These patterns must match the daemon (xlite-daemon) output.
 */

export const DAEMON_EXIT = {
  SUCCESS: 0,
  FAILURE: 1,
};

/**
 * Signal used to stop the daemon process. The daemon's JVM inherits
 * SIGINT as IGNORED through the spawn chain, so INT never runs its
 * shutdown hooks; TERM is the proven hook-running signal. On win32
 * Node maps both to a hard TerminateProcess — unchanged there.
 */
export const DAEMON_STOP_SIGNAL = 'SIGTERM';

export const DAEMON_STDOUT = {
  PASSWORD_PROMPT: /^password:/im,
  MNEMONIC_PROMPT: /^mnemonic:/im,
  // Anchored on the post-bind "listening" line emitted by the daemon AFTER
  // the socket is accepting. The older /master RPC server/i pattern also
  // matched the daemon's error line ("Error during master RPC server
  // operation…"), misreading bind failures as readiness.
  RPC_SERVER_READY: /master\sRPC\sserver\slistening/i,
  SELECTION_MENU: /^selection/i,
  WALLET_EXISTS: /wallet already exists/i,
  PASSWORD_CHANGED: /password changed successfully/i,
};

export const DAEMON_STDOUT_ERRORS = {
  BADPASSWORD: /error\s*\(\s*BADPASSWORD\s*\)/i,
  BADMNEMONIC: /error\s*\(\s*BADMNEMONIC\s*\)/i,
  CHANGEPASSWORDFAILED: /error\s*\(\s*CHANGEPASSWORDFAILED\s*\)/i,
  UNSUPPORTEDCOIN: /error\s*\(\s*UNSUPPORTEDCOIN\s*\)/i,
};

export const DAEMON_STDERR_PATTERNS = {
  FATAL: [
    /failed to load bip39 word list/i,
    /failed to obtain strong securerandom/i,
    /failed to create wallet file/i,
    /cannot read wallet file/i,
    /no write permission/i,
    /failed to create backups directory/i,
    /critical/i,
  ],
  NON_FATAL: [
    /warning/i,
    /deprecat/i,
    /mime.cache/i,
    /appimage/i,
  ],
};
