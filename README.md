# litewallet

## Prerequisites

Requires **Node >=22 (lts/jod)** and npm >=10 (see `package.json` `engines`). Using NVM is **recommended** for local development:

```bash
# recommended (NVM, uses committed .nvmrc):
export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"; nvm use lts/jod
# or: nvm use   # reads .nvmrc (lts/jod)
node -v && npm -v   # should print v22.x + 10.x
```

A `.nvmrc` containing `lts/jod` and `.npmrc` with `engine-strict=true` are committed. CI enforces the same via `actions/setup-node` `lts/jod`. See `AGENTS.md` Prerequisites for workspace-internal NVM usage.

## Getting Started

```bash
export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"; nvm use lts/jod
npm install
npm run build   # babel+webpack+sass -> dist/ (required before start)
npm start       # electron .
```

