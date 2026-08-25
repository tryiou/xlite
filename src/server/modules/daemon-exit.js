// Copyright (c) 2020 The Blocknet developers
// Distributed under the MIT software license, see the accompanying
// file LICENSE or http://www.opensource.org/licenses/mit-license.php.

export const DAEMON_EXIT_GRACE_MS = 10000;

/**
 * Resolves once the child process has fully exited. After the grace
 * period it force-kills so a wedged shutdown cannot stall callers
 * indefinitely (a kill failure with a never-exiting process is treated
 * as unrecoverable by the caller's outer timeouts). TERM-triggered
 * hooks (wallet flush, port release) complete before any respawn or
 * file operation depends on them: resolution comes from the child's
 * 'exit' event, or immediately when the child is already dead.
 */
export function awaitDaemonExit(child, graceMs = DAEMON_EXIT_GRACE_MS) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
    }, graceMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
