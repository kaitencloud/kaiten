#!/usr/bin/env bash
#
# The facts of a release: what shipped since the previous one, worked out from git and the
# GitHub API alone, so that the same tag gives the same facts whoever runs it.
#
# Usage: scripts/release-notes/facts.sh TAG [PREVIOUS]
#
# Prints one JSON document; body.sh renders it as the release's deterministic body. What this
# repository's facts cover (its contract documents, migrations, charts and artifacts) is set in
# config.sh, next to this script. Run it from a clone that has the tags and main.
#
# WHICH TAGS
#
#   YY.MM.N            a stable release
#   YY.MM.N-rc.N       a pre-release (also -beta.N): the same facts, marked as such
#
# The tag must be on main (MAIN_REF, origin/main by default). Anyone with write access can create
# a tag on any commit, and the facts of a commit that never reached main describe nothing that
# shipped.
#
# THE PREVIOUS RELEASE
#
# The highest stable tag in `git tag --merged TAG` that sorts strictly below TAG with `sort -V`.
# Two tags can share a commit (an rc and the stable tag after it, or 26.09.5 and 26.09.7 in one
# repository's history), and a higher tag on the same commit is never the base. Tags of another
# shape (theme/1.0.3) are not releases. With no previous release, the range starts after the root
# commit. PREVIOUS replaces the rule with a release of your choosing, which must be an ancestor
# of TAG: a version a fleet runs, for instance.
#
# WHAT SHIPPED
#
# Every commit in the range, mapped to its pull request with
# GET /repos/{owner}/{repo}/commits/{sha}/pulls. That also catches rebase merges, which carry no
# (#N), and the commits of a merge commit. A pull request merged into another one's branch is
# named in the squash body, as (#N) at the end of a line, and is listed too, once the API confirms
# it is a merged pull request: issues share the numbering, and a body can name one. A commit with
# no pull request is kept as a direct commit. Each entry carries its Conventional Commits type and
# scope, from the pull request's title or the direct commit's subject; a breaking change is a `!`
# or a BREAKING CHANGE footer in any of its commits.
#
# Needs git, jq, and gh (authenticated: GH_TOKEN or `gh auth login`), plus oasdiff for the
# OpenAPI comparison, which takes config.sh's OASDIFF_SEVERITY_LEVELS, as the contract's version
# does, so the changes counted as breaking here are the ones that decided its bump. FACTS_OFFLINE=1 skips the API and lists every commit as direct, for the
# tests.

set -euo pipefail

usage() {
  echo "usage: $0 TAG [PREVIOUS]" >&2
  exit 2
}
[[ $# -ge 1 && $# -le 2 ]] || usage
tag=$1
previous=${2:-}

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=config.sh
source "$here/config.sh"
main_ref=${MAIN_REF:-origin/main}
oasdiff=${OASDIFF:-oasdiff}
offline=${FACTS_OFFLINE:-}

stable_re='^[0-9]{2}\.[0-9]{2}\.[0-9]+$'
release_re='^[0-9]{2}\.[0-9]{2}\.[0-9]+(-(rc|beta)\.[0-9]+)?$'

if [[ ! $tag =~ $release_re ]]; then
  echo "error: '$tag' is not a release tag (YY.MM.N, or YY.MM.N-rc.N)" >&2
  exit 2
fi
stable=false
[[ $tag =~ $stable_re ]] && stable=true

sha=$(git rev-parse --verify --quiet "refs/tags/$tag^{commit}") || {
  echo "error: no tag $tag here; fetch the tags first" >&2
  exit 1
}
if ! git merge-base --is-ancestor "$sha" "$main_ref"; then
  echo "error: $tag ($sha) is not on $main_ref. A release is cut from main." >&2
  exit 1
fi

# ── The previous release ─────────────────────────────────────────────────────

if [[ -n $previous ]]; then
  if [[ ! $previous =~ $stable_re ]]; then
    echo "error: PREVIOUS '$previous' is not a stable release tag" >&2
    exit 2
  fi
  previous_sha=$(git rev-parse --verify --quiet "refs/tags/$previous^{commit}") || {
    echo "error: no tag $previous here" >&2
    exit 1
  }
  if ! git merge-base --is-ancestor "$previous_sha" "$sha"; then
    echo "error: $previous is not an ancestor of $tag" >&2
    exit 1
  fi
else
  previous=$(
    {
      git tag --merged "$sha" | grep -E "$stable_re" || true
      echo "$tag"
    } | sort -uV | awk -v t="$tag" '$0 == t { print p; exit } { p = $0 }'
  )
  previous_sha=""
  [[ -z $previous ]] || previous_sha=$(git rev-parse "refs/tags/$previous^{commit}")
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

if [[ -n $previous_sha ]]; then
  git rev-list --reverse "$previous_sha..$sha" >"$work/commits"
else
  # From the root, root excluded: the first release lists what came after the first commit.
  git rev-list --reverse "$sha" | tail -n +2 >"$work/commits"
fi

# ── What shipped ─────────────────────────────────────────────────────────────

# conventional TEXT: {type, scope, breaking, description} from a Conventional Commits header.
conventional() {
  jq -n --arg h "$1" '
    ($h | capture("^(?<type>[a-z]+)(\\((?<scope>[^)]*)\\))?(?<bang>!)?: (?<description>.+)$")
      // {type: "other", scope: null, bang: null, description: $h})
    | {type, scope: (.scope // null), breaking: (.bang == "!"), description}'
}

# merged_pr N: 0 if #N is a merged pull request, 1 if it is not: an issue (404) or a pull request
# closed unmerged. Any other answer stops the script, so an outage is never read as "not a pull
# request" and the facts never quietly lose an entry.
merged_pr() {
  local merged_at
  [[ -z $offline ]] || return 1
  if merged_at=$(gh api "repos/$REPOSITORY/pulls/$1" --jq '.merged_at // ""' 2>"$work/gh-err"); then
    [[ -n $merged_at ]]
    return
  fi
  if grep -q 'HTTP 404' "$work/gh-err"; then
    return 1
  fi
  echo "error: cannot tell whether #$1 is a merged pull request: $(cat "$work/gh-err")" >&2
  exit 1
}

: >"$work/prs.jsonl"
: >"$work/direct.jsonl"
while read -r commit; do
  [[ -n $commit ]] || continue
  subject=$(git log -1 --format=%s "$commit")
  body=$(git log -1 --format=%b "$commit")
  breaking_footer=false
  grep -qE '^BREAKING[ -]CHANGE: ' <<<"$body" && breaking_footer=true

  numbers=""
  if [[ -z $offline ]]; then
    numbers=$(gh api "repos/$REPOSITORY/commits/$commit/pulls" \
      --jq '.[] | select(.merged_at != null) | .number')
  fi
  # Stacked pull requests, named at the end of a squash body's lines, kept once confirmed.
  for n in $(sed -nE 's/.*\(#([0-9]+)\)[[:space:]]*$/\1/p' <<<"$body" | awk '!seen[$0]++'); do
    if merged_pr "$n"; then numbers=$(printf '%s\n%s' "$numbers" "$n"); fi
  done
  numbers=$(grep -E '^[0-9]+$' <<<"$numbers" | awk '!seen[$0]++' || true)

  if [[ -z $numbers ]]; then
    jq -cn --arg sha "$commit" --arg subject "$subject" --arg author "$(git log -1 --format=%an "$commit")" \
      --argjson footer "$breaking_footer" --argjson cc "$(conventional "$subject")" \
      '$cc + {sha: $sha, subject: $subject, author: $author, breaking: ($cc.breaking or $footer)}' >>"$work/direct.jsonl"
    continue
  fi
  for n in $numbers; do
    printf '%s %s %s\n' "$n" "$commit" "$breaking_footer" >>"$work/pr-commits"
  done
done <"$work/commits"

# One entry per pull request, in the order the range first reaches it.
if [[ -s $work/pr-commits ]]; then
  for n in $(awk '!seen[$1]++ { print $1 }' "$work/pr-commits"); do
    pr=$(gh api "repos/$REPOSITORY/pulls/$n" --jq '{number, title, url: .html_url, author: .user.login}')
    title=$(jq -r .title <<<"$pr")
    commits=$(awk -v n="$n" '$1 == n { print $2 }' "$work/pr-commits" | jq -R . | jq -sc .)
    footer=$(awk -v n="$n" '$1 == n && $3 == "true" { f = 1 } END { print (f ? "true" : "false") }' "$work/pr-commits")
    jq -cn --argjson pr "$pr" --argjson cc "$(conventional "$title")" --argjson commits "$commits" \
      --argjson footer "$footer" \
      '$pr + $cc + {commits: $commits, breaking: ($cc.breaking or $footer)}' >>"$work/prs.jsonl"
  done
fi

# ── What changed in the contract ─────────────────────────────────────────────

# show REF PATH OUT: the file at REF, or nothing; 0 if it existed.
show() { git show "$1:$2" >"$3" 2>/dev/null; }

# The checks the contract's version reclassifies. oasdiff refuses comments and blank lines in its
# severity file, so it gets the entries alone, as next-version.sh gives them.
levels=()
if [[ -n ${OASDIFF_SEVERITY_LEVELS:-} ]]; then
  if [[ ! -f $OASDIFF_SEVERITY_LEVELS ]]; then
    echo "error: config.sh names $OASDIFF_SEVERITY_LEVELS, which does not exist" >&2
    exit 1
  fi
  grep -vE '^[[:space:]]*(#|$)' "$OASDIFF_SEVERITY_LEVELS" >"$work/levels.txt" || true
  [[ ! -s $work/levels.txt ]] || levels=(--severity-levels "$work/levels.txt")
fi

: >"$work/openapi.jsonl"
for doc in ${OPENAPI_DOCS[@]+"${OPENAPI_DOCS[@]}"}; do
  show "$sha" "$doc" "$work/new.yaml" || continue
  if [[ -z $previous_sha ]] || ! show "$previous_sha" "$doc" "$work/old.yaml"; then
    jq -cn --arg path "$doc" '{path: $path, added: true, changes: [], breaking: 0}' >>"$work/openapi.jsonl"
    continue
  fi
  "$oasdiff" changelog "$work/old.yaml" "$work/new.yaml" -f json ${levels[@]+"${levels[@]}"} |
    jq -c --arg path "$doc" '{path: $path, added: false,
      changes: [.[] | {id, level, text, operation: (.operation // null), path: (.path // null)}],
      breaking: ([.[] | select(.level >= 2)] | length)}' >>"$work/openapi.jsonl"
done

# The GraphQL schema at REF, assembled as release-graphql-schema.yml does.
graphql_at() {
  local ref=$1 out=$2 file glob
  : >"$out"
  [[ -n $ref ]] || return 0
  while read -r file; do
    for glob in ${GRAPHQL_SCHEMA_GLOBS[@]+"${GRAPHQL_SCHEMA_GLOBS[@]}"}; do
      # shellcheck disable=SC2053 # the glob is meant to match
      if [[ $file == $glob ]]; then
        git show "$ref:$file" >>"$out"
        printf '\n' >>"$out"
        break
      fi
    done
  done < <(git ls-tree -r --name-only "$ref" | LC_ALL=C sort)
}
graphql='null'
if ((${#GRAPHQL_SCHEMA_GLOBS[@]} > 0)); then
  graphql_at "$previous_sha" "$work/old.graphqls"
  graphql_at "$sha" "$work/new.graphqls"
  diff -u --label "$previous" --label "$tag" "$work/old.graphqls" "$work/new.graphqls" >"$work/graphql.diff" || true
  graphql=$(jq -n --rawfile d "$work/graphql.diff" '{changed: ($d != ""), diff: $d}')
fi

# ── What else ────────────────────────────────────────────────────────────────

base_tree=${previous_sha:-$(git hash-object -t tree /dev/null)}
migrations=$(git diff --name-only --diff-filter=A "$base_tree" "$sha" -- ${MIGRATION_DIRS[@]+"${MIGRATION_DIRS[@]}"} |
  { grep -E '\.sql$' || true; } | LC_ALL=C sort | jq -R . | jq -sc .)

: >"$work/charts.jsonl"
for values in ${CHART_VALUES[@]+"${CHART_VALUES[@]}"}; do
  diff=$(git diff "$base_tree" "$sha" -- "$values")
  [[ -n $diff ]] || continue
  jq -cn --arg path "$values" --arg diff "$diff" '{path: $path, diff: $diff}' >>"$work/charts.jsonl"
done

: >"$work/components.jsonl"
for entry in ${COMPONENTS[@]+"${COMPONENTS[@]}"}; do
  name=${entry%%=*}
  read -r -a paths <<<"${entry#*=}"
  now=$(git log -1 --format=%H "$sha" -- "${paths[@]}")
  before=""
  [[ -z $previous_sha ]] || before=$(git log -1 --format=%H "$previous_sha" -- "${paths[@]}")
  jq -cn --arg name "$name" --arg revision "$now" --arg before "$before" \
    '{name: $name, revision: $revision, code_changed: ($before == "" or $before != $revision)}' >>"$work/components.jsonl"
done

jq -n \
  --arg repository "$REPOSITORY" --arg name "$NAME" \
  --arg tag "$tag" --arg sha "$sha" --argjson stable "$stable" \
  --arg previous "$previous" --arg previous_sha "$previous_sha" \
  --slurpfile prs "$work/prs.jsonl" --slurpfile direct "$work/direct.jsonl" \
  --slurpfile openapi "$work/openapi.jsonl" --argjson graphql "$graphql" \
  --argjson migrations "$migrations" --slurpfile charts "$work/charts.jsonl" \
  --slurpfile components "$work/components.jsonl" \
  --argjson commits "$(wc -l <"$work/commits" | tr -d ' ')" '{
    repository: $repository, name: $name,
    tag: $tag, sha: $sha, stable: $stable,
    previous: (if $previous == "" then null else $previous end),
    previous_sha: (if $previous_sha == "" then null else $previous_sha end),
    commits: $commits,
    pull_requests: $prs, direct_commits: $direct,
    contract: {openapi: $openapi, graphql: $graphql},
    migrations: $migrations, charts: $charts, components: $components
  }'
