-- +goose Up
-- +goose StatementBegin
-- instance_effective_entitlement, version 1: what each instance is entitled to,
-- one row per entitlement it is granted.
--
-- Every reader of an instance's entitlement value -- the usage report gate,
-- the usage reads (REST and GraphQL), entitlement group usage and the feature
-- flag targeting facts -- reads this view instead of joining
-- license_entitlement itself. In this version an instance is entitled to
-- exactly what its licence grants: value and limit_cap_exceeded_overage_percent
-- are the licence entitlement's own columns, passed through untouched, so
-- every reader returns byte for byte what it returned before. Later layers
-- (add-ons, temporary boosts) replace the view in place with CREATE OR REPLACE
-- VIEW and these same columns, in this order and with these types: the
-- contract readers code against, so that adding a layer changes no reader.
--
-- Columns:
--   organization_id, instance_id, license_id    the instance and its licence version
--   entitlement_id, entitlement_slug, entitlement_type
--   value                                 the effective {type, value}, shaped like license_entitlement.value
--   limit_cap_exceeded_overage_percent    the effective overage policy; NULL unless number-typed, -1 when unlimited
--   license_entitlement_id, license_value, license_overage_percent
--                                         the licence's own grant
--   addon_grant_count, boost_grant_count  how many grants of each later layer contributed (0 here)
--   provenance                            each layer's contribution, for explaining a value:
--     {"license": {...} | null, "addons": [...], "boosts": [...], "number": {...} | null}
--
-- A layer that depends on time (a boost's validity window) is evaluated at the
-- transaction-local setting kaiten.entitlement_effective_at when it is set --
-- the usage report sets it to the instant the report is dated by -- and at the
-- database clock otherwise. Nothing reads it in this version.
CREATE VIEW "instance_effective_entitlement" AS
SELECT
  i."organization_id",
  i."id"                                  AS "instance_id",
  i."license_id",
  e."id"                                  AS "entitlement_id",
  e."slug"                                AS "entitlement_slug",
  e."type"                                AS "entitlement_type",
  le."value"                              AS "value",
  le."limit_cap_exceeded_overage_percent" AS "limit_cap_exceeded_overage_percent",
  le."id"                                 AS "license_entitlement_id",
  le."value"                              AS "license_value",
  le."limit_cap_exceeded_overage_percent" AS "license_overage_percent",
  0::bigint                               AS "addon_grant_count",
  0::bigint                               AS "boost_grant_count",
  jsonb_build_object(
    'license', jsonb_build_object(
      'license_entitlement_id', le."id",
      'value', le."value",
      'limit_cap_exceeded_overage_percent', le."limit_cap_exceeded_overage_percent"),
    'addons', '[]'::jsonb,
    'boosts', '[]'::jsonb,
    'number', NULL::jsonb)                AS "provenance"
FROM "instance" i
JOIN "license_entitlement" le
  ON le."license_id" = i."license_id"
 AND le."organization_id" = i."organization_id"
JOIN "entitlement" e
  ON e."id" = le."entitlement_id"
 AND e."organization_id" = i."organization_id";
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP VIEW IF EXISTS "instance_effective_entitlement";
-- +goose StatementEnd
