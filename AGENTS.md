# AGENTS.md

## Project Overview

XLite desktop wallet GUI — Electron 39 + React 19/Redux app (package name
`xlite`, entry `dist/server/index.js`). Client-side only: it spawns and drives
the local **xlite-daemon** binary; it makes no direct exrproxy/plugin-adapter
calls. All blockchain data flows GUI → local JSON-RPC → xlite-daemon → exrproxy
`/xrs/*` → plugin-adapter → utxo-plugin.

Layout: `src/server/` is the Electron main process (daemon lifecycle
`cloudchains.js`, stdout protocol `daemon-protocol.js`, RPC `rpc-controller.js`);
`src/app/` is the renderer (React components/redux); `src/scss/` styles.

## Commands

```bash
npm install        # first setup

npm run build      # babel+webpack+sass -> dist/ (required before start)
npm start          # electron .
npm run start-dev  # electron with remote debugging on :9222
npm run watch      # incremental rebuilds during development

npx vitest run     # modern unit suite (tests/unit/)  [also test:vitest*]
```

- Tests are two coexisting stacks. Modern: vitest on `tests/unit/`. Legacy:
  electron-mocha over `tests/old/*-tests.js|*-rtests.js`
  (`npm run test-main` / `test-renderer`; headless variants
  `test-headless-main` / `test-headless-renderer` wrap `xvfb-maybe`).
- No lint script exists; eslint config is `eslint.config.mjs`. CI does NOT run
  tests — it builds/publishes native packages only.
- CI uses Node lts/Iron (`.github/workflows/build.yml`).

## Daemon integration (fragile coupling — change both sides together)

- Spawns the xlite-daemon native binary from `bin/<os>/xlite-daemon-*`.
  Binaries are SHA256-pinned in **`bin.json`** (URLs point at tryiou/xlite-daemon
  GitHub releases) and fetched via `npm run download-binaries-{linux,win,mac}`.
- `src/server/modules/daemon-protocol.js` regexes must match the daemon's console
  output exactly: `password:`/`mnemonic:` prompts, `master RPC server` ready
  signal, error codes BADPASSWORD/BADMNEMONIC/CHANGEPASSWORDFAILED/
  UNSUPPORTEDCOIN. A daemon log-format change breaks wallet unlock/create flows.
- Local JSON-RPC: master port 9955 (`DEFAULT_MASTER_PORT`,
  `src/app/constants/index.js`) plus per-coin rpcPorts; process lifecycle lives
  in `src/server/modules/cloudchains.js`.

## Packaging

- Order matters: `download-binaries-<os>` BEFORE `build-native-*` /
  `publish-native-*` (CI follows this exact sequence).
- electron-builder stages into `temp/`, outputs to `dist-native/`; targets:
  linux AppImage/deb/tar.gz, mac dmg/zip, win nsis/zip.

## Things to Watch For

- Never commit build artifacts or local state: `dist/`, `dist-native/`,
  `temp/`, `coverage/`, `node_modules/`, `.env` (gitignored; holds live API keys).
- A vendored `blockchain-configuration-files/xbridge-confs/` copy lives inside
  this repo — it is not the workspace's canonical config repo.
- Commit messages: conventional commits `type(scope): description`
  (`feat`, `fix`, `refactor`, `chore`, ...). Branch here is `dev_new`.
