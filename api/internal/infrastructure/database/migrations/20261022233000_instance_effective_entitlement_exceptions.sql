-- +goose Up
-- +goose StatementBegin
-- instance_effective_entitlement, version 3.3 (V32-03, M23):
--
-- * BOOLEAN and CONFIG SET boosts (voucher_entitlement_grant.value, a raw
--   JSON boolean or object) replace the value after the add-ons, the latest
--   redeemed_at winning, and count as boost grants; provenance.boosts[].value
--   carries the value in the {type, value} shape, null for NUMBER modifiers.
-- * The instance's exception in its window (instance_entitlement_exception,
--   not revoked, starts_at <= t < ends_at) is the last layer (INV-38): SET
--   replaces the value of every type, unlimited included; ADD adds to a number,
--   an unlimited one staying unlimited; UNLIMITED makes it -1. It never changes
--   the percent, whose rules 2 and 3 skip a -1 (§7.3 rule 5).
-- * An exception on an entitlement nothing else grants makes the row, which
--   starts from 0, or false (§7.2); the 15th column source says which layer
--   makes the row exist: license, else addon, else exception (§7.5).
-- * provenance gains exception and number.after_boosts.
--
-- One evaluation instant per row: the usage report's (kaiten.entitlement_
-- effective_at) when set, else the clock, read once by every window. The view
-- still reads no billing table (INV-24).
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
  r."provenance"::jsonb                   AS "provenance",
  (CASE
     WHEN le."id" IS NOT NULL THEN 'license'
     WHEN att."attached" THEN 'addon'
     ELSE 'exception'
   END)::text                             AS "source"
FROM "instance" i
CROSS JOIN LATERAL (
  SELECT COALESCE(
    NULLIF(current_setting('kaiten.entitlement_effective_at', true), '')::timestamp(3),
    date_trunc('milliseconds', clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3)) AS "at"
) clock
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
  UNION
  SELECT x0."entitlement_id"
  FROM "instance_entitlement_exception" x0
  WHERE x0."instance_id" = i."id"
    AND x0."organization_id" = i."organization_id"
    AND x0."revoked_at" IS NULL
    AND x0."starts_at" <= clock."at"
    AND (x0."ends_at" IS NULL OR clock."at" < x0."ends_at")
) g
JOIN "entitlement" e
  ON e."id" = g."entitlement_id"
 AND e."organization_id" = i."organization_id"
LEFT JOIN "license_entitlement" le
  ON le."license_id" = i."license_id"
 AND le."entitlement_id" = e."id"
 AND le."organization_id" = i."organization_id"
CROSS JOIN LATERAL (
  SELECT EXISTS (
    SELECT 1
    FROM "instance_addon" ia1
    JOIN "addon_entitlement" ae1
      ON ae1."addon_id" = ia1."addon_id"
     AND ae1."organization_id" = ia1."organization_id"
    WHERE ia1."instance_id" = i."id"
      AND ia1."organization_id" = i."organization_id"
      AND ia1."removed_at" IS NULL
      AND ae1."entitlement_id" = e."id") AS "attached"
) att
CROSS JOIN LATERAL (
  SELECT
    count(*) AS "grant_count",
    bool_or(ae."value"->>'type' = 'number' AND (ae."value"->>'value')::numeric = -1) AS "any_unlimited",
    max((ae."value"->>'value')::numeric * ia."quantity")
      FILTER (WHERE ae."value"->>'type' = 'number' AND ae."override_behavior" = 'OVERRIDE') AS "override_number",
    max((ae."value"->>'value')::numeric * ia."quantity")
      FILTER (WHERE ae."value"->>'type' = 'number' AND ae."override_behavior" = 'MAX') AS "max_number",
    sum((ae."value"->>'value')::numeric * ia."quantity")
      FILTER (WHERE ae."value"->>'type' = 'number' AND ae."override_behavior" = 'ADD') AS "add_number",
    bool_or((ae."value"->>'value')::boolean) FILTER (WHERE ae."value"->>'type' = 'boolean') AS "any_true",
    (array_agg(ae."value" ORDER BY ia."created_at" DESC, ia."id" DESC)
      FILTER (WHERE ae."value"->>'type' = 'object'))[1] AS "latest_config",
    -- §7.3 rules 2 and 5: the latest attached grant that sets a finite percent.
    (array_agg(ae."limit_cap_exceeded_overage_percent" ORDER BY ia."created_at" DESC, ia."id" DESC)
      FILTER (WHERE ae."limit_cap_exceeded_overage_percent" IS NOT NULL
                AND ae."limit_cap_exceeded_overage_percent" <> -1))[1] AS "latest_overage_percent",
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
    -- §7.2 step 0: a grant of value 0 takes part in nothing, percent included.
    -- CASE, not AND: SQL does not promise to skip the cast of a boolean or an
    -- object value.
    AND NOT COALESCE(CASE WHEN ae."value"->>'type' = 'number'
                          THEN (ae."value"->>'value')::numeric = 0 END, FALSE)
) a
CROSS JOIN LATERAL (
  SELECT
    count(*) AS "grant_count",
    bool_or(veg."modifier_type" = 'UNLIMITED') AS "any_unlimited",
    (array_agg(veg."modifier_value" ORDER BY iv."redeemed_at" DESC, iv."id" DESC)
      FILTER (WHERE veg."modifier_type" = 'SET' AND veg."value" IS NULL))[1] AS "set_value",
    -- A BOOLEAN or CONFIG SET boost: its raw value, the latest redeemed.
    (array_agg(veg."value" ORDER BY iv."redeemed_at" DESC, iv."id" DESC)
      FILTER (WHERE veg."modifier_type" = 'SET' AND veg."value" IS NOT NULL))[1] AS "set_json",
    sum(veg."modifier_value") FILTER (WHERE veg."modifier_type" = 'ADD') AS "add_value",
    CASE WHEN bool_or(veg."modifier_type" = 'MULTIPLY')
         THEN numeric_product(veg."modifier_value") FILTER (WHERE veg."modifier_type" = 'MULTIPLY')
    END AS "multiply_factor",
    jsonb_agg(jsonb_build_object(
      'instance_voucher_id', iv."id",
      'voucher_id', iv."voucher_id",
      'voucher_entitlement_grant_id', veg."id",
      'modifier_type', veg."modifier_type",
      'modifier_value', veg."modifier_value",
      'value', CASE WHEN veg."value" IS NULL THEN NULL
                    ELSE jsonb_build_object('type', CASE WHEN jsonb_typeof(veg."value") = 'boolean' THEN 'boolean' ELSE 'object' END,
                                            'value', veg."value") END,
      'redeemed_at', iv."redeemed_at",
      'effective_starts_at', iv."effective_starts_at",
      'effective_expires_at', iv."effective_expires_at") ORDER BY iv."redeemed_at", iv."id") AS "detail"
  FROM "instance_voucher" iv
  JOIN "voucher_entitlement_grant" veg
    ON veg."voucher_id" = iv."voucher_id"
   AND veg."organization_id" = iv."organization_id"
  WHERE iv."instance_id" = i."id"
    AND iv."organization_id" = i."organization_id"
    AND iv."status" = 'ACTIVE'
    AND veg."entitlement_id" = e."id"
    -- Numbers take every modifier; BOOLEAN and CONFIG a SET with a value.
    AND (e."type" IN ('NUMBER', 'NUMBER_AI_CREDIT')
         OR (veg."modifier_type" = 'SET' AND veg."value" IS NOT NULL))
    AND iv."effective_starts_at" <= clock."at"
    AND (iv."effective_expires_at" IS NULL OR clock."at" < iv."effective_expires_at")
) b
LEFT JOIN LATERAL (
  -- At most one active exception per pair (INV-37,
  -- instance_entitlement_exception_window_excl).
  SELECT x1."id", x1."kind", x1."value", x1."starts_at", x1."ends_at"
  FROM "instance_entitlement_exception" x1
  WHERE x1."instance_id" = i."id"
    AND x1."organization_id" = i."organization_id"
    AND x1."entitlement_id" = e."id"
    AND x1."revoked_at" IS NULL
    AND x1."starts_at" <= clock."at"
    AND (x1."ends_at" IS NULL OR clock."at" < x1."ends_at")
  ORDER BY x1."starts_at" DESC, x1."id" DESC
  LIMIT 1
) x ON TRUE
CROSS JOIN LATERAL (
  SELECT CASE WHEN le."value"->>'type' = 'number' THEN (le."value"->>'value')::numeric END AS "license_number",
         -- The exception's value in the {type, value} shape; null for UNLIMITED.
         CASE WHEN x."value" IS NULL THEN NULL
              ELSE jsonb_build_object('type', CASE jsonb_typeof(x."value") WHEN 'number' THEN 'number'
                                                                        WHEN 'boolean' THEN 'boolean'
                                                                        ELSE 'object' END,
                                      'value', x."value") END AS "exception_value"
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
         END AS "after_boosts"
) n2
CROSS JOIN LATERAL (
  SELECT CASE
           WHEN x."kind" = 'UNLIMITED' THEN -1::numeric
           WHEN x."kind" = 'SET' AND e."type" IN ('NUMBER', 'NUMBER_AI_CREDIT') THEN (x."value" #>> '{}')::numeric
           WHEN x."kind" = 'ADD' AND n2."after_boosts" = -1 THEN -1::numeric
           WHEN x."kind" = 'ADD' THEN n2."after_boosts" + (x."value" #>> '{}')::numeric
           ELSE n2."after_boosts"
         END AS "effective"
) n3
CROSS JOIN LATERAL (
  SELECT
    CASE
      WHEN a."grant_count" = 0 AND b."grant_count" = 0 AND x."id" IS NULL AND le."id" IS NOT NULL THEN le."value"
      WHEN e."type" IN ('NUMBER', 'NUMBER_AI_CREDIT') THEN
        jsonb_build_object('type', 'number', 'value', n3."effective")
      WHEN e."type" = 'BOOLEAN' THEN
        jsonb_build_object('type', 'boolean', 'value', COALESCE(
          CASE WHEN x."kind" = 'SET' AND jsonb_typeof(x."value") = 'boolean' THEN (x."value")::boolean END,
          CASE WHEN jsonb_typeof(b."set_json") = 'boolean' THEN (b."set_json")::boolean END,
          COALESCE(CASE WHEN le."value"->>'type' = 'boolean' THEN (le."value"->>'value')::boolean END, FALSE)
            OR COALESCE(a."any_true", FALSE)))
      ELSE COALESCE(
        CASE WHEN x."kind" = 'SET' AND jsonb_typeof(x."value") = 'object' THEN jsonb_build_object('type', 'object', 'value', x."value") END,
        CASE WHEN jsonb_typeof(b."set_json") = 'object' THEN jsonb_build_object('type', 'object', 'value', b."set_json") END,
        a."latest_config", le."value")
    END AS "value",
    CASE
      WHEN a."grant_count" = 0 AND b."grant_count" = 0 AND x."id" IS NULL AND le."id" IS NOT NULL THEN le."limit_cap_exceeded_overage_percent"
      WHEN e."type" IN ('NUMBER', 'NUMBER_AI_CREDIT') THEN
        CASE
          WHEN n3."effective" = -1 THEN -1
          ELSE COALESCE(a."latest_overage_percent",
                        CASE WHEN le."limit_cap_exceeded_overage_percent" <> -1 THEN le."limit_cap_exceeded_overage_percent" END,
                        0)
        END::smallint
    END AS "limit_cap_exceeded_overage_percent",
    jsonb_build_object(
      'license', CASE WHEN le."id" IS NULL THEN NULL ELSE jsonb_build_object(
        'license_entitlement_id', le."id",
        'value', le."value",
        'limit_cap_exceeded_overage_percent', le."limit_cap_exceeded_overage_percent") END,
      'addons', COALESCE(a."detail", '[]'::jsonb),
      'boosts', COALESCE(b."detail", '[]'::jsonb),
      'exception', CASE WHEN x."id" IS NULL THEN NULL ELSE jsonb_build_object(
        'instance_entitlement_exception_id', x."id",
        'kind', x."kind",
        'value', l."exception_value",
        'starts_at', x."starts_at",
        'ends_at', x."ends_at") END,
      'number', CASE WHEN e."type" IN ('NUMBER', 'NUMBER_AI_CREDIT')
                      AND (a."grant_count" > 0 OR b."grant_count" > 0 OR le."id" IS NULL OR x."id" IS NOT NULL) THEN jsonb_build_object(
        'license', l."license_number",
        'after_addons', n1."after_addons",
        'boost_set', b."set_value",
        'boost_add', b."add_value",
        'boost_multiply', b."multiply_factor",
        'unlimited', n1."unlimited",
        'after_boosts', n2."after_boosts",
        'effective', n3."effective") END) AS "provenance"
) r;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- Back to version 3.2 (20261022170000), verbatim. CREATE OR REPLACE VIEW
-- cannot drop the source column, so the view is dropped and created again, in
-- the migration's one transaction.
DROP VIEW "instance_effective_entitlement";
CREATE VIEW "instance_effective_entitlement" AS
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
    max((ae."value"->>'value')::numeric * ia."quantity")
      FILTER (WHERE ae."value"->>'type' = 'number' AND ae."override_behavior" = 'OVERRIDE') AS "override_number",
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
    -- §7.2 step 0: a grant of value 0 takes part in nothing, percent included.
    -- CASE, not AND: SQL does not promise to skip the cast of a boolean or an
    -- object value.
    AND NOT COALESCE(CASE WHEN ae."value"->>'type' = 'number'
                          THEN (ae."value"->>'value')::numeric = 0 END, FALSE)
) a
CROSS JOIN LATERAL (
  SELECT
    count(*) AS "grant_count",
    bool_or(veg."modifier_type" = 'UNLIMITED') AS "any_unlimited",
    (array_agg(veg."modifier_value" ORDER BY iv."redeemed_at" DESC, iv."id" DESC)
      FILTER (WHERE veg."modifier_type" = 'SET'))[1] AS "set_value",
    sum(veg."modifier_value") FILTER (WHERE veg."modifier_type" = 'ADD') AS "add_value",
    CASE WHEN bool_or(veg."modifier_type" = 'MULTIPLY')
         THEN numeric_product(veg."modifier_value") FILTER (WHERE veg."modifier_type" = 'MULTIPLY')
    END AS "multiply_factor",
    jsonb_agg(jsonb_build_object(
      'instance_voucher_id', iv."id",
      'voucher_id', iv."voucher_id",
      'voucher_entitlement_grant_id', veg."id",
      'modifier_type', veg."modifier_type",
      'modifier_value', veg."modifier_value",
      'redeemed_at', iv."redeemed_at",
      'effective_starts_at', iv."effective_starts_at",
      'effective_expires_at', iv."effective_expires_at") ORDER BY iv."redeemed_at", iv."id") AS "detail"
  FROM "instance_voucher" iv
  JOIN "voucher_entitlement_grant" veg
    ON veg."voucher_id" = iv."voucher_id"
   AND veg."organization_id" = iv."organization_id"
  CROSS JOIN LATERAL (
    SELECT COALESCE(
      NULLIF(current_setting('kaiten.entitlement_effective_at', true), '')::timestamp(3),
      date_trunc('milliseconds', clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3)) AS "at"
  ) clock
  WHERE iv."instance_id" = i."id"
    AND iv."organization_id" = i."organization_id"
    AND iv."status" = 'ACTIVE'
    AND veg."entitlement_id" = e."id"
    AND e."type" IN ('NUMBER', 'NUMBER_AI_CREDIT')
    AND iv."effective_starts_at" <= clock."at"
    AND (iv."effective_expires_at" IS NULL OR clock."at" < iv."effective_expires_at")
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
      WHEN a."grant_count" = 0 AND b."grant_count" = 0 AND le."id" IS NOT NULL THEN le."value"
      WHEN e."type" IN ('NUMBER', 'NUMBER_AI_CREDIT') THEN
        jsonb_build_object('type', 'number', 'value', n2."effective")
      WHEN e."type" = 'BOOLEAN' THEN
        jsonb_build_object('type', 'boolean', 'value',
          COALESCE(CASE WHEN le."value"->>'type' = 'boolean' THEN (le."value"->>'value')::boolean END, FALSE)
            OR COALESCE(a."any_true", FALSE))
      ELSE COALESCE(a."latest_config", le."value")
    END AS "value",
    CASE
      WHEN a."grant_count" = 0 AND b."grant_count" = 0 AND le."id" IS NOT NULL THEN le."limit_cap_exceeded_overage_percent"
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
                      AND (a."grant_count" > 0 OR b."grant_count" > 0 OR le."id" IS NULL) THEN jsonb_build_object(
        'license', l."license_number",
        'after_addons', n1."after_addons",
        'boost_set', b."set_value",
        'boost_add', b."add_value",
        'boost_multiply', b."multiply_factor",
        'unlimited', n1."unlimited",
        'effective', n2."effective") END) AS "provenance"
) r;
-- +goose StatementEnd
