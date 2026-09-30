# syntax=docker/dockerfile:1
# Dockerfile for Kaiten Application (Vite + React)
FROM node:24-alpine AS base

# Install pnpm and security updates. Keep the pnpm version in step with the
# `packageManager` field of the root package.json.
RUN apk update && apk upgrade && \
    corepack enable && corepack prepare pnpm@12.4.1 --activate

# Dependencies stage
FROM base AS deps
WORKDIR /workspace

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY app/package.json ./app/package.json
COPY packages/api-codegen/package.json ./packages/api-codegen/package.json
# The theme builds dist/ from its prepare script during the install below, so
# its sources must be here already, not only its package.json.
COPY packages/theme ./packages/theme

# Install dependencies. @kaiten/api-codegen is not a dependency of kaiten-app
# -- `pnpm generate` invokes it by filter -- so it must be selected explicitly
# here.
RUN pnpm install --frozen-lockfile --filter kaiten-app... --filter @kaiten/api-codegen

# CEL engine stage: app/cel-engine (Rust) compiled to WebAssembly.
#
# The CEL editor loads the module at run time from /wasm/cel-engine.js, so it
# has to be among the files Vite copies out of app/public/. The repository does
# not commit it, hence this stage. It stays out of the Node stages on purpose:
# the toolchain alone is over a gigabyte, and only two files come out of it.
#
# Debian slim rather than Alpine: wasm-pack downloads the wasm-bindgen and
# wasm-opt prebuilt binaries at build time, and those exist for glibc on both
# amd64 and arm64, the two platforms release-app.yml builds. wasm-pack fetches
# the wasm-bindgen CLI that matches the version in app/cel-engine/Cargo.lock,
# so the lockfile pins it.
FROM rust:1.98.1-slim-trixie AS wasm
WORKDIR /workspace

# wasm-pack, from its release binaries (static musl builds, so they run on
# glibc too). The version and both checksums go together: bump all three at once.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends curl; \
    rm -rf /var/lib/apt/lists/*; \
    version=0.15.0; \
    case "$(uname -m)" in \
      x86_64)  triple=x86_64-unknown-linux-musl;  sha256=c09f971ecaed9a2efc80fdcea7a00ef6b53c7fadc8c57d1f61b53a6aa66b668a ;; \
      aarch64) triple=aarch64-unknown-linux-musl; sha256=e17ef0806381c3a0acb9c9ddad643a49facaa5a2ecf657a421d4d8f3357a24b7 ;; \
      *) echo "no wasm-pack release for $(uname -m)" >&2; exit 1 ;; \
    esac; \
    curl --fail --silent --show-error --location --output /tmp/wasm-pack.tar.gz \
      "https://github.com/wasm-bindgen/wasm-pack/releases/download/v${version}/wasm-pack-v${version}-${triple}.tar.gz"; \
    echo "${sha256}  /tmp/wasm-pack.tar.gz" | sha256sum --check -; \
    tar --extract --gzip --file /tmp/wasm-pack.tar.gz --directory /usr/local/bin \
      --strip-components=1 "wasm-pack-v${version}-${triple}/wasm-pack"; \
    rm /tmp/wasm-pack.tar.gz; \
    wasm-pack --version

RUN rustup target add wasm32-unknown-unknown

# Only the crate: a change anywhere else in app/ leaves this stage cached.
COPY app/cel-engine ./app/cel-engine

# Fetch, build, keep two files, all in one RUN.
#
# `cargo fetch --locked` comes first because it is what enforces Cargo.lock
# here: it errors out when Cargo.toml asks for something the lock does not hold,
# and it downloads the crates the build compiles. `--locked` on wasm-pack alone
# would not do it: wasm-pack resolves the crate with its own `cargo metadata`
# call, which ignores the flag and rewrites a stale lock, so cargo's later
# `--locked` build then sees an up-to-date file and compiles whatever the
# registry has today.
#
# Then the same script as `pnpm run build:wasm` and CI, output in
# app/public/wasm. The `--locked` after `--` goes to cargo's build and keeps it
# from touching the lock (the fetch already made sure it matches).
#
# Last, the two files the editor loads go to /wasm-out and everything the build
# left behind is deleted: cargo's target directory, the crates it downloaded and
# wasm-pack's copies of wasm-bindgen and wasm-opt, about 260 MB together. It has
# to happen in this RUN: a layer keeps whatever its RUN leaves on disk, a later
# `rm` only hides it, and release-app.yml exports every layer with
# `cache-to ... mode=max`. Left alone, the stage would store that much for
# 1.9 MB of output.
#
# No cache mount for cargo instead: the layers above are reused whenever
# app/cel-engine is unchanged, and when it changes, compiling the crates is the
# short part of this step (about 15 s of 2 minutes, wasm-opt takes the rest),
# which a mount would hardly save, and the registry cache does not export
# mounts.
RUN cargo fetch --locked --manifest-path app/cel-engine/Cargo.toml && \
    ./app/cel-engine/build.sh -- --locked && \
    mkdir /wasm-out && \
    cp app/public/wasm/cel-engine.js app/public/wasm/cel-engine_bg.wasm /wasm-out/ && \
    rm -rf app/public app/cel-engine/target "${CARGO_HOME}/registry" "${CARGO_HOME}/git" \
           "${XDG_CACHE_HOME:-${HOME}/.cache}/.wasm-pack"

# Build stage
FROM base AS builder
WORKDIR /workspace

# Copy dependencies from deps stage
COPY --from=deps /workspace ./

# Copy app and workspace package sources
COPY app ./app

# The CEL engine, for Vite to copy from public/ into dist/wasm/. Only the two
# files the editor loads, which is all the `wasm` stage keeps (wasm-pack's
# package.json, .gitignore and typings have no use in the image). Nothing from a
# local `pnpm run build:wasm` reaches this point (.dockerignore leaves
# app/public/wasm out), so the engine always comes from the pinned toolchain
# above.
COPY --from=wasm /wasm-out/ ./app/public/wasm/
COPY packages/api-codegen ./packages/api-codegen

# Copy GraphQL schemas from api (needed for pnpm generate-graphql)
# codegen.ts resolves ../api/internal/ relative to /workspace/app.
COPY api/internal/ ./api/internal/

# Generate API client and GraphQL types, then build.
#
# verify-deps-before-run is off: when it is on, pnpm checks that node_modules
# matches the lockfile before running a script, and can re-run `pnpm install`
# itself when it decides they have drifted -- an install from a command that
# never asked for one. Deps are installed in `deps` with --frozen-lockfile, and
# nothing in this stage should ever resolve a package over the network. Whether
# the check fires depends on build cache state, not on the Dockerfile, which is
# how one commit once built on one arch and failed on the other.
# `export` rather than a `VAR=value cmd` prefix: the prefix form would bind
# the variable to `generate` only and leave `build` running with the check
# back on.
RUN export PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false && \
    pnpm --dir app generate && pnpm --dir app build

# Production stage - Serve with nginx (non-root)
FROM nginx:1.26-alpine AS runner

# Update packages for security
RUN apk update && apk upgrade

# Copy custom nginx config (runs on port 8080, uses /tmp for temp dirs)
COPY app/nginx.conf /etc/nginx/nginx.conf

# Copy built application to nginx, owned by nginx: the entrypoint rewrites the
# runtime-config chunk in place as that user. --chown sets the owner while the
# files are copied; a `chown -R` in a later RUN would store the whole tree a
# second time in its own layer.
COPY --from=builder --chown=nginx:nginx /workspace/app/dist /usr/share/nginx/html

# Install envsubst for runtime env variable injection
RUN apk add --no-cache gettext

# Allow nginx to write logs and create temp dirs as non-root
RUN mkdir -p /var/cache/nginx /var/log/nginx /tmp/client_temp /tmp/proxy_temp \
             /tmp/fastcgi_temp /tmp/uwsgi_temp /tmp/scgi_temp && \
    chown -R nginx:nginx /var/cache/nginx /var/log/nginx && \
    chmod -R 755 /var/cache/nginx /var/log/nginx

# Add entrypoint script that runs envsubst on the runtime-config chunk before starting nginx
COPY app/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

USER nginx

# Expose port (non-privileged)
EXPOSE 8080

# Health check. 127.0.0.1 and not localhost: in the container localhost resolves
# to ::1 first, wget does not fall back to IPv4 when that is refused, and nginx
# listens on IPv4 only (`listen 8080;` in app/nginx.conf), so `localhost` made
# every check fail and the container was reported unhealthy.
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8080/ || exit 1

# Run entrypoint: inject runtime env vars into the runtime-config chunk, then start nginx
ENTRYPOINT ["/docker-entrypoint.sh"]
