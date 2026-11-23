#!/usr/bin/env bash
#
# Renders the facts of a release (facts.sh's JSON) as its deterministic body, in markdown: the
# body a GitHub Release carries from its tag until a written note replaces it.
#
# Usage: scripts/release-notes/facts.sh TAG | scripts/release-notes/body.sh
#        scripts/release-notes/body.sh FACTS.json
#
# Nothing here is written by hand or by a model: every line comes from a pull request title, a
# commit subject, oasdiff or git, so the body says exactly what the facts say. An empty range
# gets one line.
#
# The body stays under MAX_CHARS (60000): past it, the longest lists are cut and say how many
# entries they left out.

set -euo pipefail

max=${MAX_CHARS:-60000}
facts=$(cat "${1:-/dev/stdin}")

render() { # LIMIT: the most entries any list shows
  jq -r --argjson limit "$1" '
    def entry_pr: "- \(if .scope then "**\(.scope):** " else "" end)\(.description) ([#\(.number)](\(.url)))";
    def entry_direct: "- \(if .scope then "**\(.scope):** " else "" end)\(.description) (\(.sha[0:7]))";
    def cut($xs): ($xs[0:$limit]) + (if ($xs | length) > $limit then ["- … and \(($xs | length) - $limit) more"] else [] end);
    def section($title; $xs): if ($xs | length) > 0 then ["", "### \($title)", ""] + cut($xs) else [] end;

    . as $f
    | (($f.pull_requests | map(. + {line: entry_pr})) + ($f.direct_commits | map(. + {line: entry_direct}))) as $all
    | [
        (if $f.stable then empty
         else "Pre-release of \($f.tag | sub("-.*$"; "")), for testing.\(if ($f.contract.openapi | length) > 0 then " It publishes no contract version." else "" end)" end),
        (if $f.previous then "Changes in \($f.name) since \($f.previous)." else "Changes in \($f.name) up to \($f.tag)." end)
      ] as $head
    | if ($all | length) == 0 and ($f.migrations | length) == 0 then
        ($head[0:-1] + ["No changes in \($f.name) since \($f.previous // "the first commit")."]) | join("\n\n")
      else
        (
          $head
          + section("Breaking changes"; [$all[] | select(.breaking) | .line])
          + section("Features"; [$all[] | select(.type == "feat" and (.breaking | not)) | .line])
          + section("Fixes"; [$all[] | select(.type == "fix" and (.breaking | not)) | .line])
          + section("Performance"; [$all[] | select(.type == "perf" and (.breaking | not)) | .line])
          + section("Other changes"; [$all[] | select((.type | IN("feat", "fix", "perf") | not) and (.breaking | not)) | .line])
          + (
              [$f.contract.openapi[]
                | if .added then "- `\(.path)`: new in this release."
                  elif (.changes | length) == 0 then empty
                  else "- `\(.path)`: \(.changes | length) change(s), \(.breaking) of them breaking." end]
              + (if $f.contract.graphql and $f.contract.graphql.changed then ["- The GraphQL schema changed."] else [] end)
              | if length > 0 then ["", "### API contract", ""] + . else [] end
            )
          + section("Database migrations"; [$f.migrations[] | "- `\(split("/") | last)`"])
          + section("Chart values"; [$f.charts[] | "- `\(.path)` changed."])
          + (
              if ($f.components | length) > 0 then
                ["", "### Artifacts", "", "| Artifact | Since \($f.previous // "the first commit") |", "|---|---|"]
                + [$f.components[] | "| `\(.name)` | \(if .code_changed then "code changed" else "rebuilt only" end) |"]
              else [] end
            )
        ) | join("\n")
      end
  ' <<<"$facts"
}

body=$(render 1000000)
for limit in 200 100 50 20; do
  ((${#body} > max)) || break
  body=$(render "$limit")
done
if ((${#body} > max)); then
  echo "error: the body is ${#body} characters even with 20 entries per list; MAX_CHARS is $max" >&2
  exit 1
fi
printf '%s\n' "$body"
