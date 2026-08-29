// Base contract tests for the GUI<->xlite-daemon stdout protocol.
// These regexes are the single most fragile coupling in the product:
// every pattern here must match REAL daemon output verbatim and must
// NOT match lookalike lines (errors, pre-bind chatter). If any of these
// fail, wallet unlock/create flows break at runtime.
import { describe, it, expect } from 'vitest';
import {
  DAEMON_EXIT,
  DAEMON_STDOUT,
  DAEMON_STDOUT_ERRORS,
  DAEMON_STOP_SIGNAL,
} from '../../../src/server/modules/daemon-protocol.js';

// Real daemon output samples (see xlite-daemon JSONRPCMasterServer.java,
// ConsoleMenu.java). Keep in sync with the pinned binary's wording.
const READY_POST_BIND = '[rpc-master] Master RPC server listening on port 9955.';
const STARTING_PRE_BIND = '[rpc] Starting master RPC server on port 9955.';
const MASTER_ERROR_LINE =
  'WARNING: [rpc-master] Error during master RPC server operationAddress already in use';
const COIN_LISTENING = '[rpc] RPC server listening for DASH on port 19998.';
const PASSWORD_PROMPT_LINE = 'Password:';
const COALESCED_CHUNK =
  'INFO: [discovery-BLOCK] Discovery complete: lastBatch=0\n' +
  'WARNING: Failed to initialize file handler\n' +
  'Password:\n';
const SELECTION_LINE = 'Selection: ';

describe('daemon-protocol: readiness signal', () => {
  it('matches ONLY the post-bind listening line', () => {
    expect(DAEMON_STDOUT.RPC_SERVER_READY.test(READY_POST_BIND)).toBe(true);
  });

  it('does not mistake the pre-bind "Starting" line for readiness', () => {
    expect(DAEMON_STDOUT.RPC_SERVER_READY.test(STARTING_PRE_BIND)).toBe(false);
  });

  it('does not mistake a bind-failure ERROR line for readiness', () => {
    // Regression guard: the original /master\sRPC\sserver/i pattern matched
    // this error line, making the GUI treat a dead socket as ready for the
    // full poll expiry.
    expect(DAEMON_STDOUT.RPC_SERVER_READY.test(MASTER_ERROR_LINE)).toBe(false);
  });

  it('is agnostic to per-coin listener lines (they are informational)', () => {
    // Master readiness drives startSPV; coin listeners announce separately.
    expect(DAEMON_STDOUT.RPC_SERVER_READY.test(COIN_LISTENING)).toBe(false);
  });
});

describe('daemon-protocol: prompt matching under chunk coalescing', () => {
  // The GUI must split stdout chunks into lines before testing ^-anchored
  // patterns; a bare .test(chunk) with /^password:/i fails when earlier
  // output shares the same pipe read.
  const matchPerLine = (re, chunk) =>
    chunk.split(/\r?\n/).some((line) => re.test(line));

  it('PASSWORD_PROMPT matches a dedicated prompt line', () => {
    expect(matchPerLine(DAEMON_STDOUT.PASSWORD_PROMPT, PASSWORD_PROMPT_LINE)).toBe(true);
  });

  it('PASSWORD_PROMPT survives coalescing with earlier output', () => {
    expect(matchPerLine(DAEMON_STDOUT.PASSWORD_PROMPT, COALESCED_CHUNK)).toBe(true);
    // The /m flag makes ^ match at every line start, so even a raw-chunk
    // .test() is now safe; callers keep per-line splitting as
    // defense-in-depth for patterns without /m.
    expect(DAEMON_STDOUT.PASSWORD_PROMPT.test(COALESCED_CHUNK)).toBe(true);
  });

  it('SELECTION_MENU is line-anchored', () => {
    expect(DAEMON_STDOUT.SELECTION_MENU.test(SELECTION_LINE)).toBe(true);
    expect(
      DAEMON_STDOUT.SELECTION_MENU.test('the menu offers several Selection options'),
    ).toBe(false);
  });
});

describe('daemon-protocol: error-code coupling', () => {
  // Daemon emits: "[master] Error(<CODE>): <msg>" (ConsoleMenu.logBad*).
  it('BADPASSWORD matches the daemon emission format', () => {
    expect(
      DAEMON_STDOUT_ERRORS.BADPASSWORD.test('[master] Error(BADPASSWORD): Bad password'),
    ).toBe(true);
  });

  it('BADMNEMONIC matches the daemon emission format', () => {
    expect(
      DAEMON_STDOUT_ERRORS.BADMNEMONIC.test('[master] Error(BADMNEMONIC): Bad mnemonic'),
    ).toBe(true);
  });

  it('CHANGEPASSWORDFAILED matches the daemon emission format', () => {
    expect(
      DAEMON_STDOUT_ERRORS.CHANGEPASSWORDFAILED.test(
        '[master] Error(CHANGEPASSWORDFAILED): wrong current password',
      ),
    ).toBe(true);
  });
});

describe('daemon-protocol: exit codes', () => {
  it('treats exit 0 as success only', () => {
    // Auth failures now exit nonzero (4/5); anything != SUCCESS must be
    // treated as failure by callers.
    expect(DAEMON_EXIT.SUCCESS).toBe(0);
    expect(DAEMON_EXIT.FAILURE).not.toBe(DAEMON_EXIT.SUCCESS);
  });
});

describe('daemon-protocol: stop signal', () => {
  it('stops the daemon with SIGTERM so its shutdown hook runs', () => {
    // The daemon's JVM inherits SIGINT as IGNORED through the spawn
    // chain — INT can never trigger its shutdown hooks. TERM is the
    // proven hook-running signal (daemon-side repro + wave evidence).
    expect(DAEMON_STOP_SIGNAL).toBe('SIGTERM');
  });
});

describe('daemon-protocol: stop signal usage contract', () => {
  // The constant is only meaningful if every stop path uses it. Reading
  // the module source as data pins that contract without needing to
  // boot the full xlite-daemon module graph (electron et al.) in tests.
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(
    path.join(__dirname, '../../../src/server/modules/xlite-daemon.js'),
    'utf8'
  );

  it('routes every daemon kill through DAEMON_STOP_SIGNAL', () => {
    expect(src.includes("kill(DAEMON_STOP_SIGNAL)")).toBe(true);
  });

  it('has no hardcoded SIGINT kills left', () => {
    expect(/kill\(\s*'SIGINT'/.test(src)).toBe(false);
  });
});

describe('daemon-protocol: stop-signal hygiene', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(
    path.join(__dirname, '../../../src/server/modules/xlite-daemon.js'),
    'utf8'
  );

  it('never kills with any SIGINT literal form', () => {
    expect(/kill\(\s*['"`]SIGINT/.test(src)).toBe(false);
  });

  it('defines settle before its first use in startSPV', () => {
    // Regression pin: startSPV's _verifyPinnedBinary catch called
    // settle() before its const declaration (TDZ ReferenceError),
    // leaving the outer promise pending forever on packaged builds.
    const fn = src.slice(src.indexOf('startSPV('),
                         src.indexOf("logger.info('Starting xlite-daemon daemon')"));
    const declareAt = fn.indexOf('const settle =');
    const firstUseAt = fn.indexOf('settle(false)');
    expect(declareAt).toBeGreaterThan(-1);
    expect(firstUseAt).toBeGreaterThan(-1);
    expect(declareAt).toBeLessThan(firstUseAt);
  });
});
