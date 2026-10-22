#!/bin/sh
# Shared local/CI default-value render gates. No cluster or secret lookup.
set -eu
cd "$(dirname "$0")/.."
render=$(mktemp)
trap 'rm -f "$render"' EXIT HUP INT TERM
helm lint charts/kaiten
helm lint charts/kaiten -f charts/kaiten/examples/minimal-values.yaml
helm lint charts/kaiten-infra \
  --set migrate.database.existingSecret=example-db \
  --set debeziumServer.database.existingSecret=example-db
helm template kaiten charts/kaiten > "$render"
helm template kaiten charts/kaiten \
  -f charts/kaiten/examples/minimal-values.yaml >> "$render"
helm template kaiten-infra charts/kaiten-infra \
  --set migrate.database.existingSecret=example-db \
  --set debeziumServer.database.existingSecret=example-db >> "$render"
if grep -Eq '^apiVersion: (external-secrets\.io|generators\.external-secrets\.io|redhatcop\.redhat\.io|secrets\.hashicorp\.com)/|^kind: (ExternalSecret|ClusterExternalSecret|PushSecret|ClusterPushSecret|SecretStore|ClusterSecretStore|Policy|KubernetesAuthEngineRole|SecretEngineMount|VaultSecret|VaultStaticSecret|VaultDynamicSecret|VaultAuth|VaultConnection)$' "$render"; then
  echo 'Secret plumbing rendered; belongs to the deployment operator' >&2
  exit 1
fi
