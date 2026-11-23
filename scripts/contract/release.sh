#!/usr/bin/env bash
#
# Publishes the API contract as an OCI artifact: ghcr.io/kaitencloud/contract.
#
# Usage:
#   scripts/contract/release.sh tag CALVER   for a stable release tag (26.11.4)
#   scripts/contract/release.sh next         for a push to main
#
# WHAT IT PUBLISHES
#
# One artifact per contract version, of type application/vnd.kaiten.contract.v1, holding the four
# files the contract ships: openapi.yaml (with info.version stamped), README.md, LICENSE and NOTICE.
# Each is tagged twice:
#
#   <semver>   the contract's own version, decided by next-version.sh from what changed since the
#              previous one. A semver tag is pushed once and never moves.
#   <calver>   every release that ships this contract. A release whose contract did not change
#              adds its CalVer to the existing artifact instead of pushing a new one.
#
# and `next` follows main, so a consumer can try what the next release will carry.
#
# The manifest's annotations say what it is: org.opencontainers.image.version (the semver),
# sh.kaiten.release (the CalVer that first shipped it), org.opencontainers.image.source and
# org.opencontainers.image.revision.
#
# WHICH TAG IS A SEMVER
#
# A CalVer tag (26.11.4) has the shape of a semver too, and sorts above every contract version
# for years. So a tag counts as the contract's semver only when its manifest's
# org.opencontainers.image.version equals the tag itself; a CalVer tag's annotation names the
# semver it points at instead.
#
# THE FIRST RELEASE
#
# Until the registry holds a semver, the base is the newest @kaitencloud/openapi on public npmjs,
# read anonymously with the registry named, because a developer's npm config may map
# @kaitencloud to GitHub Packages, which serves stale versions. A first release whose contract
# equals that version pushes it under that same semver, so the registry continues npm's line.
#
# RE-RUNS
#
# A CalVer tag that already exists is checked, not pushed again: if it names the contract this
# commit builds, the run reports it and stops; if it names another one, the tag was moved, and the
# run fails.
#
# Prints key=value lines, also appended to $GITHUB_OUTPUT when it is set:
#   semver, calver, bump, base, base_source (registry|npm), digest, pushed (true|false), stage
# `stage` is a directory holding the published files, for the npm step.
#
# Environment (defaults in brackets):
#   CONTRACT_REPO    [ghcr.io/kaitencloud/contract]
#   REVISION         [git rev-parse HEAD]
#   SOURCE_URL       [https://github.com/kaitencloud/kaiten]
#   SPEC             [app/openapi.yaml]
#   CONTRACTS_DIR    [.github/contracts], holding LICENSE, NOTICE and openapi/README.md
#   NPM_REGISTRY     [https://registry.npmjs.org/]
#   ORAS_FLAGS       extra flags for every oras call; the tests pass --plain-http
#   FALLBACK_BASE_VERSION and FALLBACK_BASE_DIR replace npm as the first base, for the tests
#
# Needs oras, yq (mikefarah's, v4), jq, npm, and next-version.sh's oasdiff.

set -euo pipefail

usage() {
  echo "usage: $0 tag CALVER | $0 next" >&2
  exit 2
}

mode=${1:-}
case $mode in
tag)
  [[ $# -eq 2 ]] || usage
  calver=$2
  if [[ ! $calver =~ ^[0-9]{2}\.[0-9]{2}\.[0-9]+$ ]]; then
    echo "error: '$calver' is not a stable release tag (YY.MM.N). Pre-releases publish no contract." >&2
    exit 2
  fi
  ;;
next)
  [[ $# -eq 1 ]] || usage
  calver=""
  ;;
*) usage ;;
esac

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo=${CONTRACT_REPO:-ghcr.io/kaitencloud/contract}
revision=${REVISION:-$(git rev-parse HEAD)}
source_url=${SOURCE_URL:-https://github.com/kaitencloud/kaiten}
spec=${SPEC:-app/openapi.yaml}
contracts=${CONTRACTS_DIR:-.github/contracts}
npm_registry=${NPM_REGISTRY:-https://registry.npmjs.org/}
yq=${YQ:-yq}
read -r -a oras_flags <<<"${ORAS_FLAGS:-}"
artifact_type=application/vnd.kaiten.contract.v1
semver_re='^[0-9]+\.[0-9]+\.[0-9]+$'

# Flags last: several oras commands are two words (repo tags, manifest fetch).
oras_() { oras "$@" ${oras_flags[@]+"${oras_flags[@]}"}; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
# The staged files outlive the run, for the npm step.
stage="$(mktemp -d)"

emit() {
  local line
  for line in "$@"; do
    echo "$line"
    if [[ -n ${GITHUB_OUTPUT:-} ]]; then echo "$line" >>"$GITHUB_OUTPUT"; fi
  done
}

# exists REF: 0 if the registry has REF, 1 if it does not, and fails on anything else, so an
# unreachable registry is never read as an absent tag.
exists() {
  local err
  if err=$(oras_ manifest fetch --descriptor "$1" 2>&1 >/dev/null); then
    return 0
  fi
  if grep -qiE 'not found|name unknown|manifest unknown|404' <<<"$err"; then
    return 1
  fi
  echo "error: cannot read $1: $err" >&2
  exit 1
}

annotation() { # REF KEY
  oras_ manifest fetch "$1" | jq -r --arg k "$2" '.annotations[$k] // empty'
}

# The contract this commit builds, as the files the release ships.
cp "$spec" "$stage/openapi.yaml"
cp "$contracts/openapi/README.md" "$stage/README.md"
cp "$contracts/LICENSE" "$contracts/NOTICE" "$stage/"

stamp() { # SEMVER: stamps info.version, and refuses a stamp that changes anything else
  SEMVER=$1 "$yq" '.info.version = strenv(SEMVER)' "$stage/openapi.yaml" >"$work/stamped.yaml"
  local changed
  changed=$(diff "$stage/openapi.yaml" "$work/stamped.yaml" | grep -c '^[<>]' || true)
  if ((changed > 2)); then
    echo "error: yq rewrote more than info.version in openapi.yaml; refusing to publish a reformatted contract" >&2
    exit 1
  fi
  mv "$work/stamped.yaml" "$stage/openapi.yaml"
}

# ── A re-run: the CalVer tag already exists ──────────────────────────────────

if [[ $mode == tag ]] && exists "$repo:$calver"; then
  existing=$(annotation "$repo:$calver" org.opencontainers.image.version)
  if [[ ! $existing =~ $semver_re ]]; then
    echo "error: $repo:$calver exists but names no contract version (org.opencontainers.image.version='$existing')" >&2
    exit 1
  fi
  oras_ pull "$repo:$calver" -o "$work/existing" >/dev/null
  decision=$("$here/next-version.sh" "$existing" "$work/existing" "$stage" 2>/dev/null)
  if ! grep -qx 'bump=none' <<<"$decision"; then
    echo "error: $repo:$calver already names contract $existing, which is not what this commit builds. A release tag was moved." >&2
    exit 1
  fi
  stamp "$existing"
  echo "$repo:$calver already names contract $existing, the one this commit builds: nothing to push." >&2
  emit "semver=$existing" "calver=$calver" "bump=none" "base=$existing" "base_source=registry" \
    "digest=$(oras_ resolve "$repo:$calver")" "pushed=false" "stage=$stage"
  exit 0
fi

# ── The base: the highest semver on the registry, or npm's on the first run ──

tags=""
if err=$(oras_ repo tags "$repo" 2>&1 >"$work/tags"); then
  tags=$(cat "$work/tags")
elif ! grep -qiE 'not found|name unknown|404' <<<"$err"; then
  echo "error: cannot list $repo: $err" >&2
  exit 1
fi

base=""
while read -r tag; do
  [[ -n $tag ]] || continue
  if [[ $(annotation "$repo:$tag" org.opencontainers.image.version) == "$tag" ]]; then
    base=$tag
    break
  fi
done < <(grep -E "$semver_re" <<<"$tags" | sort -rV || true)

if [[ -n $base ]]; then
  base_source=registry
  oras_ pull "$repo:$base" -o "$work/base" >/dev/null
elif [[ -n ${FALLBACK_BASE_VERSION:-} ]]; then
  base_source=npm
  base=$FALLBACK_BASE_VERSION
  cp -R "$FALLBACK_BASE_DIR" "$work/base"
else
  base_source=npm
  npm_() { npm "$@" --registry="$npm_registry" "--@kaitencloud:registry=$npm_registry"; }
  base=$(npm_ view @kaitencloud/openapi versions --json |
    jq -r '(if type == "array" then .[] else . end) // empty' | grep -E "$semver_re" | sort -V | tail -1 || true)
  if [[ -z $base ]]; then
    echo "error: neither $repo nor $npm_registry has a contract version to continue from" >&2
    exit 1
  fi
  (cd "$work" && npm_ pack "@kaitencloud/openapi@$base" >/dev/null)
  tar -xzf "$work"/kaitencloud-openapi-*.tgz -C "$work"
  mv "$work/package" "$work/base"
fi
echo "Base: $base, from $([[ $base_source == npm ]] && echo npm || echo "$repo")" >&2

decision=$("$here/next-version.sh" "$base" "$work/base" "$stage")
bump=$(sed -n 's/^bump=//p' <<<"$decision")
next=$(sed -n 's/^version=//p' <<<"$decision")

annotations=(
  --annotation "org.opencontainers.image.source=$source_url"
  --annotation "org.opencontainers.image.revision=$revision"
)
files=(
  openapi.yaml:application/vnd.oai.openapi+yaml
  README.md:text/markdown
  LICENSE:text/plain
  NOTICE:text/plain
)

push() { # TAGS...: pushes the staged files, prints the digest
  local tags
  tags=$(
    IFS=,
    echo "$*"
  )
  (cd "$stage" && oras_ push "$repo:$tags" --artifact-type "$artifact_type" \
    "${annotations[@]}" "${files[@]}" --format json) | jq -r .digest
}

# ── main: move `next` ────────────────────────────────────────────────────────

if [[ $mode == next ]]; then
  annotations+=(--annotation "sh.kaiten.contract.next=$next")
  digest=$(push next)
  echo "$repo:next is main at $revision: contract $next if released now ($bump from $base)." >&2
  emit "semver=$next" "calver=" "bump=$bump" "base=$base" "base_source=$base_source" \
    "digest=$digest" "pushed=true" "stage=$stage"
  exit 0
fi

# ── A release ────────────────────────────────────────────────────────────────

if [[ $bump == none && $base_source == registry ]]; then
  # The contract did not change: this release ships the existing artifact.
  oras_ tag "$repo:$base" "$calver" >/dev/null
  stamp "$base"
  echo "Contract unchanged since $base: tagged it $calver." >&2
  emit "semver=$base" "calver=$calver" "bump=none" "base=$base" "base_source=registry" \
    "digest=$(oras_ resolve "$repo:$calver")" "pushed=false" "stage=$stage"
  exit 0
fi

# A new artifact: a new semver, or npm's on the first release whose contract equals it.
semver=$next
if exists "$repo:$semver"; then
  echo "error: $repo:$semver already exists. A contract version is pushed once and never moves." >&2
  exit 1
fi
stamp "$semver"
annotations+=(
  --annotation "org.opencontainers.image.version=$semver"
  --annotation "sh.kaiten.release=$calver"
)
digest=$(push "$semver" "$calver")
echo "Pushed $repo:$semver as $calver ($bump from $base, $base_source)." >&2
emit "semver=$semver" "calver=$calver" "bump=$bump" "base=$base" "base_source=$base_source" \
  "digest=$digest" "pushed=true" "stage=$stage"
