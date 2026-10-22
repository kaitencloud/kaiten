#!/bin/sh
# Test the workflow's actual guard, not a second copy of its implementation.
set -eu
cd "$(dirname "$0")/../.."
fixture=$(mktemp -d "${TMPDIR:-/tmp}/oss-hygiene.XXXXXX")
trap 'rm -rf "$fixture"' EXIT
trap 'exit 1' HUP INT TERM

awk '
  /^      - name: No committed build artifacts$/ { found++; next }
  found && /^        run: \|$/ { body = 1; next }
  body && /^      - name:/ { exit }
  body && /^          / { print substr($0, 11) }
  END { if (found != 1 || !body) exit 1 }
' .github/workflows/oss-hygiene.yml > "$fixture/guard.sh"
test -s "$fixture/guard.sh"

shells="/bin/sh /bin/bash"
if command -v dash >/dev/null 2>&1; then
  shells="$shells $(command -v dash)"
fi
for shell in $shells; do
  "$shell" -n "$fixture/guard.sh"
done

mkdir "$fixture/repo"
cd "$fixture/repo"
git init -q
mkdir api
for extension in go md sql yaml yml json txt tmpl; do
  printf 'allowed source\n' > "api/source.$extension"
done
printf 'plain text\n' > api/plain
# Copy but never execute: Mach-O on macOS, ELF on Linux.
cp /bin/sh api/allowed.go
cp /bin/sh outside-api
git add -- .
cp /bin/sh api/untracked-binary
for shell in $shells; do
  "$shell" -e "$fixture/guard.sh" > "$fixture/output"
  test ! -s "$fixture/output"
done

cp /bin/sh api/compiled-binary
git add -- api/compiled-binary
printf '%s\n' 'api/compiled-binary' \
  '::error::Compiled binaries are committed. Build outputs belong in .gitignore, not in the tree.' \
  > "$fixture/expected"
for shell in $shells; do
  status=0
  "$shell" -e "$fixture/guard.sh" > "$fixture/output" || status=$?
  test "$status" -eq 1
  diff -u "$fixture/expected" "$fixture/output"
  printf 'PASS: %s syntax, allowed sources, compiled-binary rejection\n' "$shell"
done
