# Docker

The console ships as one image: the production build of the app, served by
nginx. `app/Dockerfile` defines it, and the release workflow publishes it as
`ghcr.io/kaitencloud/app` (see [CI/CD](./ci-cd.md)). There is no Docker setup
for development: the dev server runs on the host, see
[setup](../00-getting-started/setup.md).

## Build

Build from the repository root, not from `app/`. The Dockerfile copies
`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `packages/api-codegen`,
`packages/theme` and `api/internal/`, and none of them is inside `app/`.

```bash
# From the repo root
docker build -f app/Dockerfile -t kaiten-app .
```

The build needs no secret and no registry token: dependencies install from the
committed lockfile. It runs in five stages:

1. `base` is Node on Alpine, with security updates and pnpm activated through
   Corepack. `deps` and `builder` start from it.
2. `deps` installs the workspace packages the app needs with
   `pnpm install --frozen-lockfile`.
3. `wasm` compiles the CEL engine, the Rust crate in `app/cel-engine`, to
   WebAssembly. It starts from a pinned Rust image (`rust:<version>-slim-trixie`)
   and installs a pinned `wasm-pack` release, checked against a SHA-256 sum. It
   runs `cargo fetch --locked`, which fails the build when `Cargo.lock` no longer
   matches `Cargo.toml`, then `app/cel-engine/build.sh -- --locked`: the script
   `pnpm run build:wasm` and CI use. Both run in one `RUN`, which ends by
   copying `cel-engine.js` and `cel-engine_bg.wasm` to `/wasm-out` and deleting
   cargo's `target` directory, the crates it downloaded and `wasm-pack`'s helper
   binaries. A layer keeps whatever its `RUN` leaves on disk, and
   `release-app.yml` exports every layer to the registry cache (`mode=max`): the
   layer holds the 2 MB module, not about 260 MB of build state. Only
   `app/cel-engine` goes into the stage, so a change anywhere else in `app/`
   leaves it cached. It has no dependency on the Node stages and builds
   alongside them.
4. `builder` copies `cel-engine.js` and `cel-engine_bg.wasm` from `/wasm-out` in
   `wasm` into `app/public/wasm/`, then runs `pnpm --dir app generate` (API
   client from `app/openapi.yaml`, GraphQL types from the schemas in
   `api/internal/`) and `pnpm --dir app build`. Vite copies `public/` into
   `dist/`, so the engine ends up in `dist/wasm/`.
5. `runner` copies `app/dist` into an nginx image, owned by the `nginx` user
   (`COPY --chown`), because the entrypoint rewrites the runtime-config chunk as
   that user. It is the only stage that ends up in the image: the Rust toolchain
   stays behind in `wasm`.

The `wasm` stage reaches these hosts:

- `deb.debian.org`: `apt` installs `curl`. Plain HTTP on port 80; `apt` checks
  the signatures.
- `github.com`, and `release-assets.githubusercontent.com`, where GitHub
  redirects release downloads: the `wasm-pack` tarball, then the `wasm-bindgen`
  command-line tool and `wasm-opt` (from Binaryen's releases) that `wasm-pack`
  downloads when it builds.
- `static.rust-lang.org`: `rustup target add wasm32-unknown-unknown`.
- `index.crates.io` and `static.crates.io`: `cargo fetch` downloads the crates.
- `crates.io`: `wasm-pack` asks its API whether a newer `wasm-pack` exists. The
  build does not depend on the answer: when the host is blocked, it prints a
  warning and goes on.

The `rust` base image itself comes from Docker Hub, like the other base images.

`wasm-pack` fetches its two helper binaries on its own and does not use
`HTTPS_PROXY` for those downloads, unlike `apt`, `curl`, `rustup` and `cargo`:
from a network that reaches GitHub only through a proxy, the build fails at
`wasm-opt`. If the
`wasm-bindgen` download alone fails, `wasm-pack` builds that tool with
`cargo install` from crates.io instead, at the same version; a failed `wasm-opt`
download fails the build.

Both binaries are pinned but not verified. `wasm-pack` 0.15.0 takes the
`wasm-bindgen` version from `Cargo.lock` and hard-codes the Binaryen release
for `wasm-opt`, so every build fetches the same versions. It downloads them over
HTTPS and unpacks them without checking a checksum: only the `wasm-pack`
tarball is checked, against the SHA-256 sums in the Dockerfile. For those two
files, integrity rests on TLS and on GitHub.

From a cold cache the stage takes a few minutes, most of them spent in
`wasm-opt`; `release-app.yml` builds `linux/amd64` and `linux/arm64` on native
runners, so each compiles the engine for itself.

`.dockerignore` keeps `app/public/wasm/` and `app/cel-engine/target/` out of the
build context. A local `pnpm run build:wasm` does not change the image: the
engine always comes from the pinned toolchain in `wasm`.

The build takes no `--build-arg`, and `.dockerignore` excludes `app/.env*`, so
no `VITE_*` value is baked into the image. The image is neutral and is
configured when the container starts.

## Run

```bash
docker run --rm -p 8080:8080 \
  -e VITE_API_URL=https://kaiten.example.com/api \
  -e VITE_CLERK_PUBLISHABLE_KEY=<publishable key> \
  kaiten-app
```

The app is then served at <http://localhost:8080>.

## Configuration at start-up

`docker-entrypoint.sh` runs `envsubst` on the built `assets/runtime-config-*.js`
chunk, then starts nginx. It substitutes exactly four variables:

- `VITE_API_URL`
- `VITE_CLERK_PUBLISHABLE_KEY`
- `VITE_KAITEN_PLATFORM_API_URL`
- `VITE_KAITEN_PLATFORM_FLAGS_TOKEN`

`VITE_API_URL` is required: it must end in `/api` (for example
`https://kaiten.example.com/api`). Left unset, the substituted value is empty
and the app throws `VITE_API_URL is required in production` when the page
loads. The other three are described in [environments](./environments.md),
together with how the placeholders work.

- Every value is served to the browser. Never put a secret in one of these
  variables.
- Values are written verbatim into a JavaScript string: do not use quotes,
  backticks or backslashes.
- Any other `VITE_*` variable has no effect on a container: it is read when the
  bundle is built, and the image is built without it.
- The `runtime-config` chunk keeps the same file name whatever the variables
  are, so nginx serves it with `Cache-Control: no-cache` (see below). The
  rewrite at start-up changes its `ETag` and `Last-Modified`, so a browser gets
  the new values after a restart.

## What the container serves

- nginx 1.26 (Alpine) listens on port 8080 as the unprivileged `nginx` user
  (`app/nginx.conf`).
- Unknown paths fall back to `index.html`, which is what the client-side router
  needs. A missing file is a 404 instead: anything under `/assets/`, and any
  other path ending in a static file extension (`.js`, `.css`, `.png`,
  `.wasm`...).
- Files under `/assets/` are sent with `Cache-Control: public, immutable` and a
  one-year expiry: Vite gives each one a content hash in its name, so a new
  build is fetched under new URLs. The one exception is the `runtime-config` chunk
  (see above), sent with `no-cache`.
- Everything else (`index.html`, whether requested or served as the fallback,
  and the files copied from `app/public/`, which keep their unhashed names) is
  sent with `Cache-Control: no-cache`: browsers revalidate it on every use and
  get a `304` when it has not changed.
- The image has a `HEALTHCHECK` that requests `http://127.0.0.1:8080/` every 30
  seconds. It uses the IPv4 address on purpose: nginx listens on IPv4 only
  (`listen 8080;`), and in the container `localhost` resolves to `::1` first,
  which `wget` does not retry on IPv4.
- nginx serves static files only. It does not proxy the API, so the browser
  must be able to reach `VITE_API_URL` itself: put the app and the API behind
  one host, or point `VITE_API_URL` at the API's own origin and allow the app's
  origin there.

## The CEL engine

The image carries the CEL engine compiled to WebAssembly, in `/wasm/`:
`cel-engine.js` and `cel-engine_bg.wasm`, about 1.9 MB together. The CEL editor
loads it on demand, the first time it opens, for its in-browser syntax check (see
the [CEL editor](../../src/functionals/cel-editor/README.md#syntax-check-with-a-wasm-engine)).
nginx sends them as `application/javascript` and `application/wasm`, with
`Cache-Control: no-cache`, like the other files copied from `app/public/`, and
compresses both (`gzip_types` lists `application/wasm`: the module goes from
1.9 MB to about 0.7 MB on the wire).

To bump the toolchain, change the `rust:` tag, or the `wasm-pack` version and its
two checksums (`amd64` and `arm64`), in the `wasm` stage of `app/Dockerfile`, and
build for both platforms: `wasm-pack` fetches its helper binaries per platform.
When `Cargo.toml` changes, commit the updated `Cargo.lock`: the `cargo fetch
--locked` step fails the build otherwise. The `--locked` passed to `build.sh` is
not enough on its own, because `wasm-pack` rewrites a stale lock before cargo
builds.

## Kubernetes

The Helm chart in `charts/kaiten` deploys this image. Its `app` block sets the
image (`app.image`), the variables (`app.configMap`, and `app.extraEnv` for a
value that comes from a Secret) and the port (`app.service.port`, 8080, the port
nginx listens on).
