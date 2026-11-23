#!/usr/bin/env bash
# Tests scripts/contract/release.sh against a real OCI registry, through a contract's life: the
# first release continuing npm's line, a re-run, an unchanged release, a changed one, a moved tag,
# releases cut out of order, a pre-release, a taken semver, and the failures that must stop a run.
#
# Usage: REGISTRY=localhost:5000 scripts/tests/test-contract-release.sh
# REGISTRY is a throwaway registry spoken to over plain HTTP: `docker run -p 5000:5000 registry:2`.
# The first base is a fixture standing in for npm, so the test reads nothing from the internet.
# The releases are cut from the commits of a fixture repository, since the base is chosen by
# ancestry. Needs what release.sh needs: oras, yq, jq and oasdiff.
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${REGISTRY:?set REGISTRY to a throwaway registry, e.g. localhost:5000}"
release=$PWD/scripts/contract/release.sh
yq=${YQ:-yq}

fixture=$(mktemp -d "${TMPDIR:-/tmp}/contract-release.XXXXXX")
trap 'rm -rf "$fixture"' EXIT
trap 'exit 1' HUP INT TERM

export CONTRACT_REPO="$REGISTRY/contract-test-$$-$RANDOM"
export ORAS_FLAGS=--plain-http
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
cp "$SPEC" "$fixture/spec-4.1.1.yaml"

# The history the releases are cut from: c0, older than any contract, then c1 to c4.
# The fixture's git ignores the developer's and the system's config.
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
git init -q -b main "$fixture/git"
cd "$fixture/git"
git config user.email fixture@example.com
git config user.name Fixture
for i in 0 1 2 3 4; do
  git commit -q --allow-empty -m "commit $i"
  eval "c$i=\$(git rev-parse HEAD)"
done

failures=0
fail() {
  echo "FAIL: $*"
  failures=$((failures + 1))
}
pass() { echo "PASS: $*"; }

# run COMMIT ARGS...: runs release.sh as of COMMIT, keeps its key=value output in $out and its
# status in $status.
run() {
  status=0
  out=$(REVISION=$1 "$release" "${@:2}" 2>"$fixture/stderr") || status=$?
}
field() { sed -n "s/^$1=//p" <<<"$out"; }
digest_of() { oras resolve --plain-http "$CONTRACT_REPO:$1"; }
exists() { oras manifest fetch --plain-http --descriptor "$CONTRACT_REPO:$1" >/dev/null 2>&1; }
annotation() { oras manifest fetch --plain-http "$CONTRACT_REPO:$1" | jq -r --arg k "$2" '.annotations[$k] // empty'; }
published_version() {
  rm -rf "$fixture/pulled"
  oras pull --plain-http "$CONTRACT_REPO:$1" -o "$fixture/pulled" >/dev/null
  "$yq" '.info.version' "$fixture/pulled/openapi.yaml"
}
show_failure() { cat "$fixture/stderr"; }

# 1. main moves `next` before any release.
run "$c1" next
if [[ $status -eq 0 && $(field pushed) == true ]] && [[ $(annotation next sh.kaiten.contract.next) == 4.1.1 ]]; then
  pass "next: pushed, and would release 4.1.1"
else
  fail "next: status $status, output: $out"
  show_failure
fi

# 2. The first release, contract unchanged since npm's 4.1.1: the registry continues that line.
run "$c1" tag 26.11.4
if [[ $status -eq 0 && $(field semver) == 4.1.1 && $(field base_source) == npm && $(field pushed) == true ]] &&
  [[ $(digest_of 4.1.1) == "$(digest_of 26.11.4)" ]] &&
  [[ $(annotation 4.1.1 org.opencontainers.image.version) == 4.1.1 ]] &&
  [[ $(annotation 4.1.1 sh.kaiten.release) == 26.11.4 ]] &&
  [[ $(annotation 4.1.1 org.opencontainers.image.revision) == "$c1" ]] &&
  [[ $(published_version 4.1.1) == 4.1.1 ]]; then
  pass "first release: 4.1.1 pushed as 26.11.4, stamped and annotated"
else
  fail "first release: status $status, output: $out"
  show_failure
fi
first=$(digest_of 4.1.1 || true)

# 3. The same tag again pushes nothing.
run "$c1" tag 26.11.4
if [[ $status -eq 0 && $(field pushed) == false && $(field semver) == 4.1.1 && $(digest_of 26.11.4) == "$first" ]]; then
  pass "re-run: nothing pushed"
else
  fail "re-run: status $status, output: $out"
  show_failure
fi

# 4. An unchanged release tags the existing artifact. The CalVer tags 26.11.4 and `next` sort
# above 4.1.1 and must not be taken for the base.
run "$c2" tag 26.11.5
if [[ $status -eq 0 && $(field pushed) == false && $(field base) == 4.1.1 && $(field base_source) == registry ]] &&
  [[ $(digest_of 26.11.5) == "$first" ]]; then
  pass "unchanged release: 26.11.5 added to 4.1.1"
else
  fail "unchanged release: status $status, output: $out"
  show_failure
fi

# 5. A new operation is a minor.
"$yq" -i '.paths."/others".get = {"operationId": "listOthers", "responses": {"200": {"description": "ok"}}}' "$SPEC"
cp "$SPEC" "$fixture/spec-4.2.0.yaml"
run "$c3" tag 26.11.6
if [[ $status -eq 0 && $(field semver) == 4.2.0 && $(field bump) == minor && $(field pushed) == true ]] &&
  [[ $(digest_of 4.2.0) == "$(digest_of 26.11.6)" && $(digest_of 4.2.0) != "$first" ]] &&
  [[ $(published_version 26.11.6) == 4.2.0 ]] &&
  [[ $(digest_of 4.1.1) == "$first" ]]; then
  pass "changed release: 4.2.0 pushed as 26.11.6, 4.1.1 untouched"
else
  fail "changed release: status $status, output: $out"
  show_failure
fi
second=$(digest_of 4.2.0 || true)

# 6. 26.11.5 shipped 4.1.1; re-running it on this tree would mean the tag moved.
run "$c3" tag 26.11.5
if [[ $status -eq 1 && $(digest_of 26.11.5) == "$first" ]] && grep -q 'was moved' "$fixture/stderr"; then
  pass "moved tag: refused"
else
  fail "moved tag: status $status, output: $out"
  show_failure
fi

# 7. A release cut out of order, from c2 after 4.2.0 came from c3, with a contract that changed
# since 4.1.1: compared with 4.2.0 it would read /others as removed and mint a false major. Its
# base is 4.1.1, the newest version built from its ancestors, and it is refused.
cp "$fixture/spec-4.1.1.yaml" "$SPEC"
"$yq" -i '.paths."/elsewhere".get = {"operationId": "listElsewhere", "responses": {"200": {"description": "ok"}}}' "$SPEC"
run "$c2" tag 26.11.10
if [[ $status -eq 1 ]] && grep -q 'cannot mint' "$fixture/stderr" && ! exists 26.11.10 && ! exists 5.0.0 &&
  [[ $(digest_of 4.2.0) == "$second" ]]; then
  pass "an older release whose contract changed: refused, nothing pushed"
else
  fail "older release, changed contract: status $status, output: $out"
  show_failure
fi

# 8. The same out-of-order release whose contract did not change gets its CalVer on 4.1.1.
cp "$fixture/spec-4.1.1.yaml" "$SPEC"
run "$c2" tag 26.11.11
if [[ $status -eq 0 && $(field semver) == 4.1.1 && $(field base) == 4.1.1 && $(field pushed) == false ]] &&
  [[ $(digest_of 26.11.11) == "$first" ]]; then
  pass "an older release whose contract did not change: tagged on the version it ships"
else
  fail "older release, unchanged contract: status $status, output: $out"
  show_failure
fi

# 9. A commit older than every contract version cannot release one.
run "$c0" tag 26.11.12
if [[ $status -eq 1 ]] && grep -q 'cannot release a contract' "$fixture/stderr" && ! exists 26.11.12; then
  pass "a commit older than every contract: refused"
else
  fail "older than every contract: status $status, output: $out"
  show_failure
fi

# 10. A pre-release publishes no contract.
cp "$fixture/spec-4.2.0.yaml" "$SPEC"
run "$c4" tag 26.11.7-rc.1
if [[ $status -eq 2 ]] && ! exists 26.11.7-rc.1; then
  pass "pre-release: refused"
else
  fail "pre-release: status $status"
fi

# 11. A semver is pushed once. A decoy holds 5.0.0 without being a contract version (its annotation
# says otherwise), so it is not the base, and the breaking change that should become 5.0.0 stops.
mkdir -p "$fixture/decoy" && printf 'decoy\n' >"$fixture/decoy/d.txt"
(cd "$fixture/decoy" && oras push --plain-http "$CONTRACT_REPO:5.0.0" d.txt:text/plain \
  --annotation org.opencontainers.image.version=0.0.0 >/dev/null)
decoy=$(digest_of 5.0.0)
"$yq" -i 'del(.paths."/things")' "$SPEC"
run "$c4" tag 26.11.8
if [[ $status -eq 1 && $(digest_of 5.0.0) == "$decoy" ]] && grep -q 'never moves' "$fixture/stderr" &&
  ! exists 26.11.8; then
  pass "taken semver: refused, nothing tagged"
else
  fail "taken semver: status $status, output: $out"
  show_failure
fi

# 12. A commit that is not in the clone is an error, never "not an ancestor".
run 0123456789abcdef0123456789abcdef01234567 tag 26.11.13
if [[ $status -eq 1 ]] && grep -q 'not in this clone' "$fixture/stderr" && ! exists 26.11.13; then
  pass "a commit missing from the clone: refused"
else
  fail "missing commit: status $status, output: $out"
  show_failure
fi

# 13. An unreachable registry is an error, never an empty one.
CONTRACT_REPO=127.0.0.1:1/contract run "$c4" tag 26.11.9
if [[ $status -ne 0 ]]; then
  pass "unreachable registry: failed"
else
  fail "unreachable registry: status 0, output: $out"
fi

if ((failures > 0)); then
  echo "$failures failure(s)"
  exit 1
fi
