#!/bin/sh
# Capture first: a failed graph inspection must never become a clean grep result.
set -eu
cd "$(dirname "$0")/.."
for module in api api/cmd/schema-docs; do
  graph=$(cd "$module" && go list -m all)
  if printf '%s\n' "$graph" | grep -E '^github\.com/kaitencloud/' | grep -v -E '^github\.com/kaitencloud/(kaiten/|sdk-go( |$))'; then
    echo "$module depends on a Kaiten module other than the Go SDK — kaiten is depended on, it never depends back" >&2
    exit 1
  fi
done
