#!/usr/bin/env bash
# Tests scripts/contract/release.sh against a real OCI registry, through a contract's life: the
# first release continuing npm's line, a re-run, an unchanged release, a changed one, a moved tag,
# a pre-release, a taken semver and an unreachable registry.
#
# Usage: REGISTRY=localhost:5000 scripts/tests/test-contract-release.sh
# REGISTRY is a throwaway registry spoken to over plain HTTP: `docker run -p 5000:5000 registry:2`.
# The first base is a fixture standing in for npm, so the test reads nothing from the internet.
# Needs what release.sh needs: oras, yq, jq and oasdiff.
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${REGISTRY:?set REGISTRY to a throwaway registry, e.g. localhost:5000}"
release=scripts/contract/release.sh
yq=${YQ:-yq}

fixture=$(mktemp -d "${TMPDIR:-/tmp}/contract-release.XXXXXX")
trap 'rm -rf "$fixture"' EXIT
trap 'exit 1' HUP INT TERM

export CONTRACT_REPO="$REGISTRY/contract-test-$$-$RANDOM"
export ORAS_FLAGS=--plain-http
export REVISION=0123456789abcdef0123456789abcdef01234567
export SPEC="$fixture/src/openapi.yaml"
export CONTRACTS_DIR="$fixture/src/contracts"
export FALLBACK_BASE_VERSION=4.1.1
export FALLBACK_BASE_DIR="$fixture/npm"
unset GITHUB_OUTPUT

# The contract in the tree, and npm's 4.1.1, which is the same contract.
mkdir -p "$fixture/src/contracts/openapi" "$fixture/npm"
cat >"$SPEC" <<'YAML'
openapi: 3.1.0
info:
  title: Fixture
  version: 1.0.0
paths:
  /things:
    get:
      operationId: listThings
      responses:
        "200":
          description: The things.
YAML
printf 'The contract.\n' >"$CONTRACTS_DIR/openapi/README.md"
printf 'Apache License\n' >"$CONTRACTS_DIR/LICENSE"
printf 'Notice.\n' >"$CONTRACTS_DIR/NOTICE"
cp "$SPEC" "$CONTRACTS_DIR/LICENSE" "$CONTRACTS_DIR/NOTICE" "$fixture/npm/"
cp "$CONTRACTS_DIR/openapi/README.md" "$fixture/npm/"

failures=0
fail() {
  echo "FAIL: $*"
  failures=$((failures + 1))
}
pass() { echo "PASS: $*"; }

# run ARGS...: runs release.sh, keeps its key=value output in $out and its status in $status.
run() {
  status=0
  out=$("$release" "$@" 2>"$fixture/stderr") || status=$?
}
field() { sed -n "s/^$1=//p" <<<"$out"; }
digest_of() { oras resolve --plain-http "$CONTRACT_REPO:$1"; }
annotation() { oras manifest fetch --plain-http "$CONTRACT_REPO:$1" | jq -r --arg k "$2" '.annotations[$k] // empty'; }
published_version() {
  rm -rf "$fixture/pulled"
  oras pull --plain-http "$CONTRACT_REPO:$1" -o "$fixture/pulled" >/dev/null
  "$yq" '.info.version' "$fixture/pulled/openapi.yaml"
}

# 1. main moves `next` before any release.
run next
if [[ $status -eq 0 && $(field pushed) == true ]] && [[ $(annotation next sh.kaiten.contract.next) == 4.1.1 ]]; then
  pass "next: pushed, and would release 4.1.1"
else
  fail "next: status $status, output: $out"
  cat "$fixture/stderr"
fi

# 2. The first release, contract unchanged since npm's 4.1.1: the registry continues that line.
run tag 26.11.4
if [[ $status -eq 0 && $(field semver) == 4.1.1 && $(field base_source) == npm && $(field pushed) == true ]] &&
  [[ $(digest_of 4.1.1) == "$(digest_of 26.11.4)" ]] &&
  [[ $(annotation 4.1.1 org.opencontainers.image.version) == 4.1.1 ]] &&
  [[ $(annotation 4.1.1 sh.kaiten.release) == 26.11.4 ]] &&
  [[ $(annotation 4.1.1 org.opencontainers.image.revision) == "$REVISION" ]] &&
  [[ $(published_version 4.1.1) == 4.1.1 ]]; then
  pass "first release: 4.1.1 pushed as 26.11.4, stamped and annotated"
else
  fail "first release: status $status, output: $out"
  cat "$fixture/stderr"
fi
first=$(digest_of 4.1.1 || true)

# 3. The same tag again pushes nothing.
run tag 26.11.4
if [[ $status -eq 0 && $(field pushed) == false && $(field semver) == 4.1.1 && $(digest_of 26.11.4) == "$first" ]]; then
  pass "re-run: nothing pushed"
else
  fail "re-run: status $status, output: $out"
  cat "$fixture/stderr"
fi

# 4. An unchanged release tags the existing artifact. The CalVer tags 26.11.4 and `next` sort
# above 4.1.1 and must not be taken for the base.
run tag 26.11.5
if [[ $status -eq 0 && $(field pushed) == false && $(field base) == 4.1.1 && $(field base_source) == registry ]] &&
  [[ $(digest_of 26.11.5) == "$first" ]]; then
  pass "unchanged release: 26.11.5 added to 4.1.1"
else
  fail "unchanged release: status $status, output: $out"
  cat "$fixture/stderr"
fi

# 5. A new operation is a minor.
"$yq" -i '.paths."/others".get = {"operationId": "listOthers", "responses": {"200": {"description": "ok"}}}' "$SPEC"
run tag 26.11.6
if [[ $status -eq 0 && $(field semver) == 4.2.0 && $(field bump) == minor && $(field pushed) == true ]] &&
  [[ $(digest_of 4.2.0) == "$(digest_of 26.11.6)" && $(digest_of 4.2.0) != "$first" ]] &&
  [[ $(published_version 26.11.6) == 4.2.0 ]] &&
  [[ $(digest_of 4.1.1) == "$first" ]]; then
  pass "changed release: 4.2.0 pushed as 26.11.6, 4.1.1 untouched"
else
  fail "changed release: status $status, output: $out"
  cat "$fixture/stderr"
fi

# 6. 26.11.5 shipped 4.1.1; re-running it on this tree would mean the tag moved.
run tag 26.11.5
if [[ $status -eq 1 && $(digest_of 26.11.5) == "$first" ]] && grep -q 'was moved' "$fixture/stderr"; then
  pass "moved tag: refused"
else
  fail "moved tag: status $status, output: $out"
  cat "$fixture/stderr"
fi

# 7. A pre-release publishes no contract.
run tag 26.11.7-rc.1
if [[ $status -eq 2 ]] && ! oras manifest fetch --plain-http --descriptor "$CONTRACT_REPO:26.11.7-rc.1" >/dev/null 2>&1; then
  pass "pre-release: refused"
else
  fail "pre-release: status $status"
fi

# 8. A semver is pushed once. A decoy holds 5.0.0 without being a contract version (its annotation
# says otherwise), so it is not the base, and the breaking change that should become 5.0.0 stops.
mkdir -p "$fixture/decoy" && printf 'decoy\n' >"$fixture/decoy/d.txt"
(cd "$fixture/decoy" && oras push --plain-http "$CONTRACT_REPO:5.0.0" d.txt:text/plain \
  --annotation org.opencontainers.image.version=0.0.0 >/dev/null)
decoy=$(digest_of 5.0.0)
"$yq" -i 'del(.paths."/things")' "$SPEC"
run tag 26.11.8
if [[ $status -eq 1 && $(digest_of 5.0.0) == "$decoy" ]] && grep -q 'never moves' "$fixture/stderr" &&
  ! oras manifest fetch --plain-http --descriptor "$CONTRACT_REPO:26.11.8" >/dev/null 2>&1; then
  pass "taken semver: refused, nothing tagged"
else
  fail "taken semver: status $status, output: $out"
  cat "$fixture/stderr"
fi

# 9. An unreachable registry is an error, never an empty one.
CONTRACT_REPO=127.0.0.1:1/contract run tag 26.11.9
if [[ $status -ne 0 ]]; then
  pass "unreachable registry: failed"
else
  fail "unreachable registry: status 0, output: $out"
fi

if ((failures > 0)); then
  echo "$failures failure(s)"
  exit 1
fi
