-- name: GetFeatureFlags :many
-- Unbounded on purpose: also used by the OpenFeature bulk-evaluation
-- endpoint and the client manifest generator, both of which need every
-- flag in the organization in one round-trip, independent of any
-- list-facing pagination.
-- GetFeatureFlagsByCursor (below) is the cursor-paginated variant for
-- the list-facing caller (REST getfeatureflags).
SELECT ff.*
FROM feature_flags ff
WHERE ff.organization_id = sqlc.arg(organization_id);


-- name: GetFeatureFlagsByCursor :many
-- Cursor (keyset) pagination ordered by id DESC. The feature_flags table
-- has no created_at/updated_at column, so id (a Postgres gen_random_uuid(),
-- not sequential) is the only available keyset column -- stable total
-- order, not a chronological one. Pass limit_plus_one = requested limit + 1
-- so the caller can detect whether a further page exists without a
-- separate COUNT query. On the first page, pass NULL for cursor_id.
SELECT ff.*
FROM feature_flags ff
WHERE ff.organization_id = sqlc.arg(organization_id)
  AND (
    sqlc.narg(cursor_id)::uuid IS NULL
    OR ff.id < sqlc.narg(cursor_id)::uuid
  )
ORDER BY ff.id DESC
LIMIT sqlc.arg(limit_plus_one);


-- name: GetFeatureFlagBySlug :one
SELECT ff.*
FROM feature_flags ff
WHERE ff.organization_id = sqlc.arg(organization_id)
  AND ff.slug = sqlc.arg(feature_flag_slug);


-- name: GetFeatureFlagsBySlugs :many
SELECT ff.*
FROM feature_flags ff
WHERE ff.organization_id = sqlc.arg(organization_id)
  AND ff.slug = ANY (sqlc.arg(feature_flag_slugs)::text[]);


-- name: GetFeatureFlagByName :one
SELECT ff.*
FROM feature_flags ff
WHERE ff.organization_id = sqlc.arg(organization_id)
  AND ff.name = sqlc.arg(feature_flag_name);


-- name: CreateFeatureFlag :one
INSERT INTO feature_flags (type,
                           variants,
                           targeting_rules,
                           name,
                           description,
                           slug,
                           metadata,
                           enabled,
                           event_name,
                           default_variant,
                           organization_id)
VALUES (sqlc.arg(type),
  sqlc.arg(variants)::jsonb,
  sqlc.arg(targeting_rules)::jsonb,
  sqlc.arg(name),
  sqlc.arg(description),
  sqlc.arg(slug),
  sqlc.arg(metadata)::jsonb,
  sqlc.arg(enabled),
  sqlc.arg(event_name),
  sqlc.arg(default_variant)::jsonb,
  sqlc.arg(organization_id))
RETURNING *;


-- name: UpdateFeatureFlag :one
UPDATE feature_flags ff
SET type            = sqlc.arg(type),
    variants        = sqlc.arg(variants)::jsonb,
    targeting_rules = sqlc.arg(targeting_rules)::jsonb,
    name            = sqlc.arg(name),
    description     = sqlc.arg(description),
    slug            = sqlc.arg(slug),
    metadata        = sqlc.arg(metadata)::jsonb,
    enabled         = sqlc.arg(enabled),
    event_name      = sqlc.arg(event_name),
    default_variant = sqlc.arg(default_variant)::jsonb
FROM user_on_organization uo
WHERE uo.organization_id = sqlc.arg(organization_id)
  AND uo.user_id = sqlc.arg(user_id)
  AND uo.deleted_at IS NULL
  AND ff.organization_id = uo.organization_id
  AND ff.slug = sqlc.arg(feature_flag_slug)
RETURNING ff.*;


-- name: DeleteFeatureFlag :one
DELETE
FROM feature_flags ff
WHERE ff.slug = sqlc.arg(feature_flag_slug)
  AND ff.organization_id = sqlc.arg(organization_id)
RETURNING ff.*;
