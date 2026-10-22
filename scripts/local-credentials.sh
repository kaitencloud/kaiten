#!/bin/sh
# Local policy only: reuse the existing identity validator/issuer. Repeated starts
# preserve a working credential; ambiguous validation failures never rotate it.
# Recovery after DB replacement is explicit: task credentials:rotate.
set -eu
: "${KAITEN_PLATFORM_TOKEN_FILE:?is required: local credential destination}"
PLATFORM_TOKEN_NAME="${PLATFORM_TOKEN_NAME:-local}"
PLATFORM_SCOPES="${PLATFORM_SCOPES:-read:organizations,delete:organizations,delete:memberships,delete:users,read:tokens,write:tokens}"
case "${1:-ensure}" in
  ensure)
    exec kaiten-admin-tools platform-token ensure-local \
      --name "$PLATFORM_TOKEN_NAME" --scopes "$PLATFORM_SCOPES" \
      --output-file "$KAITEN_PLATFORM_TOKEN_FILE"
    ;;
  rotate)
    # Explicit cascade revocation/recovery, never the normal dev path.
    exec kaiten-admin-tools platform-token create \
      --name "$PLATFORM_TOKEN_NAME" --scopes "$PLATFORM_SCOPES" \
      --no-expiry --replace --output-file "$KAITEN_PLATFORM_TOKEN_FILE"
    ;;
  *) echo "Usage: local-credentials.sh [ensure|rotate]" >&2; exit 2 ;;
esac
