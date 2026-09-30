#!/bin/sh
# Mint the local stack's platform credential, before the API is listening.
#
# This is the composition step that used to be a `kaiten-admin-tools bootstrap`
# subcommand. It is a script, and deliberately: what it does is decide POLICY --
# which credential a development machine gets, what scopes it carries, what it is
# named, and where the value is written. None of that is the binary's business.
# `kaiten-admin-tools` provides the primitive and this file chains it, so changing
# the local setup is editing a shell script rather than recompiling a Go command
# and re-deriving its flags.
#
# It also keeps the destination out of the binary. Here the value is written to a
# file under ./dev because compose bind-mounts that directory. In Kubernetes
# nothing runs this: the platform credential is minted once by an operator and
# delivered to the pod as a mounted Secret or an env var,
# per-pod, never as a shared file some other job wrote. A bootstrap subcommand
# that wrote files would have baked the local answer into the image.
#
# One credential, and nothing about dogfooding. Kaiten does not configure its own
# metering: a deployment that reports its usage into another Kaiten installation
# is set up by whatever provisions that deployment, which creates the
# organization and mints the reporting credential over the API using this
# platform credential. A stack with nothing to report to needs none of it.
#
# Idempotent in the only sense a credential can be: --replace revokes what the
# previous run created under the same name -- cascading to every token it issued
# -- and mints a fresh one. That is what makes a repeated `task up` work, and it
# is also why the file is rewritten every time: the previous value stops being
# valid. Anything still holding the old one gets a 401, which is honest -- a
# plaintext is never recoverable once written.
#
# Nothing reaches stdout. The credential goes straight to a file at 0600 through
# --output-file, and only the path is logged (to stderr, by the binary), so
# `docker compose logs` never contains a secret.
set -eu

: "${KAITEN_PLATFORM_TOKEN_FILE:?is required: where to write the platform credential}"

# The name every run reuses, because --replace revokes by name: a run that chose a
# new name would leave the previous credential live and mint a second beside it.
# "local" is also what an operator sees in `platform-token list` on a development
# machine, and what the runbook tells them to revoke.
PLATFORM_TOKEN_NAME="${PLATFORM_TOKEN_NAME:-local}"

# The operations that moved onto the Platform API, plus introspection and minting.
# Spelled out rather than defaulted inside the binary: a credential whose blast
# radius was chosen by a tool is a credential nobody decided the blast radius of.
# `--scopes <Tab>` completes from the same closed set the API validates against.
PLATFORM_SCOPES="${PLATFORM_SCOPES:-read:organizations,delete:organizations,delete:memberships,delete:users,read:tokens,write:tokens}"

# Non-expiring: a development credential that died mid-session would look like a bug
# in whatever was using it. It is bounded by `platform-token revoke` and by the next
# run of this script.
kaiten-admin-tools platform-token create \
  --name "${PLATFORM_TOKEN_NAME}" \
  --scopes "${PLATFORM_SCOPES}" \
  --no-expiry \
  --replace \
  --output-file "${KAITEN_PLATFORM_TOKEN_FILE}"
