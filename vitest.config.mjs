import {defineConfig, transformWithOxc} from 'vite';

// src/**/*.js files hold JSX with a .js extension; state the classic runtime
// explicitly for them instead of relying on a filename heuristic.
const jsxInJs = {
  name: 'jsx-in-src-js',
  enforce: 'pre',
  async transform(code, id) {
    if (!/(?:^|\/)src\/.*\.js(?:$|\?)/.test(id)) return null;
    const result = await transformWithOxc(code, id, {
      lang: 'jsx',
      jsx: {runtime: 'classic'},
    });
    if (result.errors.length) return {code, errors: result.errors};
    return {code: result.code, map: result.map};
  },
};

export default defineConfig({
  plugins: [jsxInJs],
  test: {
    include: 'tests/unit/**/*.test.js',
    setupFiles: 'tests/unit/setup-env.js',
    testTimeout: 10000,
  },
});
