#!/usr/bin/env bash
# Tests scripts/contract/next-version.sh against small contracts, one per rule it applies.
# Needs what the script needs: oasdiff and yq, on PATH or named by OASDIFF and YQ.
set -euo pipefail
cd "$(dirname "$0")/../.."
script=scripts/contract/next-version.sh
yq=${YQ:-yq}

fixture=$(mktemp -d "${TMPDIR:-/tmp}/contract-next-version.XXXXXX")
trap 'rm -rf "$fixture"' EXIT
trap 'exit 1' HUP INT TERM

# A contract with one operation, as the four files the release ships.
mkdir "$fixture/base"
cat >"$fixture/base/openapi.yaml" <<'YAML'
openapi: 3.1.0
info:
  title: Fixture
  version: 1.0.0
paths:
  /things:
    get:
      operationId: listThings
      description: Lists the things.
      responses:
        "200":
          description: The things.
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    enum: [active, retired]
    post:
      operationId: createThing
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                name:
                  type: string
      responses:
        "201":
          description: Created.
YAML
printf 'The contract.\n' >"$fixture/base/README.md"
printf 'Apache License\n' >"$fixture/base/LICENSE"
printf 'Notice.\n' >"$fixture/base/NOTICE"

# A copy of the base, changed by a yq expression on openapi.yaml.
variant() {
  local name=$1 expression=${2:-.}
  cp -R "$fixture/base" "$fixture/$name"
  "$yq" -i "$expression" "$fixture/$name/openapi.yaml"
}

failures=0
# expect NAME BUMP VERSION [ENV=VALUE...]: runs the script from 4.1.1 against variant NAME.
expect() {
  local name=$1 bump=$2 version=$3
  shift 3
  local output
  if ! output=$(env "$@" "$script" 4.1.1 "$fixture/base" "$fixture/$name" 2>"$fixture/stderr"); then
    echo "FAIL: $name: the script failed"
    cat "$fixture/stderr"
    failures=$((failures + 1))
    return
  fi
  if ! grep -qx "bump=$bump" <<<"$output" || ! grep -qx "version=$version" <<<"$output"; then
    echo "FAIL: $name: expected bump=$bump version=$version, got:"
    echo "$output"
    failures=$((failures + 1))
    return
  fi
  echo "PASS: $name -> $bump $version"
}

# expect_refusal NAME ARGS...: the script must exit 2.
expect_refusal() {
  local name=$1
  shift
  local status=0
  "$script" "$@" >/dev/null 2>&1 || status=$?
  if [[ $status -ne 2 ]]; then
    echo "FAIL: $name: expected exit 2, got $status"
    failures=$((failures + 1))
    return
  fi
  echo "PASS: $name refused"
}

variant identical
expect identical none 4.1.1

# A release stamps info.version; that alone is no change.
variant stamped '.info.version = "4.1.1"'
expect stamped none 4.1.1

# Bytes moved and the API did not: a description, then the README.
variant described '.paths."/things".get.description = "Lists every thing."'
expect described patch 4.1.2
variant readme
printf 'The contract, explained better.\n' >"$fixture/readme/README.md"
expect readme patch 4.1.2

# A base published without its NOTICE differs from one that has it.
variant no-notice-base
rm "$fixture/no-notice-base/NOTICE"
if output=$("$script" 4.1.1 "$fixture/no-notice-base" "$fixture/identical" 2>/dev/null) &&
  grep -qx 'bump=patch' <<<"$output"; then
  echo "PASS: no-notice-base -> patch"
else
  echo "FAIL: no-notice-base: expected bump=patch, got: ${output:-the script failed}"
  failures=$((failures + 1))
fi

# A new operation breaks nobody.
variant added '.paths."/others".get = {"operationId": "listOthers", "responses": {"200": {"description": "ok"}}}'
expect added minor 4.2.0

# A new required request property rejects yesterday's client.
variant required '.paths."/things".post.requestBody.content."application/json".schema.required = ["name"]'
expect required major 5.0.0

# A removed operation.
variant removed 'del(.paths."/things".post)'
expect removed major 5.0.0

# The curated list reclassifies by check id: INFO makes a major a minor, NONE leaves the bytes.
variant enum '.paths."/things".get.responses."200".content."application/json".schema.properties.status.enum += ["archived"]'
expect enum major 5.0.0
printf '# a reason\n\nresponse-property-enum-value-added INFO\n' >"$fixture/info.txt"
expect enum minor 4.2.0 SEVERITY_LEVELS="$fixture/info.txt"
printf 'response-property-enum-value-added NONE\n' >"$fixture/none.txt"
expect enum patch 4.1.2 SEVERITY_LEVELS="$fixture/none.txt"

# The committed list must load, whatever it holds.
variant committed-list
expect committed-list none 4.1.1

expect_refusal "a base version that is not semver" 26.11.3-rc.1 "$fixture/base" "$fixture/identical"
mkdir "$fixture/no-readme"
cp "$fixture/base/openapi.yaml" "$fixture/base/LICENSE" "$fixture/base/NOTICE" "$fixture/no-readme/"
expect_refusal "a new contract without its README" 4.1.1 "$fixture/base" "$fixture/no-readme"
expect_refusal "a missing base document" 4.1.1 "$fixture/absent" "$fixture/identical"
status=0
SEVERITY_LEVELS="$fixture/absent.txt" "$script" 4.1.1 "$fixture/base" "$fixture/identical" >/dev/null 2>&1 ||
  status=$?
if [[ $status -ne 2 ]]; then
  echo "FAIL: a missing severity file: expected exit 2, got $status"
  failures=$((failures + 1))
else
  echo "PASS: a missing severity file refused"
fi

if ((failures > 0)); then
  echo "$failures failure(s)"
  exit 1
fi
