const fakeExecFile = () => {

  const stdoutCallbacks = {};
  const stderrCallbacks = {};
  let fakeChildProcess, callback, killed;

  return {
    execFile(filePath, args, cb) {
      callback = cb;
      fakeChildProcess = {
        // properties used by the CC CLI methods
        stdout: {
          on(eventName, func) {
            stdoutCallbacks[eventName] = func;
          }
        },
        stderr: {
          on(eventName, func) {
            stderrCallbacks[eventName] = func;
          }
        },
        stdin: {
          write() {

          }
        },
        kill() {
          killed = true;
        },
        exitCode: null
      };
      return fakeChildProcess;
    },
    // manipulation methods for testing only
    mockErr() {
      setTimeout(() => {
        callback(new Error('something'));
      }, 0);
    },
    mockWrite(str) {
      setTimeout(() => {
        stdoutCallbacks.data(Buffer.from(str, 'utf8'));
      }, 0);
    },
    mockClose() {
      setTimeout(() => {
        if(stdoutCallbacks.close) {
          stdoutCallbacks.close();
        }
        callback();
      }, 0);
    },
    mockExitCode(code) {
      fakeChildProcess.exitCode = code;
    },
    wasKilled() {
      return killed;
    }
  };
};

export class FakeSpawn {
  stdoutCallbacks = {};
  stderrCallbacks = {};
  exitCallbacks = [];
  killed = false;
  _spawnedProcess = null;

  spawn = () => {
    const self = this;
    const stdoutOn = (function(eventName, func) {
      if (!self.stdoutCallbacks[eventName])
        self.stdoutCallbacks[eventName] = [];
      if (func)
        self.stdoutCallbacks[eventName].push(func);
    }).bind(this);
    const stderrOn = (function(eventName, func) {
      if (!self.stderrCallbacks[eventName])
        self.stderrCallbacks[eventName] = [];
      if (func)
        self.stderrCallbacks[eventName].push(func);
    }).bind(this);
    const exitOn = (eventName, func) => {
      if (eventName === 'exit')
        self.exitCallbacks.push(func);
    };
    this._spawnedProcess = {
      // properties used by the CC CLI methods
      stdout: {
        on: stdoutOn
      },
      stderr: {
        on: stderrOn
      },
      stdin: {
        write() {},
        setEncoding() {},
        end() {}
      },
      kill: () => {
        this.killed = true;
      },
      on: exitOn,
      exitCode: null
    };
    return this._spawnedProcess;
  }

  // Trigger process-level 'exit' handlers, then stdout 'close' handlers.
  // Sets exitCode on the spawned process (matching real Node.js behavior).
  close(code = 0) {
    if (this._spawnedProcess)
      this._spawnedProcess.exitCode = code;
    const exitCbs = [...this.exitCallbacks];
    for (const cb of exitCbs)
      cb(code);
    const cbs = this.stdoutCallbacks['close'];
    if (cbs) {
      const snapshot = [...cbs];
      for (const cb of snapshot)
        cb();
    }
  }

  stdout(name, data = '') {
    const cbs = this.stdoutCallbacks[name];
    if (cbs) {
      for (const cb of cbs)
        cb(data);
    }
  }

  stderr(name, data = '') {
    const cbs = this.stderrCallbacks[name];
    if (cbs) {
      for (const cb of cbs)
        cb(data);
    }
  }

  // Clear callbacks and state in-place (don't replace objects,
  // because the spawn arrow function captured references to them).
  clear() {
    for (const key of Object.keys(this.stdoutCallbacks))
      delete this.stdoutCallbacks[key];
    for (const key of Object.keys(this.stderrCallbacks))
      delete this.stderrCallbacks[key];
    this.exitCallbacks = [];
    this.killed = false;
    this._spawnedProcess = null;
  }
}

export default fakeExecFile;
