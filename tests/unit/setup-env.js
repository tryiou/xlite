// Test environment bootstrap: runs before every test module and the modules
// they import. Renderer code reads window/localStorage; Dexie caches its
// IndexedDB API at import time, so the polyfill must be in place first.
import 'fake-indexeddb/auto';

if (!('window' in globalThis))
  globalThis.window = globalThis;
window.api = {isDev: true, general_getStaticDir: () => ''}; // renderer api stub

if (!('localStorage' in globalThis)) {
  const data = new Map();
  globalThis.localStorage = {
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
    clear: () => data.clear(),
  };
}
