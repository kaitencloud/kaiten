#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_DIR="$(cd "$APP_DIR/.." && pwd)"

# A stopped daemon otherwise surfaces as a raw `docker run` error, with no
# hint about the cause.
if ! docker info >/dev/null 2>&1; then
  echo "error: Docker daemon unreachable. Start Docker Desktop and retry." >&2
  exit 1
fi

PLAYWRIGHT_VERSION="$(
  node -e "
    const { readFileSync } = require('node:fs');
    const lock = readFileSync('$REPO_DIR/pnpm-lock.yaml', 'utf8');
    const appBlock = lock.split(/^  app:\n/m)[1]?.split(/^  [^ \t]/m)[0] ?? '';
    const match = appBlock.match(
      /'@playwright\\/test':\\s*\\n\\s+specifier:[^\\n]+\\n\\s+version: (\\S+)/,
    );
    if (!match) {
      throw new Error('Could not resolve @playwright/test version from pnpm-lock.yaml');
    }
    process.stdout.write(match[1]);
  "
)"
IMAGE="${PLAYWRIGHT_DOCKER_IMAGE:-mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble}"

DOCKER_ENV=(-e CI=true -e PLAYWRIGHT_STORYBOOK_STATIC=true)

docker run --rm --ipc=host \
  -v "$REPO_DIR:/work" \
  -v kaiten-app-playwright-node-modules:/work/node_modules \
  -w /work \
  "${DOCKER_ENV[@]}" \
  "$IMAGE" \
  /bin/bash -lc \
  'set -euo pipefail
corepack enable pnpm
pnpm install --frozen-lockfile --filter kaiten-app...
cd app
pnpm exec playwright test -c playwright.config.ts e2e/tests/visual-regression.spec.ts --project=chromium --update-snapshots'
