-- +goose Up
-- +goose StatementBegin
-- instance_effective_entitlement, version 2: the add-on layer.
-- Same columns, order and types as version 1.
--
-- Rows: every entitlement the instance's licence grants, plus every entitlement
-- granted only by an active add-on (the usage gate now accepts those; today it
-- answers 404). A row with no add-on grant and no boost keeps the identity
-- branch: value and overage percent are the licence's own JSON and SMALLINT,
-- untouched.
--
-- NUMBER / NUMBER_AI_CREDIT (each add-on grant contributes value x quantity):
--   base   = latest attached OVERRIDE grant, else the licence value, else 0
--   base   = GREATEST(base, every MAX grant)
--   result = base + sum of ADD grants
--   -1 (unlimited) anywhere -- licence or any add-on grant -- makes the result -1.
-- Overage percent: -1 when the result is unlimited; else the percent of
-- the latest attached add-on grant that sets one; else the licence grant's;
-- else 0 (granted by add-ons only).
-- BOOLEAN: licence OR any add-on grant.
-- CONFIG: the latest attached add-on grant's object, else the licence's.
-- "Latest attached" = instance_addon.created_at DESC, id DESC.
--
-- provenance.number = {license, after_addons, boost_set, boost_add,
-- boost_multiply, effective, unlimited}, the figures behind "10,000 base +
-- 100,000 add-ons x 2 voucher".
CREATE OR REPLACE VIEW "instance_effective_entitlement" AS
SELECT
  i."organization_id",
  i."id"                                  AS "instance_id",
  i."license_id",
  e."id"                                  AS "entitlement_id",
  e."slug"                                AS "entitlement_slug",
  e."type"                                AS "entitlement_type",
  r."value"::jsonb                        AS "value",
  r."limit_cap_exceeded_overage_percent"::smallint AS "limit_cap_exceeded_overage_percent",
  le."id"                                 AS "license_entitlement_id",
  le."value"                              AS "license_value",
  le."limit_cap_exceeded_overage_percent" AS "license_overage_percent",
  a."grant_count"                         AS "addon_grant_count",
  b."grant_count"                         AS "boost_grant_count",
  r."provenance"::jsonb                   AS "provenance"
FROM "instance" i
CROSS JOIN LATERAL (
  SELECT le0."entitlement_id"
  FROM "license_entitlement" le0
  WHERE le0."license_id" = i."license_id"
    AND le0."organization_id" = i."organization_id"
  UNION
  SELECT ae0."entitlement_id"
  FROM "instance_addon" ia0
  JOIN "addon_entitlement" ae0
    ON ae0."addon_id" = ia0."addon_id"
   AND ae0."organization_id" = ia0."organization_id"
  WHERE ia0."instance_id" = i."id"
    AND ia0."organization_id" = i."organization_id"
    AND ia0."removed_at" IS NULL
) g
JOIN "entitlement" e
  ON e."id" = g."entitlement_id"
 AND e."organization_id" = i."organization_id"
LEFT JOIN "license_entitlement" le
  ON le."license_id" = i."license_id"
 AND le."entitlement_id" = e."id"
 AND le."organization_id" = i."organization_id"
CROSS JOIN LATERAL (
  SELECT
    count(*) AS "grant_count",
    bool_or(ae."value"->>'type' = 'number' AND (ae."value"->>'value')::numeric = -1) AS "any_unlimited",
    (array_agg((ae."value"->>'value')::numeric * ia."quantity" ORDER BY ia."created_at" DESC, ia."id" DESC)
      FILTER (WHERE ae."value"->>'type' = 'number' AND ae."override_behavior" = 'OVERRIDE'))[1] AS "override_number",
    max((ae."value"->>'value')::numeric * ia."quantity")
      FILTER (WHERE ae."value"->>'type' = 'number' AND ae."override_behavior" = 'MAX') AS "max_number",
    sum((ae."value"->>'value')::numeric * ia."quantity")
      FILTER (WHERE ae."value"->>'type' = 'number' AND ae."override_behavior" = 'ADD') AS "add_number",
    bool_or((ae."value"->>'value')::boolean) FILTER (WHERE ae."value"->>'type' = 'boolean') AS "any_true",
    (array_agg(ae."value" ORDER BY ia."created_at" DESC, ia."id" DESC)
      FILTER (WHERE ae."value"->>'type' = 'object'))[1] AS "latest_config",
    (array_agg(ae."limit_cap_exceeded_overage_percent" ORDER BY ia."created_at" DESC, ia."id" DESC)
      FILTER (WHERE ae."limit_cap_exceeded_overage_percent" IS NOT NULL))[1] AS "latest_overage_percent",
    jsonb_agg(jsonb_build_object(
      'instance_addon_id', ia."id",
      'addon_id', ia."addon_id",
      'addon_entitlement_id', ae."id",
      'quantity', ia."quantity",
      'override_behavior', ae."override_behavior",
      'value', ae."value",
      'limit_cap_exceeded_overage_percent', ae."limit_cap_exceeded_overage_percent",
      'attached_at', ia."created_at") ORDER BY ia."created_at", ia."id") AS "detail"
  FROM "instance_addon" ia
  JOIN "addon_entitlement" ae
    ON ae."addon_id" = ia."addon_id"
   AND ae."organization_id" = ia."organization_id"
  WHERE ia."instance_id" = i."id"
    AND ia."organization_id" = i."organization_id"
    AND ia."removed_at" IS NULL
    AND ae."entitlement_id" = e."id"
) a
CROSS JOIN LATERAL (
  SELECT
    0::bigint     AS "grant_count",
    NULL::boolean AS "any_unlimited",
    NULL::numeric AS "set_value",
    NULL::numeric AS "add_value",
    NULL::numeric AS "multiply_factor",
    NULL::jsonb   AS "detail"
) b
CROSS JOIN LATERAL (
  SELECT CASE WHEN le."value"->>'type' = 'number' THEN (le."value"->>'value')::numeric END AS "license_number"
) l
CROSS JOIN LATERAL (
  SELECT
    (l."license_number" = -1 OR a."any_unlimited" OR b."any_unlimited") IS TRUE AS "unlimited",
    GREATEST(COALESCE(a."override_number", l."license_number", 0), a."max_number")
      + COALESCE(a."add_number", 0) AS "after_addons"
) n1
CROSS JOIN LATERAL (
  SELECT CASE
           WHEN n1."unlimited" THEN -1::numeric
           ELSE (COALESCE(b."set_value", n1."after_addons") + COALESCE(b."add_value", 0))
                  * COALESCE(b."multiply_factor", 1)
         END AS "effective"
) n2
CROSS JOIN LATERAL (
  SELECT
    CASE
      WHEN a."grant_count" = 0 AND b."grant_count" = 0 THEN le."value"
      WHEN e."type" IN ('NUMBER', 'NUMBER_AI_CREDIT') THEN
        jsonb_build_object('type', 'number', 'value', n2."effective")
      WHEN e."type" = 'BOOLEAN' THEN
        jsonb_build_object('type', 'boolean', 'value',
          COALESCE(CASE WHEN le."value"->>'type' = 'boolean' THEN (le."value"->>'value')::boolean END, FALSE)
            OR COALESCE(a."any_true", FALSE))
      ELSE COALESCE(a."latest_config", le."value")
    END AS "value",
    CASE
      WHEN a."grant_count" = 0 AND b."grant_count" = 0 THEN le."limit_cap_exceeded_overage_percent"
      WHEN e."type" IN ('NUMBER', 'NUMBER_AI_CREDIT') THEN
        CASE
          WHEN n1."unlimited" THEN -1
          ELSE COALESCE(a."latest_overage_percent", le."limit_cap_exceeded_overage_percent", 0)
        END::smallint
    END AS "limit_cap_exceeded_overage_percent",
    jsonb_build_object(
      'license', CASE WHEN le."id" IS NULL THEN NULL ELSE jsonb_build_object(
        'license_entitlement_id', le."id",
        'value', le."value",
        'limit_cap_exceeded_overage_percent', le."limit_cap_exceeded_overage_percent") END,
      'addons', COALESCE(a."detail", '[]'::jsonb),
      'boosts', COALESCE(b."detail", '[]'::jsonb),
      'number', CASE WHEN e."type" IN ('NUMBER', 'NUMBER_AI_CREDIT')
                      AND (a."grant_count" > 0 OR b."grant_count" > 0) THEN jsonb_build_object(
        'license', l."license_number",
        'after_addons', n1."after_addons",
        'boost_set', b."set_value",
        'boost_add', b."add_value",
        'boost_multiply', b."multiply_factor",
        'unlimited', n1."unlimited",
        'effective', n2."effective") END) AS "provenance"
) r;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- Back to version 1 (20261005180000), verbatim.
CREATE OR REPLACE VIEW "instance_effective_entitlement" AS
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
