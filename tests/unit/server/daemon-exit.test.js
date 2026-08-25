import {describe, expect, it, vi, afterEach} from 'vitest';
import {awaitDaemonExit, DAEMON_EXIT_GRACE_MS} from '../../../src/server/modules/daemon-exit';

const fakeChild = () => ({
  exitCode: null,
  signalCode: null,
  killed: false,
  listeners: {},
  kill(sig) {
    this.killed = true;
    this.lastSignal = sig;
  },
  once(ev, fn) {
    this.listeners[ev] = fn;
  },
  emitExit(code = 0, signal = null) {
    this.exitCode = code;
    this.signalCode = signal;
    this.listeners.exit && this.listeners.exit();
  },
});

afterEach(() => {
  vi.useRealTimers();
});

describe('awaitDaemonExit', () => {
  it('resolves immediately for an already-dead child', async () => {
    const child = fakeChild();
    child.exitCode = 0;
    await expect(awaitDaemonExit(child, 5000)).resolves.toBeUndefined();
    expect(child.killed).toBe(false);
  });

  it('resolves on graceful exit without any signal', async () => {
    vi.useFakeTimers();
    const child = fakeChild();
    const p = awaitDaemonExit(child, DAEMON_EXIT_GRACE_MS);
    child.emitExit(0);
    await p;
    expect(child.killed).toBe(false);
  });

  it('force-kills at grace expiry and resolves only after exit', async () => {
    vi.useFakeTimers();
    const child = fakeChild();
    const p = awaitDaemonExit(child, DAEMON_EXIT_GRACE_MS);
    let settled = false;
    p.then(() => { settled = true; });

    vi.advanceTimersByTime(DAEMON_EXIT_GRACE_MS);
    expect(child.killed).toBe(true);
    expect(child.lastSignal).toBe('SIGKILL');
    // resolution must NOT precede teardown completion
    await Promise.resolve();
    expect(settled).toBe(false);

    child.emitExit(null, 'SIGKILL');
    await p;
    expect(settled).toBe(true);
  });
});
