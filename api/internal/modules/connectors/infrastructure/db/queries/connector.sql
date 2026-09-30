-- name: UpsertConnector :one
-- Registration is an upsert on the name, which is what makes it idempotent: a
-- deployment that restarts, or a connector that re-registers after a version bump,
-- converges on one row rather than accumulating them.
INSERT INTO connector (name, version, settings_schema, entitlement_slug)
VALUES (sqlc.arg(name), sqlc.arg(version), sqlc.arg(settings_schema)::jsonb, sqlc.narg(entitlement_slug))
ON CONFLICT (name)
DO UPDATE SET version          = EXCLUDED.version,
              settings_schema  = EXCLUDED.settings_schema,
              entitlement_slug = EXCLUDED.entitlement_slug,
              updated_at       = CURRENT_TIMESTAMP
RETURNING name, version, settings_schema, created_at, updated_at, entitlement_slug;


-- name: GetConnectorByName :one
SELECT name, version, settings_schema, created_at, updated_at, entitlement_slug
FROM connector
WHERE name = sqlc.arg(name);


-- name: ListConnectors :many
SELECT name, version, settings_schema, created_at, updated_at, entitlement_slug
FROM connector
ORDER BY name;
