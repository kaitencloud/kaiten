#!/usr/bin/env bash
# Tests scripts/release-notes/facts.sh and body.sh on a fixture repository, offline: which tag is
# the previous release, what the range holds, and what the body says. Then checks that config.sh
# names the same source paths as the release workflows that build each image.
# Needs git, jq and yq.
set -euo pipefail
cd "$(dirname "$0")/../.."
root=$PWD
yq=${YQ:-yq}

fixture=$(mktemp -d "${TMPDIR:-/tmp}/release-notes-facts.XXXXXX")
trap 'rm -rf "$fixture"' EXIT
trap 'exit 1' HUP INT TERM

failures=0
fail() {
  echo "FAIL: $*"
  failures=$((failures + 1))
}
pass() { echo "PASS: $*"; }

# ── The fixture: a history with every tag shape the rules care about ─────────

repo=$fixture/repo
mkdir -p "$repo/scripts/release-notes"
cp scripts/release-notes/facts.sh scripts/release-notes/body.sh "$repo/scripts/release-notes/"
cat >"$repo/scripts/release-notes/config.sh" <<'CONFIG'
REPOSITORY=example/fixture
NAME=fixture
OPENAPI_DOCS=()
GRAPHQL_SCHEMA_GLOBS=()
MIGRATION_DIRS=(db/migrations)
CHART_VALUES=(charts/x/values.yaml)
COMPONENTS=('api=api' 'web=web')
CONFIG
cd "$repo"
# The fixture's git ignores the developer's and the system's config (signing, tag defaults).
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
git init -q -b main
git config user.email fixture@example.com
git config user.name Fixture
commit() { # MESSAGE FILE...
  local message=$1 f
  shift
  for f in "$@"; do
    mkdir -p "$(dirname "$f")"
    echo "$message" >>"$f"
  done
  git add -A
  git commit -q -m "$message"
}
commit "chore: initial commit" README.md api.yaml
commit "feat(api): list the things" api/main.go
git tag 26.09.1
git tag theme/1.0.0
commit "fix(web): draw the things" web/index.html db/migrations/001_things.sql charts/x/values.yaml
git tag 26.09.2-rc.1
commit $'refactor(api)!: rename the things\n\nThe old names are gone.' api/main.go
git tag 26.09.2
commit $'perf(api): cache the things\n\nBREAKING CHANGE: the cache needs a volume.' api/main.go
commit "fix: an unscoped fix" api/other.go
# Two stable tags on one commit: the higher one is never the lower one's base.
git tag 26.09.5
git tag 26.09.7
git checkout -q -b side
commit "feat(api): never merged" api/side.go
git tag 26.09.9
git checkout -q main
# Squash bodies that name other numbers: a merged pull request, an issue, a pull request closed
# unmerged; then one the API cannot answer for.
commit $'feat(api): a squash\n\n* feat(api): stacked (#7)\n* see the issue (#8)\n* fix: never merged (#9)' api/stacked.go
git tag 26.10.1
commit $'fix(api): another squash\n\n* fix: unreadable (#10)' api/unreadable.go
git tag 26.10.2

# A stand-in for `gh api PATH --jq EXPR`, answering as the API does.
mkdir -p "$fixture/bin"
cat >"$fixture/bin/gh" <<'STUB'
#!/usr/bin/env bash
path=$2 expr=.
shift 2
while [ $# -gt 0 ]; do case $1 in --jq) expr=$2; shift 2 ;; *) shift ;; esac; done
case $path in
  repos/example/fixture/commits/*/pulls) body='[]' ;;
  repos/example/fixture/pulls/7) body='{"number":7,"title":"feat(api): stacked","html_url":"https://example.com/7","user":{"login":"someone"},"merged_at":"2026-10-01T00:00:00Z"}' ;;
  repos/example/fixture/pulls/8) echo 'gh: Not Found (HTTP 404)' >&2; exit 1 ;;
  repos/example/fixture/pulls/9) body='{"number":9,"title":"fix: never merged","html_url":"https://example.com/9","user":{"login":"someone"},"merged_at":null}' ;;
  repos/example/fixture/pulls/10) echo 'gh: Server Error (HTTP 500)' >&2; exit 1 ;;
  *) echo "stub: unexpected path $path" >&2; exit 1 ;;
esac
jq -r "$expr" <<<"$body"
STUB
chmod +x "$fixture/bin/gh"

export FACTS_OFFLINE=1 MAIN_REF=main
facts() { scripts/release-notes/facts.sh "$@"; }
q() { jq -r "$1" <<<"$out"; }

# ── Which release is the previous one ────────────────────────────────────────

out=$(facts 26.09.1)
if [[ $(q .previous) == null && $(q .commits) == 1 && $(q '.direct_commits[0].subject') == "feat(api): list the things" ]]; then
  pass "first release: no previous, root commit left out"
else
  fail "first release: $(q '{previous, commits}' | tr -d '\n')"
fi

out=$(facts 26.09.2-rc.1)
if [[ $(q .previous) == 26.09.1 && $(q .stable) == false ]]; then
  pass "pre-release: based on the stable tag below it"
else
  fail "pre-release: $(q '{previous, stable}' | tr -d '\n')"
fi

out=$(facts 26.09.2)
if [[ $(q .previous) == 26.09.1 && $(q .commits) == 2 ]]; then
  pass "stable after an rc: based on the previous stable tag, not the rc"
else
  fail "stable after an rc: $(q '{previous, commits}' | tr -d '\n')"
fi

out=$(facts 26.09.5)
if [[ $(q .previous) == 26.09.2 && $(q .commits) == 2 ]]; then
  pass "a higher tag on the same commit is not the base"
else
  fail "same commit: $(q '{previous, commits}' | tr -d '\n')"
fi

out=$(facts 26.09.7)
if [[ $(q .previous) == 26.09.5 && $(q .commits) == 0 ]]; then
  pass "the higher tag on a shared commit: an empty range"
else
  fail "empty range: $(q '{previous, commits}' | tr -d '\n')"
fi

out=$(facts 26.09.5 26.09.1)
if [[ $(q .previous) == 26.09.1 && $(q .commits) == 4 ]]; then
  pass "PREVIOUS replaces the rule"
else
  fail "PREVIOUS: $(q '{previous, commits}' | tr -d '\n')"
fi

# ── What the range holds ─────────────────────────────────────────────────────

out=$(facts 26.09.2)
if [[ $(q '[.direct_commits[] | "\(.type)/\(.scope)/\(.breaking)"] | join(",")') == "fix/web/false,refactor/api/true" ]]; then
  pass "types, scopes, and a breaking change marked with !"
else
  fail "types: $(q '[.direct_commits[] | {type, scope, breaking}]' | tr -d '\n ')"
fi
if [[ $(q '.migrations | join(",")') == "db/migrations/001_things.sql" && $(q '.charts[0].path') == "charts/x/values.yaml" ]]; then
  pass "new migrations and chart values"
else
  fail "migrations or charts: $(q '{migrations, charts: [.charts[].path]}' | tr -d '\n ')"
fi

out=$(facts 26.09.5)
if [[ $(q '[.direct_commits[] | "\(.type)/\(.scope)/\(.breaking)"] | join(",")') == "perf/api/true,fix/null/false" ]]; then
  pass "a BREAKING CHANGE footer, and an unscoped commit"
else
  fail "footer: $(q '[.direct_commits[] | {type, scope, breaking}]' | tr -d '\n ')"
fi
if [[ $(q '[.components[] | "\(.name)=\(.code_changed)"] | join(",")') == "api=true,web=false" ]]; then
  pass "an artifact with no new commit is rebuilt only"
else
  fail "components: $(q '.components' | tr -d '\n ')"
fi

# ── Refusals ─────────────────────────────────────────────────────────────────

refuses() { # NAME ARGS...
  local name=$1
  shift
  if facts "$@" >/dev/null 2>&1; then fail "$name: accepted"; else pass "$name: refused"; fi
}
refuses "a tag that is not on main" 26.09.9
refuses "a tag of another shape" theme/1.0.0
refuses "a tag that does not exist" 26.09.3
refuses "a PREVIOUS that is not an ancestor" 26.09.2 26.09.5

# ── Numbers named in a body ──────────────────────────────────────────────────

out=$(PATH="$fixture/bin:$PATH" FACTS_OFFLINE='' scripts/release-notes/facts.sh 26.10.1 2>"$fixture/stderr") || true
if [[ $(q '[.pull_requests[].number] | join(",")') == 7 && $(q '.direct_commits | length') == 0 ]]; then
  pass "a body's numbers: the merged pull request kept, the issue and the unmerged one dropped"
else
  fail "a body's numbers: $(q '{prs: [.pull_requests[].number], direct: (.direct_commits | length)}' 2>&1 | tr -d '\n ') $(cat "$fixture/stderr")"
fi
if PATH="$fixture/bin:$PATH" FACTS_OFFLINE='' scripts/release-notes/facts.sh 26.10.2 >/dev/null 2>"$fixture/stderr"; then
  fail "an API failure on a body's number was read as \"not a pull request\""
elif grep -q '#10' "$fixture/stderr"; then
  pass "an API failure on a body's number stops the script"
else
  fail "an API failure stopped the script without naming #10: $(cat "$fixture/stderr")"
fi

# ── The severity list ────────────────────────────────────────────────────────

# A stand-in for oasdiff that records how it was called, and the severity file it was given.
cat >"$fixture/bin/oasdiff" <<'STUB'
#!/usr/bin/env bash
printf 'args: %s\n' "$*" >>"$OASDIFF_LOG"
prev=""
for arg in "$@"; do
  [[ $prev == --severity-levels ]] && cat "$arg" >>"$OASDIFF_LOG"
  prev=$arg
done
echo '[]'
STUB
chmod +x "$fixture/bin/oasdiff"
cp scripts/release-notes/config.sh "$fixture/config.bak"
printf '%s\n' 'OPENAPI_DOCS=(api.yaml)' 'OASDIFF_SEVERITY_LEVELS=severity.txt' >>scripts/release-notes/config.sh
printf '# why this one\n\nresponse-property-enum-value-added INFO\n' >severity.txt
export OASDIFF_LOG="$fixture/oasdiff.log"
: >"$OASDIFF_LOG"
OASDIFF="$fixture/bin/oasdiff" facts 26.09.2 >/dev/null
if grep -q -- '--severity-levels' "$OASDIFF_LOG" && grep -qx 'response-property-enum-value-added INFO' "$OASDIFF_LOG" &&
  ! grep -q 'why this one' "$OASDIFF_LOG"; then
  pass "the contract's severity list reaches oasdiff, its entries only"
else
  fail "severity list: $(cat "$OASDIFF_LOG")"
fi
sed -i.tmp 's/^OASDIFF_SEVERITY_LEVELS=.*/OASDIFF_SEVERITY_LEVELS=absent.txt/' scripts/release-notes/config.sh
if OASDIFF="$fixture/bin/oasdiff" facts 26.09.2 >/dev/null 2>&1; then
  fail "a severity file config.sh names but the tree lacks was ignored"
else
  pass "a severity file config.sh names but the tree lacks stops the script"
fi
cp "$fixture/config.bak" scripts/release-notes/config.sh
rm -f severity.txt scripts/release-notes/config.sh.tmp

# ── The body ─────────────────────────────────────────────────────────────────

body=$(facts 26.09.2 | scripts/release-notes/body.sh)
if grep -qx '### Breaking changes' <<<"$body" && grep -qx -- '- \*\*api:\*\* rename the things ([0-9a-f]\{7\})' <<<"$body" &&
  grep -qx '### Fixes' <<<"$body" && grep -qx -- '- `001_things.sql`' <<<"$body" &&
  grep -qx '| `web` | code changed |' <<<"$body" && head -1 <<<"$body" | grep -qx 'Changes in fixture since 26.09.1.'; then
  pass "body: sections, entries, migrations and artifacts"
else
  fail "body:"
  echo "$body"
fi

body=$(facts 26.09.7 | scripts/release-notes/body.sh)
if [[ $body == "No changes in fixture since 26.09.5." ]]; then
  pass "body: an empty range is one line"
else
  fail "body for an empty range: $body"
fi

body=$(facts 26.09.2-rc.1 | scripts/release-notes/body.sh)
if head -1 <<<"$body" | grep -qx 'Pre-release of 26.09.2, for testing.'; then
  pass "body: a pre-release says so, and names no contract when there is none"
else
  fail "body for a pre-release: $(head -1 <<<"$body")"
fi

body=$(facts 26.09.5 26.09.1 | MAX_CHARS=150 scripts/release-notes/body.sh 2>/dev/null) && status=0 || status=$?
if [[ $status -ne 0 ]]; then
  pass "body: refuses what it cannot fit"
else
  fail "body: printed ${#body} characters with MAX_CHARS=150"
fi

# ── config.sh against the release workflows ─────────────────────────────────

cd "$root"
# image=sorted source paths, from each docker-meta step in a job that builds and pushes.
declared=$(for workflow in .github/workflows/release-*.yml; do
  "$yq" -o=json '.' "$workflow" | jq -r '.jobs[]
    | select([.steps[]? | .uses // "" | test("^docker/build-push-action@")] | any)
    | .steps[] | select(.uses == "./.github/actions/docker-meta")
    | "\(.with["image-name"])=\(.with["source-paths"] // "")"'
done | while IFS='=' read -r name paths; do
  [[ -n $paths ]] || continue
  echo "$name=$(tr ' ' '\n' <<<"$paths" | LC_ALL=C sort | xargs)"
done | LC_ALL=C sort -u)
# shellcheck source=../release-notes/config.sh
configured=$(source scripts/release-notes/config.sh && for entry in "${COMPONENTS[@]}"; do
  echo "${entry%%=*}=$(tr ' ' '\n' <<<"${entry#*=}" | LC_ALL=C sort | xargs)"
done | LC_ALL=C sort -u)
missing=$(comm -23 <(echo "$declared") <(echo "$configured"))
if [[ -z $missing ]]; then
  pass "config.sh: every image's source paths match its release workflow"
else
  fail "config.sh disagrees with the release workflows on: $missing"
fi

if ((failures > 0)); then
  echo "$failures failure(s)"
  exit 1
fi
