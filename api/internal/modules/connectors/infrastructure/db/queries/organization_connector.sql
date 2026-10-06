-- name: ActivateConnectorForOrganization :one
-- Records that an organization has turned a connector on.
--
-- An upsert rather than an insert, and it deliberately does NOT move activated_at on
-- conflict: activating something already active is the same request with a different
-- outcome, and "when did this organization first turn Attio on" is a fact worth not
-- overwriting every time the settings form is saved.
INSERT INTO organization_connector (organization_id, connector_name)
VALUES (sqlc.arg(organization_id), sqlc.arg(connector_name))
ON CONFLICT (organization_id, connector_name)
DO UPDATE SET updated_at = now()
-- inserted tells a first activation from a repeat: xmax is 0 on the row an
-- INSERT wrote, and the updating transaction's id on one ON CONFLICT updated.
RETURNING organization_id, connector_name, activated_at, created_at, updated_at, (xmax = 0)::bool AS inserted;


-- name: DeactivateConnectorForOrganization :execrows
-- Deactivation deletes the row. There is no deactivated_at, because the row's whole
-- job is to answer "is it on"; when it was turned off is a question the CDC outbox
-- answers, and a tombstone here would be a second, quietly divergent record of it.
DELETE FROM organization_connector
WHERE organization_id = sqlc.arg(organization_id)
  AND connector_name = sqlc.arg(connector_name);


-- name: GetConnectorActivation :one
SELECT organization_id, connector_name, activated_at, created_at, updated_at
FROM organization_connector
WHERE organization_id = sqlc.arg(organization_id)
  AND connector_name = sqlc.arg(connector_name);


-- name: ListConnectorActivations :many
SELECT organization_id, connector_name, activated_at, created_at, updated_at
FROM organization_connector
WHERE organization_id = sqlc.arg(organization_id)
ORDER BY connector_name;
