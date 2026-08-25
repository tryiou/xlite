import path from 'path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {applyDataHome, xliteDataHome} from '../../../src/server/modules/env-paths';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('xliteDataHome', () => {
  it('returns null when XLITE_DATA_HOME is unset/empty/blank', () => {
    expect(xliteDataHome({})).toBeNull();
    expect(xliteDataHome({XLITE_DATA_HOME: ''})).toBeNull();
    expect(xliteDataHome({XLITE_DATA_HOME: '   '})).toBeNull();
    expect(xliteDataHome(undefined)).toBeNull();
  });

  it('trims and resolves the override to an absolute path', () => {
    expect(xliteDataHome({XLITE_DATA_HOME: ' /tmp/sandbox/data '}))
      .toBe(path.resolve('/tmp/sandbox/data'));
    expect(path.isAbsolute(xliteDataHome({XLITE_DATA_HOME: 'relative/root'}))).toBe(true);
  });
});

describe('applyDataHome', () => {
  const fakeApp = (name = 'xlite') => ({
    name,
    calls: [],
    setPath(p, v) { this.calls.push([p, v]); },
    getName() { return this.name; },
  });

  it('redirects appData and userData beneath the data root (userData uses app name)', () => {
    const app = fakeApp('XLite');
    const root = applyDataHome(app, '/tmp/xlite-sandbox/data');
    expect(root).toBe('/tmp/xlite-sandbox/data');
    expect(app.calls).toEqual([
      ['appData', '/tmp/xlite-sandbox/data'],
      ['userData', path.join('/tmp/xlite-sandbox/data', 'XLite')],
    ]);
  });

  it('default root comes from process.env.XLITE_DATA_HOME', () => {
    vi.stubEnv('XLITE_DATA_HOME', '/env/provided/root');
    const app = fakeApp('xlite');
    const root = applyDataHome(app);
    expect(root).toBe(path.resolve('/env/provided/root'));
    expect(app.calls).toEqual([
      ['appData', path.resolve('/env/provided/root')],
      ['userData', path.join(path.resolve('/env/provided/root'), 'xlite')],
    ]);
  });

  it('falls back to "xlite" when getName() returns empty', () => {
    const app = fakeApp('');
    const root = applyDataHome(app, '/tmp/xlite-sandbox/data');
    expect(app.calls[1]).toEqual(['userData', path.join('/tmp/xlite-sandbox/data', 'xlite')]);
  });

  it('is a no-op returning null when no override is set or app missing', () => {
    const spy = {setPath: vi.fn()};
    expect(applyDataHome(null, '/tmp/x')).toBeNull();
    expect(applyDataHome(spy, null)).toBeNull();
    expect(spy.setPath).not.toHaveBeenCalled();
  });
});
