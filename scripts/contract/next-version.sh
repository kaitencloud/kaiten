#!/usr/bin/env bash
#
# The contract's next version, decided from what changed since the last one.
#
# Usage: scripts/contract/next-version.sh BASE_VERSION BASE_DIR NEW_DIR
#
# BASE_DIR holds the published contract BASE_VERSION; NEW_DIR holds the one about to be
# published. Each holds the four files the contract ships: openapi.yaml, README.md, LICENSE and
# NOTICE. NEW_DIR must have all four. A file missing from BASE_DIR counts as changed.
#
# Prints, one per line, ready for $GITHUB_OUTPUT:
#
#   bump=major|minor|patch|none
#   version=<the next version>     BASE_VERSION itself when bump=none
#   changes=<n>                    what oasdiff reports, at any level
#   breaking=<n>                   of which WARN or ERR
#
# and oasdiff's changelog on stderr, for the log.
#
# THE VERSION IS SEMVER, AND OASDIFF DECIDES IT
#
# The contract is generated from the Go handlers, so the diff between two documents is
# machine-truth in a way a commit message is not. No `!` marker is trusted, and none is needed.
#
#   any change at WARN or above   major
#   any other change              minor
#   same API, different files     patch   (a description or an example moved, which oasdiff does
#                                          not report, or the README, LICENSE or NOTICE changed)
#   identical files               none
#
# WARN counts, not just ERR. oasdiff files a removed request property as WARN, and that is what
# dropping `platform` was: 5 errors and 8 warnings, and the warnings are what forced sdk-go's
# `fix(instances)!: stop sending platform, which the API no longer accepts`. Counting only errors
# would have shipped that break as a minor.
#
# info.version takes no part in the comparison. A release stamps it with the version it
# publishes, so the published document and the next commit's always differ there. Both sides are
# compared with it blanked, and oasdiff reports nothing for it anyway.
#
# severity-levels.txt, next to this script, reclassifies oasdiff checks by id: see its header.
# SEVERITY_LEVELS names another file, for the tests.
#
# Needs oasdiff and yq (mikefarah's, v4), on PATH or named by OASDIFF and YQ. The workflows install
# the oasdiff that oasdiff-version, next to this script, names: an unpinned one silently changes
# what the numbers mean, and one file keeps every workflow on the same one. Bump it there, and
# nowhere else.

set -euo pipefail

usage() {
  echo "usage: $0 BASE_VERSION BASE_DIR NEW_DIR" >&2
  exit 2
}
[[ $# -eq 3 ]] || usage

base_version=$1
base_dir=$2
new_dir=$3
oasdiff=${OASDIFF:-oasdiff}
yq=${YQ:-yq}
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! $base_version =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
  echo "error: BASE_VERSION is MAJOR.MINOR.PATCH, not '$base_version'" >&2
  exit 2
fi
major=${BASH_REMATCH[1]}
minor=${BASH_REMATCH[2]}
patch=${BASH_REMATCH[3]}

for f in openapi.yaml README.md LICENSE NOTICE; do
  if [[ ! -f $new_dir/$f ]]; then
    echo "error: $new_dir/$f is missing: the contract ships openapi.yaml, README.md, LICENSE and NOTICE" >&2
    exit 2
  fi
done
if [[ ! -f $base_dir/openapi.yaml ]]; then
  echo "error: $base_dir/openapi.yaml is missing" >&2
  exit 2
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

"$yq" '.info.version = "0.0.0"' "$base_dir/openapi.yaml" >"$work/base.yaml"
"$yq" '.info.version = "0.0.0"' "$new_dir/openapi.yaml" >"$work/new.yaml"

# oasdiff refuses comments and blank lines in its severity file, so the curated copy keeps its
# reasons and oasdiff gets the lines alone.
levels=()
if [[ -n ${SEVERITY_LEVELS:-} && ! -f $SEVERITY_LEVELS ]]; then
  echo "error: SEVERITY_LEVELS names $SEVERITY_LEVELS, which does not exist" >&2
  exit 2
fi
levels_src=${SEVERITY_LEVELS:-$here/severity-levels.txt}
if [[ -f $levels_src ]]; then
  grep -vE '^[[:space:]]*(#|$)' "$levels_src" >"$work/levels.txt" || true
  if [[ -s $work/levels.txt ]]; then
    levels=(--severity-levels "$work/levels.txt")
  fi
fi

# ${levels[@]+...}: bash 3.2, macOS's, treats an empty array as unset under `set -u`.
breaking=$("$oasdiff" breaking "$work/base.yaml" "$work/new.yaml" -f json ${levels[@]+"${levels[@]}"} |
  jq '[.[] | select(.level >= 2)] | length')
changes=$("$oasdiff" changelog "$work/base.yaml" "$work/new.yaml" -f json ${levels[@]+"${levels[@]}"} |
  jq 'length')

echo "oasdiff: ${changes} change(s) since ${base_version}, ${breaking} of them breaking" >&2
if ((changes > 0)); then
  "$oasdiff" changelog "$work/base.yaml" "$work/new.yaml" ${levels[@]+"${levels[@]}"} >&2
fi

same_files() {
  cmp -s "$work/base.yaml" "$work/new.yaml" || return 1
  local f
  for f in README.md LICENSE NOTICE; do
    [[ -f $base_dir/$f ]] || return 1
    cmp -s "$base_dir/$f" "$new_dir/$f" || return 1
  done
}

if ((changes == 0)); then
  if same_files; then
    bump=none
    next=$base_version
  else
    bump=patch
    next="${major}.${minor}.$((patch + 1))"
  fi
elif ((breaking > 0)); then
  bump=major
  next="$((major + 1)).0.0"
else
  bump=minor
  next="${major}.$((minor + 1)).0"
fi

printf 'bump=%s\nversion=%s\nchanges=%s\nbreaking=%s\n' "$bump" "$next" "$changes" "$breaking"
