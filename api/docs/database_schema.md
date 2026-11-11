# Database Schema

> Auto-generated. Run `task schema-docs` to update.

```dbml
Enum "addon_increase_billing" {
  "TRUE_UP"
  "NEXT_BOUNDARY"
}

Enum "addon_override_behavior" {
  "ADD"
  "OVERRIDE"
  "MAX"
}

Enum "aggregation_method" {
  "SUM"
  "COUNT"
  "AVERAGE"
  "MAX"
  "MIN"
  "LATEST"
}

Enum "billing_model" {
  "FLAT_FEE"
  "USAGE_BASED"
  "OVERAGE"
}

Enum "billing_period" {
  "MONTHLY"
  "QUARTERLY"
  "SEMI_ANNUAL"
  "ANNUAL"
}

Enum "billing_provider_kind" {
  "NOOP"
  "STRIPE"
}

Enum "billing_sync_status" {
  "SUCCESS"
  "PARTIAL"
  "FAILED"
}

Enum "billing_timing" {
  "ADVANCE"
  "ARREARS"
}

Enum "boost_modifier_type" {
  "SET"
  "ADD"
  "MULTIPLY"
  "UNLIMITED"
}

Enum "checkout_session_status" {
  "OPEN"
  "AWAITING_PAYMENT"
  "COMPLETED"
  "ABANDONED"
  "EXPIRED"
}

Enum "collection_method" {
  "SEND_INVOICE"
  "CHARGE_AUTOMATICALLY"
}

Enum "entitlement_exception_kind" {
  "SET"
  "ADD"
  "UNLIMITED"
}

Enum "entitlement_reset_anchor" {
  "CALENDAR"
  "LICENSE_START"
  "BILLING_PERIOD"
}

Enum "entitlement_reset_period" {
  "HOUR"
  "DAY"
  "WEEK"
  "MONTH"
  "YEAR"
}

Enum "entitlement_type" {
  "BOOLEAN"
  "NUMBER"
  "CONFIG"
  "NUMBER_AI_CREDIT"
}

Enum "handoff_status" {
  "NOT_REQUIRED"
  "PENDING"
  "ACKNOWLEDGED"
}

Enum "instance_billing_status" {
  "INCOMPLETE"
  "TRIAL"
  "ACTIVE"
  "PAST_DUE"
  "CANCELED"
}

Enum "instance_status" {
  "HEALTHY"
  "DEGRADED"
  "INCIDENT"
  "MAINTENANCE"
}

Enum "instance_voucher_status" {
  "ACTIVE"
  "EXPIRED"
  "REVOKED"
}

Enum "invoice_hold_reason" {
  "LEDGER_SEQUENCE_GAP"
  "LEDGER_CHAIN_BREAK"
  "LEDGER_COUNTER_MISMATCH"
  "PROVIDER_ITEM_LIMIT"
}

Enum "invoice_kind" {
  "ACTIVATION"
  "RENEWAL"
  "FINAL"
}

Enum "invoice_status" {
  "DRAFT"
  "PUSHED"
  "PUSH_FAILED"
  "MANUAL"
  "PAID"
  "PAYMENT_FAILED"
  "UNCOLLECTIBLE"
  "VOID"
}

Enum "license_lifecycle_state" {
  "DRAFT"
  "PUBLISHED"
  "ARCHIVED"
}

Enum "license_type" {
  "DEVELOPMENT"
  "TRIAL"
  "PAID"
  "COMMUNITY"
}

Enum "metadata_field_resource_type" {
  "DEPLOYMENT_ZONE"
  "INSTANCE"
}

Enum "payment_method_status" {
  "NONE"
  "ACTIVE"
  "EXPIRED"
  "FAILED"
}

Enum "price_applies_to" {
  "LICENSE_BASE"
  "ADDONS"
  "BOTH"
  "SELECTED_PRICES"
}

Enum "price_discount_type" {
  "PERCENTAGE"
  "FIXED_AMOUNT"
}

Enum "price_status" {
  "ACTIVE"
  "DEPRECATED"
}

Enum "pricing_type" {
  "FREE"
  "PAID"
  "CUSTOM"
}

Enum "reconciliation_status" {
  "MATCHED"
  "MISMATCH"
}

Enum "token_kind" {
  "organization"
  "platform"
}

Enum "trial_end_without_payment_method" {
  "CANCEL"
  "CONVERT"
}

Enum "usage_report_behavior" {
  "append"
  "set"
}

Enum "user_type" {
  "human"
  "machine"
}

Enum "voucher_duration" {
  "ONE_TIME"
  "REPEATING"
  "FOREVER"
}

Enum "voucher_status" {
  "DRAFT"
  "ACTIVE"
  "EXPIRED"
  "EXHAUSTED"
  "ARCHIVED"
}

Enum "voucher_type" {
  "PRICE"
  "ENTITLEMENT_BOOST"
  "FLAG_GRANT"
  "COMPOSITE"
}

Table "goose_db_version" {
  "id" int4 [pk, not null, increment]
  "version_id" int8 [not null]
  "is_applied" bool [not null]
  "tstamp" timestamp [not null, default: `now()`]
}

Table "organization" {
  "id" uuid [pk, not null, default: `gen_random_uuid()`]
  "external_id" text [unique, not null]
  "name" text [not null]
}

Table "user" {
  "id" uuid [pk, not null, default: `gen_random_uuid()`]
  "external_id" text [unique, not null]
  "created_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "created_by_id" uuid
  "deleted_at" timestamp
  "email" text [unique]
  "name" text [not null]
  "slug" text [unique]
  "type" user_type [not null, default: 'human']
  "organization_id" uuid [note: 'Machine accounts only, except the system:kaiten platform identity (see user_organization_id_machine_check). Not read by any application query - membership is resolved via user_on_organization. Kept because idx_unique_machine_slug_per_org depends on it for per-organization slug uniqueness.']

  Checks {
    `(type <> 'machine'::user_type) OR (slug IS NOT NULL)` [name: 'user_slug_machine_check']
    `(type <> 'machine'::user_type) OR (organization_id IS NOT NULL) OR (external_id = 'system:kaiten'::text)` [name: 'user_organization_id_machine_check']
    `(type <> 'machine'::user_type) OR (email IS NULL) OR (external_id = 'system:kaiten'::text)` [name: 'user_email_machine_check']
  }

  Indexes {
    (slug, organization_id) [type: btree, unique, name: "idx_unique_machine_slug_per_org"]
  }
}

Table "user_on_organization" {
  "deleted_at" timestamp
  "organization_id" uuid [not null]
  "user_id" uuid [not null]

  Indexes {
    (organization_id, user_id) [pk, type: btree, name: "user_on_organization_pkey"]
  }
}

Table "customer" {
  "id" uuid [pk, not null, default: `gen_random_uuid()`]
  "name" text [not null]
  "slug" text [not null]
  "external_customer_id" text
  "created_by_id" uuid [not null]
  "created_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "updated_by_id" uuid [not null]
  "updated_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "organization_id" uuid [not null]
  "domain" text
  "billing_email" text [check: `(billing_email IS NULL) OR ((billing_email ~ '^[^@[:space:]]+@[^@[:space:]]+$'::text) AND (char_length(billing_email) <= 254))`]

  Indexes {
    (id, organization_id) [type: btree, unique, name: "customer_id_organization_id_key"]
    (organization_id, slug) [type: btree, unique, name: "customer_organization_id_slug_key"]
    (organization_id, external_customer_id) [type: btree, name: "customer_org_external_id_idx"]
    (organization_id, `lower(billing_email)`) [type: btree, name: "idx_customer_billing_email_normalized"]
  }
}

Table "license" {
  "id" uuid [pk, not null, default: `gen_random_uuid()`]
  "name" text [not null]
  "slug" text [not null]
  "description" text [not null]
  "type" license_type [not null]
  "version" int4 [not null]
  "version_name" text
  "is_default" bool [not null, default: false]
  "features" jsonb
  "organization_id" uuid [not null]
  "created_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "updated_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "family_id" uuid [unique, not null]
  "lifecycle_state" license_lifecycle_state [not null]
  "pricing_type" pricing_type [not null, default: 'CUSTOM']
  "trial_period_days" int4 [check: `(trial_period_days IS NULL) OR (trial_period_days > 0)`]
  "requires_payment_method" bool [not null, default: false]
  "self_serve_cta_url" text [check: `(self_serve_cta_url IS NULL) OR ((self_serve_cta_url ~ '^https?://[^[:space:]]+$'::text) AND (char_length(self_serve_cta_url) <= 2048))`]

  Checks {
    `(NOT is_default) OR (lifecycle_state = 'PUBLISHED'::license_lifecycle_state)` [name: 'license_default_must_be_published_check']
  }

  Indexes {
    (family_id, version) [type: btree, unique, name: "license_family_id_version_key"]
    (id, organization_id) [type: btree, unique, name: "license_id_organization_id_key"]
    (organization_id, slug) [type: btree, unique, name: "license_organization_id_slug_key"]
    (organization_id, created_at, id) [type: btree, name: "idx_license_org_created_at"]
  }
}

Table "entitlement" {
  "id" uuid [pk, not null, default: `gen_random_uuid()`]
  "name" text [not null]
  "slug" text [not null]
  "description" text
  "type" entitlement_type [not null]
  "aggregation_method" aggregation_method
  "organization_id" uuid [not null]
  "icon" varchar
  "unit_singular" text
  "unit_plural" text
  "sale_unit_singular" text
  "sale_unit_plural" text
  "sale_unit_factor" float8 [check: `(sale_unit_factor IS NULL) OR (sale_unit_factor > (0)::double precision)`]
  "user_facing" bool [not null, default: false]
  "display_order" int4 [not null, check: `display_order >= 0`, default: 0]
  "warning_threshold_percent" int2 [not null, check: `(warning_threshold_percent >= 0) AND (warning_threshold_percent <= 100)`, default: 0]
  "reset_period" entitlement_reset_period
  "reset_anchor" entitlement_reset_anchor
  "created_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "updated_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]

  Checks {
    `(type = ANY (ARRAY['NUMBER'::entitlement_type, 'NUMBER_AI_CREDIT'::entitlement_type])) OR ((unit_singular IS NULL) AND (unit_plural IS NULL) AND (sale_unit_singular IS NULL) AND (sale_unit_plural IS NULL) AND (sale_unit_factor IS NULL))` [name: 'entitlement_units_number_type_check']
    `(unit_singular IS NULL) = (unit_plural IS NULL)` [name: 'entitlement_unit_pair_check']
    `((sale_unit_singular IS NULL) AND (sale_unit_plural IS NULL) AND (sale_unit_factor IS NULL)) OR ((sale_unit_singular IS NOT NULL) AND (sale_unit_plural IS NOT NULL) AND (sale_unit_factor IS NOT NULL) AND (unit_singular IS NOT NULL) AND (unit_plural IS NOT NULL))` [name: 'entitlement_sale_unit_trio_check']
    `((type = ANY (ARRAY['NUMBER'::entitlement_type, 'NUMBER_AI_CREDIT'::entitlement_type])) AND (aggregation_method = ANY (ARRAY['COUNT'::aggregation_method, 'SUM'::aggregation_method, 'AVERAGE'::aggregation_method, 'MAX'::aggregation_method, 'MIN'::aggregation_method, 'LATEST'::aggregation_method]))) OR ((type = ANY (ARRAY['BOOLEAN'::entitlement_type, 'CONFIG'::entitlement_type])) AND (aggregation_method IS NULL))` [name: 'entitlement_number_aggregation_check']
    `((reset_period IS NULL) AND (reset_anchor IS NULL)) OR ((reset_period IS NOT NULL) AND (reset_anchor IS NOT NULL))` [name: 'entitlement_reset_anchor_required_check']
    `(reset_period IS NULL) OR (type = ANY (ARRAY['NUMBER'::entitlement_type, 'NUMBER_AI_CREDIT'::entitlement_type]))` [name: 'entitlement_reset_period_number_family_check']
    `(reset_period IS NULL) OR (aggregation_method IS DISTINCT FROM 'LATEST'::aggregation_method)` [name: 'entitlement_reset_period_latest_check']
    `(reset_anchor IS DISTINCT FROM 'BILLING_PERIOD'::entitlement_reset_anchor) OR (reset_period = ANY (ARRAY['MONTH'::entitlement_reset_period, 'YEAR'::entitlement_reset_period]))` [name: 'entitlement_reset_anchor_billing_period_check']
  }

  Indexes {
    (id, organization_id) [type: btree, unique, name: "entitlement_id_organization_id_key"]
    (organization_id, slug) [type: btree, unique, name: "entitlement_organization_id_slug_key"]
    (organization_id, created_at, id) [type: btree, name: "idx_entitlement_org_created_at"]
  }
}

Table "license_entitlement" {
  "id" uuid [pk, not null, default: `gen_random_uuid()`]
  "entitlement_id" uuid [not null]
  "license_id" uuid [not null]
  "created_by_id" uuid [not null]
  "created_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "updated_by_id" uuid [not null]
  "updated_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "value" jsonb [not null, check: `(jsonb_typeof(value) = 'object'::text) AND (value ? 'type'::text) AND (value ? 'value'::text) AND ((((value ->> 'type'::text) = 'number'::text) AND (jsonb_typeof((value -> 'value'::text)) = 'number'::text)) OR (((value ->> 'type'::text) = 'boolean'::text) AND (jsonb_typeof((value -> 'value'::text)) = 'boolean'::text)) OR (((value ->> 'type'::text) = 'object'::text) AND (jsonb_typeof((value -> 'value'::text)) = 'object'::text)))`]
  "organization_id" uuid [not null]
  "limit_cap_exceeded_overage_percent" int2

  Checks {
    `(((value ->> 'type'::text) = 'number'::text) AND (limit_cap_exceeded_overage_percent IS NOT NULL)) OR (((value ->> 'type'::text) <> 'number'::text) AND (limit_cap_exceeded_overage_percent IS NULL))` [name: 'license_entitlement_overage_percent_number_only_check']
    `(limit_cap_exceeded_overage_percent IS NULL) OR ((((value ->> 'value'::text))::numeric = ('-1'::integer)::numeric) AND (limit_cap_exceeded_overage_percent = '-1'::integer)) OR ((((value ->> 'value'::text))::numeric <> ('-1'::integer)::numeric) AND (limit_cap_exceeded_overage_percent >= 0))` [name: 'license_entitlement_overage_percent_unlimited_check']
  }

  Indexes {
    (license_id, entitlement_id) [type: btree, unique, name: "license_entitlement_license_id_entitlement_id_key"]
  }
}

Table "deployment_zone" {
  "id" uuid [pk, not null, default: `gen_random_uuid()`]
  "name" varchar [not null]
  "slug" text [not null]
  "type" varchar [not null]
  "metadata" jsonb
  "description" text [not null]
  "created_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "created_by_id" uuid [not null]
  "updated_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "updated_by_id" uuid [not null]
  "organization_id" uuid [not null]

  Indexes {
    (id, organization_id) [type: btree, unique, name: "deployment_zone_id_organization_id_key"]
    (organization_id, slug) [type: btree, unique, name: "deployment_zone_organization_id_slug_key"]
  }
}

Table "instance" {
  "id" uuid [pk, not null, default: `gen_random_uuid()`]
  "created_by_id" uuid [not null]
  "created_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "updated_by_id" uuid [not null]
  "updated_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "name" text [not null]
  "slug" text [not null]
  "description" text [not null]
  "customer_id" uuid [not null]
  "license_id" uuid [not null]
  "deployment_zone_id" uuid
  "start_license_date" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "end_license_date" timestamp [not null, default: `(now() + '1 year'::interval)`]
  "metadata" jsonb [not null, default: `{}`]
  "organization_id" uuid [not null]
  "status" instance_status [not null, default: 'HEALTHY']
  "lifecycle_stage" varchar

  Indexes {
    (id, organization_id) [type: btree, unique, name: "instance_id_organization_id_key"]
    (organization_id, slug) [type: btree, unique, name: "instance_organization_id_slug_key"]
  }
}

Table "entitlement_usage" {
  "entitlement_id" uuid [not null]
  "instance_id" uuid [not null]
  "value" jsonb [not null, check: `(jsonb_typeof(value) = 'object'::text) AND (value ? 'type'::text) AND (value ? 'value'::text) AND (value ? 'event_count'::text) AND ((value ->> 'type'::text) = 'number'::text) AND (jsonb_typeof((value -> 'value'::text)) = 'number'::text) AND (jsonb_typeof((value -> 'event_count'::text)) = 'number'::text) AND (((value ->> 'event_count'::text))::numeric >= (0)::numeric) AND (floor(((value ->> 'event_count'::text))::numeric) = ((value ->> 'event_count'::text))::numeric)`]
  "organization_id" uuid [not null]
  "period_start" timestamp
  "report_seq" int8 [not null, check: `report_seq >= 0`, default: 0]

  Indexes {
    (entitlement_id, instance_id) [pk, type: btree, name: "entitlement_usage_pkey"]
  }
}

Table "audit_trail" {
  "id" uuid [pk, not null, default: `gen_random_uuid()`]
  "organization_id" uuid [not null]
  "instance_id" uuid
  "event_name" text [not null]
  "event_type" text [not null]
  "occurred_at" timestamptz [not null, default: `now()`]
  "payload" jsonb
  "actor_id" uuid

  Indexes {
    (organization_id, occurred_at, id) [type: btree, name: "idx_audit_trail_changes"]
    (organization_id, event_name, occurred_at, id) [type: btree, name: "idx_audit_trail_feed"]
    occurred_at [type: btree, name: "idx_audit_trail_occurred_at"]
    (organization_id, instance_id) [type: btree, name: "idx_audit_trail_org_instance"]
    (organization_id, occurred_at, id) [type: btree, name: "idx_audit_trail_org_occurred_at"]
  }
}

Table "feature_flags" {
  "id" uuid [pk, not null, default: `gen_random_uuid()`]
  "type" varchar [not null]
  "variants" jsonb [not null]
  "targeting_rules" jsonb
  "name" varchar [not null]
  "description" text
  "slug" varchar [not null]
  "metadata" jsonb
  "enabled" bool [not null]
  "event_name" varchar [not null]
  "organization_id" uuid [not null]
  "default_variant" jsonb [not null]

  Indexes {
    (id, organization_id) [type: btree, unique, name: "feature_flags_id_organization_id_key"]
    (slug, organization_id) [type: btree, unique, name: "uq_feature_flags_slug"]
  }
}

Table "token" {
  "id" uuid [pk, not null, default: `gen_random_uuid()`]
  "name" text [unique, not null]
  "slug" text [unique, not null]
  "hash" text [not null]
  "lookup_hash" text [not null]
  "created_by" uuid [not null]
  "created_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "expires_at" timestamp
  "service_account_id" uuid [not null]
  "revoked_by" uuid
  "revoked_date" timestamp
  "organization_id" uuid
  "scopes" "text[]" [not null, default: '{}']
  "kind" token_kind [not null, default: 'organization']
  "issued_by_platform_token_id" uuid

  Checks {
    `((kind = 'organization'::token_kind) AND (organization_id IS NOT NULL)) OR ((kind = 'platform'::token_kind) AND (organization_id IS NULL) AND (service_account_id = '00000000-0000-0000-0000-000000000001'::uuid))` [name: 'token_platform_is_orgless_system']
    `(kind = 'organization'::token_kind) OR (issued_by_platform_token_id IS NULL)` [name: 'token_platform_has_no_parent']
  }

  Indexes {
    lookup_hash [type: btree, unique, name: "idx_token_lookup_hash_active"]
    lookup_hash [type: btree, unique, name: "idx_token_platform_lookup_hash_active"]
    (service_account_id, name, organization_id) [type: btree, unique, name: "token_name"]
    (slug, organization_id) [type: btree, unique, name: "token_slug"]
    issued_by_platform_token_id [type: btree, name: "idx_token_issued_by_platform_active"]
  }
}

Table "outbox_events" {
  "id" uuid [pk, not null, default: `gen_random_uuid()`]
  "organization_id" uuid [not null]
  "event_name" text [not null]
  "event_type" text [not null]
  "occurred_at" timestamptz [not null, default: `now()`]
  "data" jsonb [not null]
  "headers" jsonb
  "traceparent" text [not null, default: `(((('00-'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) || '-'::text) || "left"(replace((gen_random_uuid())::text, '-'::text, ''::text), 16)) || '-00'::text)`]
  "tracestate" text

  Indexes {
    (occurred_at, id) [type: btree, name: "idx_outbox_events_retention"]
  }
}

Table "release" {
  "id" uuid [pk, not null, default: `gen_random_uuid()`]
  "previous_release_id" uuid
  "version" varchar [not null]
  "slug" text [not null]
  "description" text
  "created_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "created_by_id" uuid [not null]
  "organization_id" uuid [not null]

  Indexes {
    (organization_id, slug) [type: btree, unique, name: "release_organization_id_slug_key"]
    (version, organization_id) [type: btree, unique, name: "release_version_unique"]
  }
}

Table "deployment" {
  "deployment_zone_id" uuid [not null]
  "release_id" uuid [not null]
  "created_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "created_by_id" uuid [not null]
  "organization_id" uuid [not null]
  "id" uuid [pk, not null, default: `gen_random_uuid()`]
  "seq" int8 [not null, increment]

  Indexes {
    (organization_id, release_id, created_at, seq) [type: btree, name: "idx_deployment_release_created_at_seq"]
    (organization_id, deployment_zone_id, created_at, seq) [type: btree, name: "idx_deployment_zone_created_at_seq"]
  }
}

Table "component" {
  "id" uuid [pk, not null, default: `gen_random_uuid()`]
  "previous_component_id" uuid
  "name" varchar [not null]
  "version" varchar [not null]
  "slug" text [not null]
  "description" text
  "created_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "created_by_id" uuid [not null]
  "organization_id" uuid [not null]

  Indexes {
    (organization_id, name, version) [type: btree, unique, name: "component_name_version_unique"]
    (organization_id, slug) [type: btree, unique, name: "component_organization_id_slug_key"]
  }
}

Table "component_release" {
  "component_id" uuid [not null]
  "release_id" uuid [not null]
  "organization_id" uuid [not null]

  Indexes {
    (component_id, release_id) [pk, type: btree, name: "component_on_release_pkey"]
  }
}

Table "entitlement_group" {
  "id" uuid [pk, not null, default: `gen_random_uuid()`]
  "name" text [not null]
  "slug" text [not null]
  "description" text
  "organization_id" uuid [not null]

  Indexes {
    (organization_id, slug) [type: btree, unique, name: "entitlement_group_organization_id_slug_key"]
  }
}

Table "entitlement_group_membership" {
  "entitlement_group_id" uuid [not null]
  "entitlement_id" uuid [not null]
  "organization_id" uuid [not null]

  Indexes {
    (entitlement_group_id, entitlement_id) [pk, type: btree, name: "entitlement_group_membership_pkey"]
    entitlement_id [type: btree, name: "idx_entitlement_group_membership_entitlement_id"]
  }
}

Table "customer_integrations" {
  "customer_id" uuid [not null]
  "organization_id" uuid [not null]
  "adapter" text [not null]
  "external_id" text [not null]
  "metadata" jsonb [not null, default: `{}`]
  "synced_at" timestamptz [not null, default: `CURRENT_TIMESTAMP`]
  "last_error" text
  "web_url" text

  Indexes {
    (customer_id, adapter) [pk, type: btree, name: "customer_integrations_pkey"]
    (organization_id, adapter, external_id) [type: btree, unique, name: "customer_integrations_external_unique"]
    (organization_id, adapter) [type: btree, name: "customer_integrations_org_adapter_idx"]
  }
}

Table "instance_integrations" {
  "instance_id" uuid [not null]
  "organization_id" uuid [not null]
  "adapter" text [not null]
  "external_id" text [not null]
  "metadata" jsonb [not null, default: `{}`]
  "synced_at" timestamptz [not null, default: `CURRENT_TIMESTAMP`]
  "last_error" text
  "web_url" text

  Indexes {
    (instance_id, adapter) [pk, type: btree, name: "instance_integrations_pkey"]
    (organization_id, adapter, external_id) [type: btree, unique, name: "instance_integrations_external_unique"]
    (organization_id, adapter) [type: btree, name: "instance_integrations_org_adapter_idx"]
  }
}

Table "metadata_field" {
  "id" uuid [pk, not null, default: `gen_random_uuid()`]
  "organization_id" uuid [not null]
  "resource_type" metadata_field_resource_type [not null]
  "key" text [not null]
  "label" text [not null]
  "json_schema" jsonb [not null]
  "display_order" int4 [not null, default: 0]
  "archived_at" timestamp
  "created_at" timestamp [not null, default: `now()`]
  "created_by_id" uuid [not null]
  "updated_at" timestamp [not null, default: `now()`]
  "updated_by_id" uuid [not null]

  Indexes {
    (organization_id, resource_type, key) [type: btree, unique, name: "uq_metadata_field_key_active"]
    (organization_id, resource_type) [type: btree, name: "idx_metadata_field_org_resource"]
  }
}

Table "connector" {
  "name" text [pk, not null]
  "version" text [not null]
  "settings_schema" jsonb [not null, check: `jsonb_typeof(settings_schema) = 'object'::text`]
  "created_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "updated_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "entitlement_slug" text [note: '''Slug of the BOOLEAN entitlement an organization\'s license must grant before it may activate this connector. NULL means ungated.''']
}

Table "inbox_events" {
  "id" uuid [pk, not null, default: `gen_random_uuid()`]
  "organization_id" uuid [not null]
  "source" text [not null]
  "message_id" text [not null]
  "processed_at" timestamptz [not null, default: `now()`]
  "consumer" text [not null]

  Indexes {
    (organization_id, source, message_id, consumer) [type: btree, unique, name: "inbox_events_org_source_message_consumer_key"]
    (processed_at, id) [type: btree, name: "idx_inbox_events_retention"]
  }
}

Table "organization_connector" {
  "organization_id" uuid [not null]
  "connector_name" text [not null]
  "activated_at" timestamptz [not null, default: `now()`]
  "created_at" timestamptz [not null, default: `now()`]
  "updated_at" timestamptz [not null, default: `now()`]

  Indexes {
    (organization_id, connector_name) [pk, type: btree, name: "organization_connector_pkey"]
  }
}

Table "notification_read" {
  "user_id" uuid [not null]
  "audit_trail_id" uuid [not null]
  "read_at" timestamptz [not null, default: `now()`]

  Indexes {
    (user_id, audit_trail_id) [pk, type: btree, name: "notification_read_pkey"]
  }
}

Table "notification_user_state" {
  "user_id" uuid [pk, not null]
  "read_all_before" timestamptz [not null, default: '-infinity']
}

Table "notification_preference" {
  "user_id" uuid [not null]
  "event_name" text [not null]
  "channel" text [not null]
  "enabled" bool [not null]

  Indexes {
    (user_id, event_name, channel) [pk, type: btree, name: "notification_preference_pkey"]
  }
}

Table "license_family" {
  "id" uuid [pk, not null, default: `gen_random_uuid()`]
  "organization_id" uuid [not null]
  "slug" text [not null]
  "last_version" int4 [not null, default: 0]
  "created_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "updated_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "is_public" bool [not null, default: false]
  "fallback_license_family_id" uuid
  "trial_end_without_payment_method" trial_end_without_payment_method [not null, default: 'CANCEL']
  "trial_reminder_days" int4 [not null, check: `(trial_reminder_days >= 1) AND (trial_reminder_days <= 30)`, default: 3]

  Checks {
    `fallback_license_family_id <> id` [name: 'license_family_fallback_check']
  }

  Indexes {
    (id, organization_id) [type: btree, unique, name: "license_family_id_organization_id_key"]
    (organization_id, slug) [type: btree, unique, name: "license_family_organization_id_slug_key"]
    fallback_license_family_id [type: btree, name: "idx_license_family_fallback"]
    (organization_id, created_at, id) [type: btree, name: "idx_license_family_org_created_at"]
    organization_id [type: btree, name: "idx_license_family_public"]
  }
}

Table "user_organization_authorization" {
  "organization_id" uuid [not null]
  "user_id" uuid [not null]
  "enabled" bool [not null, default: true]
  "roles" "text[]" [not null, check: `array_position(roles, NULL::text) IS NULL`, default: '{}']
  "permissions" "text[]" [not null, check: `array_position(permissions, NULL::text) IS NULL`, default: '{}']

  Indexes {
    (organization_id, user_id) [pk, type: btree, name: "user_organization_authorization_pkey"]
  }
}

Table "user_administrator_bootstrap" {
  "singleton" bool [pk, not null, default: true]
  "user_id" uuid [not null]
  "organization_id" uuid [not null]
  "claimed_at" timestamptz [not null, default: `now()`]
}

Table "user_organization_role" {
  "organization_id" uuid [not null]
  "slug" text [not null, check: `(slug ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'::text) AND (length(slug) <= 64)`, check: `slug <> ALL (ARRAY['administrator'::text, 'viewer'::text, 'editor'::text])`]
  "name" text [not null, check: `(length(name) >= 1) AND (length(name) <= 200)`]
  "description" text [not null, check: `length(description) <= 1000`, default: '']
  "permissions" "text[]" [not null, check: `array_position(permissions, NULL::text) IS NULL`, default: '{}']

  Indexes {
    (organization_id, slug) [pk, type: btree, name: "user_organization_role_pkey"]
  }
}

Table "user_managed_profile" {
  "user_id" uuid [pk, not null]
}

Table "usage_ledger_epoch" {
  "singleton" bool [pk, not null, default: true]
  "epoch_at" timestamp [not null, default: `date_trunc('milliseconds'::text, (clock_timestamp() AT TIME ZONE 'UTC'::text))`]
}

Table "license_price" {
  "id" uuid [pk, not null, default: `gen_random_uuid()`]
  "organization_id" uuid [not null]
  "license_id" uuid [not null]
  "billing_model" billing_model [not null]
  "billing_timing" billing_timing [not null]
  "billing_period" billing_period
  "unit_amount_decimal" numeric(24,12) [not null, check: `unit_amount_decimal >= (0)::numeric`]
  "currency" bpchar(3) [not null, check: `currency ~ '^[A-Z]{3}$'::text`]
  "meters_entitlement_id" uuid
  "sale_unit_factor" numeric
  "display_label" text
  "display_order" int4 [not null, check: `display_order >= 0`, default: 0]
  "is_default" bool [not null, default: false]
  "status" price_status [not null, default: 'ACTIVE']
  "deprecated_at" timestamp
  "created_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "created_by_id" uuid [not null]
  "updated_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "updated_by_id" uuid [not null]

  Checks {
    `(billing_model = ANY (ARRAY['USAGE_BASED'::billing_model, 'OVERAGE'::billing_model])) = (meters_entitlement_id IS NOT NULL)` [name: 'license_price_meters_entitlement_check']
    `(billing_model = 'FLAT_FEE'::billing_model) OR (billing_timing = 'ARREARS'::billing_timing)` [name: 'license_price_timing_check']
    `(billing_model = 'FLAT_FEE'::billing_model) = (billing_period IS NOT NULL)` [name: 'license_price_period_check']
    `((billing_model = 'FLAT_FEE'::billing_model) AND (sale_unit_factor IS NULL)) OR ((billing_model = ANY (ARRAY['USAGE_BASED'::billing_model, 'OVERAGE'::billing_model])) AND (sale_unit_factor IS NOT NULL) AND (sale_unit_factor > (0)::numeric))` [name: 'license_price_sale_unit_factor_check']
    `(NOT is_default) OR ((billing_model = 'FLAT_FEE'::billing_model) AND (status = 'ACTIVE'::price_status))` [name: 'license_price_default_flat_fee_check']
    `(status = 'DEPRECATED'::price_status) = (deprecated_at IS NOT NULL)` [name: 'license_price_deprecated_at_check']
  }

  Indexes {
    (id, organization_id) [type: btree, unique, name: "license_price_id_organization_id_key"]
    (license_id, billing_period) [type: btree, unique, name: "license_price_license_id_billing_period_default_key"]
    (license_id, display_order, id) [type: btree, name: "idx_license_price_license_display_order"]
    meters_entitlement_id [type: btree, name: "idx_license_price_meters_entitlement"]
    (organization_id, created_at, id) [type: btree, name: "idx_license_price_org_created_at"]
  }
}

Table "organization_billing_settings" {
  "organization_id" uuid [pk, not null]
  "default_collection_method" collection_method [not null, default: 'SEND_INVOICE']
  "default_days_until_due" int4 [not null, check: `(default_days_until_due >= 0) AND (default_days_until_due <= 365)`, default: 30]
  "handoff_stripe_invoices" bool [not null, default: false]
  "created_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "created_by_id" uuid [not null]
  "updated_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "updated_by_id" uuid [not null]
}

Table "instance_billing" {
  "id" uuid [pk, not null, default: `gen_random_uuid()`]
  "organization_id" uuid [not null]
  "instance_id" uuid [unique]
  "customer_id" uuid
  "instance_slug" text [not null]
  "instance_name" text [not null]
  "customer_slug" text [not null]
  "customer_name" text [not null]
  "status" instance_billing_status [not null]
  "provider_kind" billing_provider_kind [not null]
  "collection_method" collection_method
  "days_until_due" int4 [check: `(days_until_due IS NULL) OR ((days_until_due >= 0) AND (days_until_due <= 365))`]
  "base_license_price_id" uuid [not null]
  "billing_period" billing_period [not null]
  "currency" bpchar(3) [not null, check: `currency ~ '^[A-Z]{3}$'::text`]
  "anchor_at" timestamp [not null, check: `anchor_at = date_trunc('second'::text, anchor_at)`]
  "started_at" timestamp [not null]
  "current_period_start" timestamp [not null]
  "current_period_end" timestamp [not null]
  "cancel_at_period_end" bool [not null, default: false]
  "cancel_requested_at" timestamp
  "canceled_at" timestamp
  "cancellation_reason" text
  "past_due_since" timestamp
  "scheduled_license_price_id" uuid
  "scheduled_at" timestamp
  "created_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "created_by_id" uuid [not null]
  "updated_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "updated_by_id" uuid [not null]
  "trial_ends_at" timestamp
  "pending_license_id" uuid
  "pending_selection" jsonb
  "incomplete_expires_at" timestamp
  "trial_will_end_notified_at" timestamp
  "live_ended_at" timestamp
  "trial_will_end_at" timestamp

  Checks {
    `current_period_start < current_period_end` [name: 'instance_billing_period_check']
    `(status = 'CANCELED'::instance_billing_status) = (canceled_at IS NOT NULL)` [name: 'instance_billing_canceled_at_check']
    `(NOT cancel_at_period_end) OR ((status <> 'CANCELED'::instance_billing_status) AND (cancel_requested_at IS NOT NULL))` [name: 'instance_billing_cancel_at_period_end_check']
    `(status = 'PAST_DUE'::instance_billing_status) = (past_due_since IS NOT NULL)` [name: 'instance_billing_past_due_since_check']
    `((scheduled_license_price_id IS NULL) AND (scheduled_at IS NULL)) OR ((scheduled_license_price_id IS NOT NULL) AND (scheduled_at IS NOT NULL) AND (scheduled_license_price_id <> base_license_price_id) AND (status <> 'CANCELED'::instance_billing_status))` [name: 'instance_billing_scheduled_check']
    `(char_length(instance_slug) > 0) AND (char_length(customer_slug) > 0)` [name: 'instance_billing_snapshot_check']
    `(status <> 'TRIAL'::instance_billing_status) OR ((trial_ends_at IS NOT NULL) AND (current_period_end = trial_ends_at))` [name: 'instance_billing_trial_check']
    `((trial_ends_at IS NULL) AND (trial_will_end_at IS NULL)) OR ((trial_ends_at IS NOT NULL) AND (trial_will_end_at IS NOT NULL) AND (trial_will_end_at < trial_ends_at))` [name: 'instance_billing_trial_will_end_check']
    `((pending_license_id IS NULL) = (pending_selection IS NULL)) AND ((pending_license_id IS NULL) = (incomplete_expires_at IS NULL)) AND ((status <> 'INCOMPLETE'::instance_billing_status) OR (pending_license_id IS NOT NULL)) AND ((pending_license_id IS NULL) OR (status <> 'CANCELED'::instance_billing_status)) AND ((pending_selection IS NULL) OR (jsonb_typeof(pending_selection) = 'object'::text)) AND ((pending_selection IS NULL) OR (status = 'INCOMPLETE'::instance_billing_status) OR (pending_selection ? 'licensePriceId'::text))` [name: 'instance_billing_incomplete_check']
  }

  Indexes {
    (id, organization_id) [type: btree, unique, name: "instance_billing_id_organization_id_key"]
    base_license_price_id [type: btree, name: "idx_instance_billing_base_license_price"]
    customer_id [type: btree, name: "idx_instance_billing_customer"]
    incomplete_expires_at [type: btree, name: "idx_instance_billing_incomplete_expires_at"]
    (organization_id, created_at, id) [type: btree, name: "idx_instance_billing_org_created_at"]
    (organization_id, status) [type: btree, name: "idx_instance_billing_org_status"]
    pending_license_id [type: btree, name: "idx_instance_billing_pending_license"]
    current_period_end [type: btree, name: "idx_instance_billing_period_end_live"]
    scheduled_license_price_id [type: btree, name: "idx_instance_billing_scheduled_license_price"]
    trial_will_end_at [type: btree, name: "idx_instance_billing_trial_will_end_at"]
  }
}

Table "instance_invoice" {
  "id" uuid [pk, not null, default: `gen_random_uuid()`]
  "organization_id" uuid [not null]
  "instance_billing_id" uuid [not null]
  "customer_id" uuid
  "instance_slug" text [not null]
  "instance_name" text [not null]
  "customer_slug" text [not null]
  "customer_name" text [not null]
  "license_id" uuid [not null]
  "license_slug" text [not null]
  "billing_email" text
  "kind" invoice_kind [not null]
  "boundary_at" timestamp [not null]
  "service_from" timestamp [not null]
  "service_to" timestamp [not null]
  "currency" bpchar(3) [not null, check: `currency ~ '^[A-Z]{3}$'::text`]
  "subtotal_minor" int8 [not null]
  "discount_total_minor" int8 [not null, default: 0]
  "total_minor" int8 [not null]
  "lines" jsonb [not null, check: `jsonb_typeof(lines) = 'array'::text`]
  "status" invoice_status [not null]
  "hold_reason" invoice_hold_reason
  "hold_detail" jsonb
  "held_at" timestamp
  "hold_released_at" timestamp
  "hold_released_by_id" uuid
  "hold_release_reason" text
  "provider_kind" billing_provider_kind [not null]
  "collection_method" collection_method [not null]
  "external_customer_id" text
  "external_invoice_id" text
  "provider_invoice_number" text
  "provider_status" text [check: `(provider_status IS NULL) OR (provider_status = ANY (ARRAY['draft'::text, 'open'::text, 'paid'::text, 'uncollectible'::text, 'void'::text]))`]
  "hosted_invoice_url" text
  "invoice_pdf_url" text
  "provider_total_excluding_tax_minor" int8
  "reconciliation_status" reconciliation_status
  "reconciliation_detail" jsonb
  "reconciled_at" timestamp
  "push_attempts" int4 [not null, check: `push_attempts >= 0`, default: 0]
  "next_push_at" timestamp
  "last_push_error" text
  "pushed_at" timestamp
  "synced_at" timestamp
  "issued_at" timestamp
  "days_until_due" int4
  "due_at" timestamp
  "paid_at" timestamp
  "marked_paid_by_id" uuid
  "payment_failed_at" timestamp
  "last_payment_error" text
  "uncollectible_at" timestamp
  "voided_at" timestamp
  "voided_by_id" uuid
  "void_reason" text
  "replaces_invoice_id" uuid [unique]
  "handoff_status" handoff_status [not null, default: 'NOT_REQUIRED']
  "handoff_lease_id" uuid
  "handoff_leased_until" timestamp
  "handoff_claim_count" int4 [not null, check: `handoff_claim_count >= 0`, default: 0]
  "handoff_acknowledged_at" timestamp
  "handoff_acknowledged_by_id" uuid
  "external_reference" text [check: `(external_reference IS NULL) OR ((char_length(external_reference) >= 1) AND (char_length(external_reference) <= 255))`]
  "created_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "updated_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "finalize_requested" bool [not null, default: false]
  "handoff_reclaimed_at" timestamp

  Checks {
    `(subtotal_minor >= 0) AND (discount_total_minor >= 0) AND (discount_total_minor <= subtotal_minor) AND (total_minor = (subtotal_minor - discount_total_minor))` [name: 'instance_invoice_total_check']
    `service_from <= service_to` [name: 'instance_invoice_service_period_check']
    `((hold_reason IS NULL) OR (status = 'DRAFT'::invoice_status)) AND ((hold_reason IS NULL) = (held_at IS NULL)) AND ((hold_detail IS NULL) OR (hold_reason IS NOT NULL))` [name: 'instance_invoice_hold_check']
    `(hold_released_at IS NULL) = (hold_release_reason IS NULL)` [name: 'instance_invoice_hold_release_check']
    `(status <> ALL (ARRAY['PUSHED'::invoice_status, 'PAYMENT_FAILED'::invoice_status])) OR (external_invoice_id IS NOT NULL)` [name: 'instance_invoice_pushed_check']
    `(status = ANY (ARRAY['DRAFT'::invoice_status, 'PUSH_FAILED'::invoice_status, 'VOID'::invoice_status])) OR (issued_at IS NOT NULL)` [name: 'instance_invoice_issued_check']
    `((issued_at IS NULL) AND (days_until_due IS NULL) AND (due_at IS NULL)) OR ((issued_at IS NOT NULL) AND (days_until_due IS NOT NULL) AND (due_at IS NOT NULL) AND ((days_until_due >= 0) AND (days_until_due <= 365)) AND (due_at = (issued_at + make_interval(days => days_until_due))))` [name: 'instance_invoice_due_check']
    `(status = 'PAID'::invoice_status) = (paid_at IS NOT NULL)` [name: 'instance_invoice_paid_check']
    `(status <> 'PAYMENT_FAILED'::invoice_status) OR (payment_failed_at IS NOT NULL)` [name: 'instance_invoice_payment_failed_check']
    `(status <> 'UNCOLLECTIBLE'::invoice_status) OR (uncollectible_at IS NOT NULL)` [name: 'instance_invoice_uncollectible_check']
    `(status = 'VOID'::invoice_status) = (voided_at IS NOT NULL)` [name: 'instance_invoice_void_check']
    `replaces_invoice_id IS DISTINCT FROM id` [name: 'instance_invoice_replaces_invoice_id_check']
    `(reconciliation_status IS NULL) = (reconciled_at IS NULL)` [name: 'instance_invoice_reconciliation_check']
    `(handoff_status = 'NOT_REQUIRED'::handoff_status) OR (status <> ALL (ARRAY['DRAFT'::invoice_status, 'PUSH_FAILED'::invoice_status]))` [name: 'instance_invoice_handoff_draft_check']
    `((handoff_lease_id IS NULL) = (handoff_leased_until IS NULL)) AND ((handoff_lease_id IS NULL) OR (handoff_status = 'PENDING'::handoff_status))` [name: 'instance_invoice_handoff_lease_check']
    `(handoff_status = 'ACKNOWLEDGED'::handoff_status) = (handoff_acknowledged_at IS NOT NULL)` [name: 'instance_invoice_handoff_acknowledged_check']
    `(char_length(instance_slug) > 0) AND (char_length(customer_slug) > 0) AND (char_length(license_slug) > 0)` [name: 'instance_invoice_snapshot_check']
    `((provider_kind = 'NOOP'::billing_provider_kind) AND (status <> ALL (ARRAY['PUSHED'::invoice_status, 'PUSH_FAILED'::invoice_status, 'PAYMENT_FAILED'::invoice_status])) AND (external_invoice_id IS NULL) AND (provider_status IS NULL) AND (reconciliation_status IS NULL)) OR ((provider_kind <> 'NOOP'::billing_provider_kind) AND (status <> 'MANUAL'::invoice_status))` [name: 'instance_invoice_provider_status_check']
    `(handoff_reclaimed_at IS NULL) OR (handoff_claim_count >= 2)` [name: 'instance_invoice_handoff_reclaimed_at_check']
  }

  Indexes {
    (instance_billing_id, kind, boundary_at) [type: btree, unique, name: "instance_invoice_boundary_key"]
    (provider_kind, external_invoice_id) [type: btree, unique, name: "instance_invoice_external_invoice_key"]
    (id, organization_id) [type: btree, unique, name: "instance_invoice_id_organization_id_key"]
    (instance_billing_id, boundary_at, id) [type: btree, name: "idx_instance_invoice_billing_boundary"]
    (customer_id, boundary_at, id) [type: btree, name: "idx_instance_invoice_customer_boundary"]
    (organization_id, issued_at, id) [type: btree, name: "idx_instance_invoice_handoff_pending"]
    instance_billing_id [type: btree, name: "idx_instance_invoice_held"]
    due_at [type: btree, name: "idx_instance_invoice_open_due_at"]
    (organization_id, created_at, id) [type: btree, name: "idx_instance_invoice_org_created_at"]
    (organization_id, handoff_reclaimed_at) [type: btree, name: "idx_instance_invoice_org_handoff_reclaimed_at"]
    (organization_id, due_at) [type: btree, name: "idx_instance_invoice_org_open_due_at"]
    (organization_id, updated_at, id) [type: btree, name: "idx_instance_invoice_org_updated_at"]
    (provider_kind, synced_at) [type: btree, name: "idx_instance_invoice_provider_open"]
    next_push_at [type: btree, name: "idx_instance_invoice_push_queue"]
  }
}

Table "addon_family" {
  "id" uuid [pk, not null, default: `gen_random_uuid()`]
  "organization_id" uuid [not null]
  "slug" text [not null]
  "last_version" int4 [not null, default: 0]
  "is_public" bool [not null, default: false]
  "created_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "updated_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "increase_billing" addon_increase_billing [not null, default: 'TRUE_UP']

  Indexes {
    (id, organization_id) [type: btree, unique, name: "addon_family_id_organization_id_key"]
    (organization_id, slug) [type: btree, unique, name: "addon_family_organization_id_slug_key"]
    (organization_id, created_at, id) [type: btree, name: "idx_addon_family_org_created_at"]
    organization_id [type: btree, name: "idx_addon_family_public"]
  }
}

Table "addon" {
  "id" uuid [pk, not null, default: `gen_random_uuid()`]
  "organization_id" uuid [not null]
  "family_id" uuid [unique, not null]
  "name" text [not null]
  "slug" text [not null]
  "description" text [not null]
  "version" int4 [not null]
  "version_name" text
  "is_default" bool [not null, default: false]
  "lifecycle_state" license_lifecycle_state [not null]
  "pricing_type" pricing_type [not null]
  "max_quantity" int4 [check: `(max_quantity IS NULL) OR (max_quantity >= 1)`]
  "created_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "created_by_id" uuid [not null]
  "updated_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "updated_by_id" uuid [not null]

  Checks {
    `(NOT is_default) OR (lifecycle_state = 'PUBLISHED'::license_lifecycle_state)` [name: 'addon_default_must_be_published_check']
  }

  Indexes {
    (family_id, version) [type: btree, unique, name: "addon_family_id_version_key"]
    (id, family_id, organization_id) [type: btree, unique, name: "addon_id_family_id_organization_id_key"]
    (id, organization_id) [type: btree, unique, name: "addon_id_organization_id_key"]
    (organization_id, slug) [type: btree, unique, name: "addon_organization_id_slug_key"]
    (organization_id, created_at, id) [type: btree, name: "idx_addon_org_created_at"]
  }
}

Table "addon_price" {
  "id" uuid [pk, not null, default: `gen_random_uuid()`]
  "organization_id" uuid [not null]
  "addon_id" uuid [not null]
  "billing_model" billing_model [not null]
  "billing_timing" billing_timing [not null]
  "billing_period" billing_period
  "unit_amount_decimal" numeric(24,12) [not null, check: `unit_amount_decimal >= (0)::numeric`]
  "currency" bpchar(3) [not null, check: `currency ~ '^[A-Z]{3}$'::text`]
  "meters_entitlement_id" uuid
  "sale_unit_factor" numeric
  "display_label" text
  "display_order" int4 [not null, check: `display_order >= 0`, default: 0]
  "is_default" bool [not null, default: false]
  "status" price_status [not null, default: 'ACTIVE']
  "deprecated_at" timestamp
  "created_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "created_by_id" uuid [not null]
  "updated_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "updated_by_id" uuid [not null]

  Checks {
    `(billing_model = ANY (ARRAY['USAGE_BASED'::billing_model, 'OVERAGE'::billing_model])) = (meters_entitlement_id IS NOT NULL)` [name: 'addon_price_meters_entitlement_check']
    `(billing_model = 'FLAT_FEE'::billing_model) OR (billing_timing = 'ARREARS'::billing_timing)` [name: 'addon_price_timing_check']
    `(billing_model = 'FLAT_FEE'::billing_model) = (billing_period IS NOT NULL)` [name: 'addon_price_period_check']
    `((billing_model = 'FLAT_FEE'::billing_model) AND (sale_unit_factor IS NULL)) OR ((billing_model = ANY (ARRAY['USAGE_BASED'::billing_model, 'OVERAGE'::billing_model])) AND (sale_unit_factor IS NOT NULL) AND (sale_unit_factor > (0)::numeric))` [name: 'addon_price_sale_unit_factor_check']
    `(NOT is_default) OR ((billing_model = 'FLAT_FEE'::billing_model) AND (status = 'ACTIVE'::price_status))` [name: 'addon_price_default_flat_fee_check']
    `(status = 'DEPRECATED'::price_status) = (deprecated_at IS NOT NULL)` [name: 'addon_price_deprecated_at_check']
  }

  Indexes {
    (addon_id, billing_period) [type: btree, unique, name: "addon_price_addon_id_billing_period_default_key"]
    (id, organization_id) [type: btree, unique, name: "addon_price_id_organization_id_key"]
    (addon_id, display_order, id) [type: btree, name: "idx_addon_price_addon_display_order"]
    meters_entitlement_id [type: btree, name: "idx_addon_price_meters_entitlement"]
    (organization_id, created_at, id) [type: btree, name: "idx_addon_price_org_created_at"]
  }
}

Table "addon_entitlement" {
  "id" uuid [pk, not null, default: `gen_random_uuid()`]
  "organization_id" uuid [not null]
  "addon_id" uuid [not null]
  "entitlement_id" uuid [not null]
  "value" jsonb [not null, check: `(jsonb_typeof(value) = 'object'::text) AND (value ? 'type'::text) AND (value ? 'value'::text) AND ((((value ->> 'type'::text) = 'number'::text) AND (jsonb_typeof((value -> 'value'::text)) = 'number'::text)) OR (((value ->> 'type'::text) = 'boolean'::text) AND (jsonb_typeof((value -> 'value'::text)) = 'boolean'::text)) OR (((value ->> 'type'::text) = 'object'::text) AND (jsonb_typeof((value -> 'value'::text)) = 'object'::text)))`]
  "limit_cap_exceeded_overage_percent" int2
  "override_behavior" addon_override_behavior [not null, default: 'MAX']
  "created_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "created_by_id" uuid [not null]
  "updated_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "updated_by_id" uuid [not null]

  Checks {
    `(limit_cap_exceeded_overage_percent IS NULL) OR ((value ->> 'type'::text) = 'number'::text)` [name: 'addon_entitlement_overage_percent_number_only_check']
    `(limit_cap_exceeded_overage_percent IS NULL) OR ((value ->> 'type'::text) <> 'number'::text) OR ((((value ->> 'value'::text))::numeric = ('-1'::integer)::numeric) AND (limit_cap_exceeded_overage_percent = '-1'::integer)) OR ((((value ->> 'value'::text))::numeric <> ('-1'::integer)::numeric) AND (limit_cap_exceeded_overage_percent >= 0))` [name: 'addon_entitlement_overage_percent_unlimited_check']
  }

  Indexes {
    (addon_id, entitlement_id) [type: btree, unique, name: "addon_entitlement_addon_id_entitlement_id_key"]
    entitlement_id [type: btree, name: "idx_addon_entitlement_entitlement"]
  }
}

Table "addon_compatible_license" {
  "addon_id" uuid [not null]
  "license_family_id" uuid [not null]
  "organization_id" uuid [not null]
  "created_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]

  Indexes {
    (addon_id, license_family_id) [pk, type: btree, name: "addon_compatible_license_pkey"]
    license_family_id [type: btree, name: "idx_addon_compatible_license_family"]
  }
}

Table "instance_addon" {
  "id" uuid [pk, not null, default: `gen_random_uuid()`]
  "organization_id" uuid [not null]
  "instance_id" uuid [not null]
  "addon_id" uuid [not null]
  "addon_family_id" uuid [not null]
  "quantity" int4 [not null, check: `quantity >= 1`, default: 1]
  "removed_at" timestamp
  "removed_by_id" uuid
  "created_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "created_by_id" uuid [not null]
  "updated_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "updated_by_id" uuid [not null]
  "pending_quantity" int4
  "period_max_quantity" int4 [not null, default: 1]

  Checks {
    `(removed_by_id IS NULL) OR (removed_at IS NOT NULL)` [name: 'instance_addon_removed_check']
    `(pending_quantity IS NULL) OR ((pending_quantity >= 0) AND (pending_quantity < quantity) AND (removed_at IS NULL))` [name: 'instance_addon_pending_quantity_check']
    `period_max_quantity >= quantity` [name: 'instance_addon_period_max_quantity_check']
  }

  Indexes {
    (instance_id, addon_family_id) [type: btree, unique, name: "instance_addon_instance_id_addon_family_id_active_key"]
    addon_id [type: btree, name: "idx_instance_addon_addon"]
    (instance_id, created_at, id) [type: btree, name: "idx_instance_addon_instance_created_at"]
  }
}

Table "voucher" {
  "id" uuid [pk, not null, default: `gen_random_uuid()`]
  "organization_id" uuid [not null]
  "code" text [not null, check: `code ~ '^[A-Za-z0-9_-]{8,64}$'::text`]
  "code_normalized" text
  "name" text [not null]
  "description" text
  "voucher_type" voucher_type [not null]
  "status" voucher_status [not null, default: 'DRAFT']
  "duration" voucher_duration [not null]
  "duration_in_periods" int4
  "max_redemptions" int4
  "redemptions_count" int4 [not null, default: 0]
  "starts_at" timestamp
  "expires_at" timestamp
  "price_discount_type" price_discount_type
  "price_discount_value" numeric(24,12)
  "currency" bpchar(3)
  "price_applies_to" price_applies_to
  "applicable_license_price_ids" "uuid[]" [not null, default: '{}']
  "applicable_addon_price_ids" "uuid[]" [not null, default: '{}']
  "applicable_license_ids" "uuid[]" [not null, default: '{}']
  "applicable_addon_ids" "uuid[]" [not null, default: '{}']
  "restricted_customer_id" uuid
  "redemption_rules" jsonb [not null, check: `jsonb_typeof(redemption_rules) = 'object'::text`, default: `{}`]
  "created_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "created_by_id" uuid [not null]
  "updated_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "updated_by_id" uuid [not null]

  Checks {
    `((duration = 'REPEATING'::voucher_duration) = (duration_in_periods IS NOT NULL)) AND ((duration_in_periods IS NULL) OR (duration_in_periods >= 1))` [name: 'voucher_duration_check']
    `(redemptions_count >= 0) AND ((max_redemptions IS NULL) OR ((max_redemptions >= 1) AND (redemptions_count <= max_redemptions)))` [name: 'voucher_redemptions_check']
    `(starts_at IS NULL) OR (expires_at IS NULL) OR (starts_at < expires_at)` [name: 'voucher_window_check']
    `(price_discount_type IS NULL) OR ((price_discount_type = 'PERCENTAGE'::price_discount_type) AND (price_discount_value > (0)::numeric) AND (price_discount_value <= (100)::numeric)) OR ((price_discount_type = 'FIXED_AMOUNT'::price_discount_type) AND (price_discount_value > (0)::numeric) AND (price_discount_value = trunc(price_discount_value)))` [name: 'voucher_discount_value_check']
    `((NOT (price_discount_type IS DISTINCT FROM 'FIXED_AMOUNT'::price_discount_type)) = (currency IS NOT NULL)) AND ((currency IS NULL) OR (currency ~ '^[A-Z]{3}$'::text))` [name: 'voucher_currency_check']
    `(NOT (price_applies_to IS DISTINCT FROM 'SELECTED_PRICES'::price_applies_to)) = ((cardinality(applicable_license_price_ids) + cardinality(applicable_addon_price_ids)) > 0)` [name: 'voucher_selected_prices_check']
    `(array_position(applicable_license_price_ids, NULL::uuid) IS NULL) AND (array_position(applicable_addon_price_ids, NULL::uuid) IS NULL) AND (array_position(applicable_license_ids, NULL::uuid) IS NULL) AND (array_position(applicable_addon_ids, NULL::uuid) IS NULL)` [name: 'voucher_arrays_no_null_check']
    `((voucher_type = ANY (ARRAY['PRICE'::voucher_type, 'COMPOSITE'::voucher_type])) AND (price_discount_type IS NOT NULL) AND (price_discount_value IS NOT NULL) AND (price_applies_to IS NOT NULL)) OR ((voucher_type = ANY (ARRAY['ENTITLEMENT_BOOST'::voucher_type, 'FLAG_GRANT'::voucher_type, 'COMPOSITE'::voucher_type])) AND (price_discount_type IS NULL) AND (price_discount_value IS NULL) AND (price_applies_to IS NULL) AND (currency IS NULL) AND (cardinality(applicable_license_price_ids) = 0) AND (cardinality(applicable_addon_price_ids) = 0))` [name: 'voucher_price_fields_check']
  }

  Indexes {
    (id, organization_id) [type: btree, unique, name: "voucher_id_organization_id_key"]
    (id, voucher_type, organization_id) [type: btree, unique, name: "voucher_id_voucher_type_organization_id_key"]
    (organization_id, code_normalized) [type: btree, unique, name: "voucher_organization_id_code_normalized_key"]
    expires_at [type: btree, name: "idx_voucher_active_expires_at"]
    (organization_id, created_at, id) [type: btree, name: "idx_voucher_org_created_at"]
    restricted_customer_id [type: btree, name: "idx_voucher_restricted_customer"]
  }
}

Table "voucher_entitlement_grant" {
  "id" uuid [pk, not null, default: `gen_random_uuid()`]
  "organization_id" uuid [not null]
  "voucher_id" uuid [not null]
  "voucher_type" voucher_type [not null, check: `voucher_type = ANY (ARRAY['ENTITLEMENT_BOOST'::voucher_type, 'COMPOSITE'::voucher_type])`, default: 'ENTITLEMENT_BOOST']
  "entitlement_id" uuid [not null]
  "modifier_type" boost_modifier_type [not null]
  "modifier_value" numeric
  "created_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "value" jsonb

  Checks {
    `((modifier_type = 'UNLIMITED'::boost_modifier_type) AND (modifier_value IS NULL) AND (value IS NULL)) OR ((modifier_type = 'SET'::boost_modifier_type) AND (modifier_value IS NOT NULL) AND (modifier_value >= (0)::numeric) AND (value IS NULL)) OR ((modifier_type = 'SET'::boost_modifier_type) AND (modifier_value IS NULL) AND (value IS NOT NULL) AND (jsonb_typeof(value) = ANY (ARRAY['boolean'::text, 'object'::text]))) OR ((modifier_type = 'ADD'::boost_modifier_type) AND (modifier_value IS NOT NULL) AND (modifier_value > (0)::numeric) AND (value IS NULL)) OR ((modifier_type = 'MULTIPLY'::boost_modifier_type) AND (modifier_value IS NOT NULL) AND (modifier_value > (0)::numeric) AND (value IS NULL))` [name: 'voucher_entitlement_grant_modifier_check']
  }

  Indexes {
    (voucher_id, entitlement_id) [type: btree, unique, name: "voucher_entitlement_grant_voucher_id_entitlement_id_key"]
    entitlement_id [type: btree, name: "idx_voucher_entitlement_grant_entitlement"]
  }
}

Table "instance_voucher" {
  "id" uuid [pk, not null, default: `gen_random_uuid()`]
  "organization_id" uuid [not null]
  "instance_id" uuid [not null]
  "voucher_id" uuid [not null]
  "redeemed_at" timestamp [not null]
  "redeemed_by_id" uuid [not null]
  "effective_starts_at" timestamp [not null]
  "effective_expires_at" timestamp
  "applications_count" int4 [not null, check: `applications_count >= 0`, default: 0]
  "status" instance_voucher_status [not null, default: 'ACTIVE']
  "expired_at" timestamp
  "revoked_at" timestamp
  "revoked_by_id" uuid
  "revoked_reason" text
  "created_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "updated_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]

  Checks {
    `(effective_expires_at IS NULL) OR (effective_starts_at < effective_expires_at)` [name: 'instance_voucher_window_check']
    `((status = 'REVOKED'::instance_voucher_status) = (revoked_at IS NOT NULL)) AND ((revoked_at IS NULL) OR (char_length(btrim(COALESCE(revoked_reason, ''::text))) > 0))` [name: 'instance_voucher_revoked_check']
    `(status = 'EXPIRED'::instance_voucher_status) = (expired_at IS NOT NULL)` [name: 'instance_voucher_expired_check']
  }

  Indexes {
    (instance_id, voucher_id) [type: btree, unique, name: "instance_voucher_instance_id_voucher_id_key"]
    effective_expires_at [type: btree, name: "idx_instance_voucher_active_expires_at"]
    (instance_id, voucher_id) [type: btree, name: "idx_instance_voucher_instance_active"]
    voucher_id [type: btree, name: "idx_instance_voucher_voucher"]
  }
}

Table "customer_billing" {
  "customer_id" uuid [not null]
  "organization_id" uuid [not null]
  "provider_kind" billing_provider_kind [not null, check: `provider_kind <> 'NOOP'::billing_provider_kind`]
  "external_customer_id" text [not null, check: `char_length(external_customer_id) > 0`]
  "web_url" text
  "synced_at" timestamp
  "last_error" text
  "created_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "updated_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "default_payment_method_id" text
  "payment_method_brand" text
  "payment_method_last4" bpchar(4)
  "payment_method_exp_month" int2
  "payment_method_exp_year" int2
  "payment_method_status" payment_method_status [not null, default: 'NONE']
  "payment_method_attached_at" timestamp

  Checks {
    `((payment_method_status = 'NONE'::payment_method_status) AND (default_payment_method_id IS NULL) AND (payment_method_attached_at IS NULL)) OR ((payment_method_status <> 'NONE'::payment_method_status) AND (default_payment_method_id IS NOT NULL) AND (payment_method_attached_at IS NOT NULL))` [name: 'customer_billing_payment_method_check']
    `((payment_method_last4 IS NULL) OR (payment_method_last4 ~ '^[0-9]{4}$'::text)) AND ((payment_method_exp_month IS NULL) OR ((payment_method_exp_month >= 1) AND (payment_method_exp_month <= 12))) AND ((payment_method_exp_year IS NULL) OR ((payment_method_exp_year >= 2000) AND (payment_method_exp_year <= 2100)))` [name: 'customer_billing_payment_method_label_check']
  }

  Indexes {
    (customer_id, provider_kind) [pk, type: btree, name: "customer_billing_pkey"]
    (organization_id, provider_kind, external_customer_id) [type: btree, unique, name: "customer_billing_external_customer_key"]
    (payment_method_exp_year, payment_method_exp_month) [type: btree, name: "idx_customer_billing_payment_method_expiry"]
  }
}

Table "billing_sync_state" {
  "organization_id" uuid [not null]
  "provider_kind" billing_provider_kind [not null, check: `provider_kind <> 'NOOP'::billing_provider_kind`]
  "cursor" text
  "cursor_created_at" timestamp
  "last_synced_at" timestamp
  "last_sync_status" billing_sync_status
  "last_sync_error" text
  "consecutive_failures" int4 [not null, check: `consecutive_failures >= 0`, default: 0]
  "last_full_sweep_at" timestamp
  "created_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "updated_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "last_successful_sync_at" timestamp

  Checks {
    `(last_synced_at IS NULL) = (last_sync_status IS NULL)` [name: 'billing_sync_state_status_check']
    `(last_sync_status IS DISTINCT FROM 'SUCCESS'::billing_sync_status) OR (last_successful_sync_at = last_synced_at)` [name: 'billing_sync_state_last_successful_sync_at_check']
  }

  Indexes {
    (organization_id, provider_kind) [pk, type: btree, name: "billing_sync_state_pkey"]
  }
}

Table "publishable_key" {
  "id" uuid [pk, not null, default: `gen_random_uuid()`]
  "organization_id" uuid [not null]
  "label" text [not null, check: `(char_length(label) >= 1) AND (char_length(label) <= 100)`]
  "lookup_hash" text [not null, check: `lookup_hash ~ '^[0-9a-f]{64}$'::text`]
  "key_hint" text [not null, check: `char_length(key_hint) = 4`]
  "allowed_origins" "text[]" [not null, check: `(cardinality(allowed_origins) <= 50) AND (array_position(allowed_origins, NULL::text) IS NULL)`, default: '{}']
  "last_used_at" timestamp
  "created_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "created_by_id" uuid [not null]
  "updated_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "updated_by_id" uuid [not null]
  "revoked_at" timestamp
  "revoked_by_id" uuid
  "anonymous_checkout" bool [not null, default: false]
  "turnstile_site_key" text [check: `(turnstile_site_key IS NULL) OR (turnstile_site_key ~ '^[A-Za-z0-9_-]{1,255}$'::text)`]
  "turnstile_secret_set_at" timestamp

  Checks {
    `(revoked_at IS NULL) = (revoked_by_id IS NULL)` [name: 'publishable_key_revoked_check']
  }

  Indexes {
    lookup_hash [type: btree, unique, name: "idx_publishable_key_lookup_hash_active"]
    (id, organization_id) [type: btree, unique, name: "publishable_key_id_organization_id_key"]
    (organization_id, created_at) [type: btree, name: "idx_publishable_key_organization_created_at"]
  }
}

Table "customer_session" {
  "id" uuid [pk, not null, default: `gen_random_uuid()`]
  "organization_id" uuid [not null]
  "customer_id" uuid [not null]
  "instance_id" uuid
  "lookup_hash" text [not null, check: `lookup_hash ~ '^[0-9a-f]{64}$'::text`]
  "created_by_id" uuid [not null]
  "created_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "expires_at" timestamp [not null]
  "revoked_at" timestamp
  "revoked_by_id" uuid

  Checks {
    `(expires_at >= (created_at + '00:05:00'::interval)) AND (expires_at <= (created_at + '01:00:00'::interval))` [name: 'customer_session_ttl_check']
  }

  Indexes {
    lookup_hash [type: btree, unique, name: "idx_customer_session_lookup_hash_active"]
    customer_id [type: btree, name: "idx_customer_session_customer"]
    (organization_id, expires_at) [type: btree, name: "idx_customer_session_organization_expires_at"]
  }
}

Table "customer_trial" {
  "customer_id" uuid [not null]
  "license_family_id" uuid [not null]
  "organization_id" uuid [not null]
  "instance_id" uuid
  "consumed_at" timestamp [not null]

  Indexes {
    (customer_id, license_family_id) [pk, type: btree, name: "customer_trial_pkey"]
    instance_id [type: btree, name: "idx_customer_trial_instance"]
  }
}

Table "checkout_session" {
  "id" uuid [pk, not null, default: `gen_random_uuid()`]
  "organization_id" uuid [not null]
  "publishable_key_id" uuid [not null]
  "lookup_hash" text [not null, check: `lookup_hash ~ '^[0-9a-f]{64}$'::text`]
  "status" checkout_session_status [not null, default: 'OPEN']
  "email" text [not null, check: `(email ~ '^[^@[:space:]]+@[^@[:space:]]+$'::text) AND (char_length(email) <= 254)`]
  "client_reference_id" text [check: `(client_reference_id IS NULL) OR ((char_length(client_reference_id) >= 1) AND (char_length(client_reference_id) <= 255))`]
  "license_price_id" uuid [not null]
  "selection" jsonb [not null, check: `jsonb_typeof(selection) = 'object'::text`, default: `{}`]
  "due_today_minor" int8 [not null]
  "currency" bpchar(3) [not null]
  "trial_refused_reason" text [check: `(trial_refused_reason IS NULL) OR (trial_refused_reason = 'ALREADY_CONSUMED'::text)`]
  "return_url" text [not null, check: `(return_url ~ '^https?://\S+$'::text) AND (char_length(return_url) <= 2048)`]
  "external_setup_session_id" text
  "setup_completed_at" timestamp
  "customer_id" uuid
  "instance_id" uuid
  "created_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "expires_at" timestamp [not null]
  "completed_at" timestamp
  "abandoned_at" timestamp
  "expired_at" timestamp
  "closed_at" timestamp
  "updated_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "customer_name" text [check: `(customer_name IS NULL) OR ((length(btrim(customer_name)) >= 1) AND (length(btrim(customer_name)) <= 255))`]

  Checks {
    `(due_today_minor >= 0) AND (currency ~ '^[A-Z]{3}$'::text)` [name: 'checkout_session_due_today_check']
    `((status = ANY (ARRAY['OPEN'::checkout_session_status, 'ABANDONED'::checkout_session_status])) = (customer_id IS NULL)) AND ((customer_id IS NULL) = (instance_id IS NULL))` [name: 'checkout_session_provisioned_check']
    `expires_at > created_at` [name: 'checkout_session_expires_at_check']
    `((status = 'COMPLETED'::checkout_session_status) = (completed_at IS NOT NULL)) AND ((status = 'ABANDONED'::checkout_session_status) = (abandoned_at IS NOT NULL)) AND ((status = 'EXPIRED'::checkout_session_status) = (expired_at IS NOT NULL))` [name: 'checkout_session_status_check']
    `((closed_at IS NULL) = (status = ANY (ARRAY['OPEN'::checkout_session_status, 'AWAITING_PAYMENT'::checkout_session_status]))) AND (NOT (closed_at IS DISTINCT FROM COALESCE(completed_at, abandoned_at, expired_at)))` [name: 'checkout_session_closed_at_check']
  }

  Indexes {
    lookup_hash [type: btree, unique, name: "idx_checkout_session_lookup_hash"]
    closed_at [type: btree, name: "idx_checkout_session_closed_at"]
    customer_id [type: btree, name: "idx_checkout_session_customer"]
    instance_id [type: btree, name: "idx_checkout_session_instance"]
    expires_at [type: btree, name: "idx_checkout_session_open_expires_at"]
    (organization_id, client_reference_id) [type: btree, name: "idx_checkout_session_organization_client_reference"]
    (organization_id, created_at, id) [type: btree, name: "idx_checkout_session_organization_created_at"]
    (organization_id, `lower(email)`) [type: btree, name: "idx_checkout_session_organization_email"]
    setup_completed_at [type: btree, name: "idx_checkout_session_setup_completed"]
  }
}

Table "instance_entitlement_exception" {
  "id" uuid [pk, not null, default: `gen_random_uuid()`]
  "organization_id" uuid [not null]
  "instance_id" uuid [not null]
  "entitlement_id" uuid [not null]
  "kind" entitlement_exception_kind [not null]
  "value" jsonb
  "starts_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "ends_at" timestamp
  "reason" text [not null, check: `((char_length(reason) >= 1) AND (char_length(reason) <= 500)) AND (char_length(btrim(reason)) > 0)`]
  "created_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "created_by_id" uuid [not null]
  "revoked_at" timestamp
  "revoked_by_id" uuid
  "expired_notified_at" timestamp

  Checks {
    `((kind = 'UNLIMITED'::entitlement_exception_kind) = (value IS NULL)) AND
CASE
    WHEN (value IS NULL) THEN true
    WHEN (jsonb_typeof(value) = 'number'::text) THEN
    CASE
        WHEN (kind = 'ADD'::entitlement_exception_kind) THEN (((value #>> '{}'::text[]))::numeric > (0)::numeric)
        ELSE (((value #>> '{}'::text[]))::numeric >= (0)::numeric)
    END
    WHEN (jsonb_typeof(value) = ANY (ARRAY['boolean'::text, 'object'::text])) THEN (kind = 'SET'::entitlement_exception_kind)
    ELSE false
END` [name: 'instance_entitlement_exception_value_check']
    `(ends_at IS NULL) OR (ends_at > starts_at)` [name: 'instance_entitlement_exception_window_check']
    `(revoked_at IS NULL) = (revoked_by_id IS NULL)` [name: 'instance_entitlement_exception_revoked_check']
    `(expired_notified_at IS NULL) OR (ends_at IS NOT NULL)` [name: 'instance_entitlement_exception_expired_notified_check']
  }

  Indexes {
    entitlement_id [type: btree, name: "idx_instance_entitlement_exception_entitlement"]
    ends_at [type: btree, name: "idx_instance_entitlement_exception_expiry"]
    (instance_id, starts_at, id) [type: btree, name: "idx_instance_entitlement_exception_instance_starts_at"]
  }
}

Table "voucher_flag_grant" {
  "id" uuid [pk, not null, default: `gen_random_uuid()`]
  "organization_id" uuid [not null]
  "voucher_id" uuid [not null]
  "voucher_type" voucher_type [not null, check: `voucher_type = ANY (ARRAY['FLAG_GRANT'::voucher_type, 'COMPOSITE'::voucher_type])`]
  "flag_id" uuid [not null]
  "variant" text [not null, check: `(char_length(variant) >= 1) AND (char_length(variant) <= 255)`]
  "created_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]

  Indexes {
    (voucher_id, flag_id) [type: btree, unique, name: "voucher_flag_grant_voucher_id_flag_id_key"]
    flag_id [type: btree, name: "idx_voucher_flag_grant_flag"]
  }
}

Table "organization_administrator_bootstrap" {
  "organization_id" uuid [pk, not null]
  "user_id" uuid
  "claimed_at" timestamptz [not null, default: `now()`]
}

Table "organization_administrator_bootstrap_alias" {
  "external_id" text [pk, not null]
  "organization_id" uuid [not null]
}

Table "usage_ledger" {
  "organization_id" uuid [not null]
  "instance_id" uuid [not null]
  "entitlement_id" uuid [not null]
  "license_id" uuid [not null]
  "report_seq" int8 [not null, check: `report_seq >= 1`]
  "reported_at" timestamp [not null]
  "window_start" timestamp
  "window_end" timestamp
  "behavior" usage_report_behavior [not null]
  "aggregation_method" aggregation_method [not null]
  "reported_value" numeric [not null]
  "value_before" numeric [not null]
  "value_after" numeric [not null]
  "event_count_after" int4 [not null, check: `event_count_after >= 0`]
  "limit_value" numeric
  "overage_percent" int2 [not null]
  "transaction_id" text [check: `(transaction_id IS NULL) OR (transaction_id ~ '^[A-Za-z0-9._:-]{1,128}$'::text)`]
  "properties" jsonb [check: `(properties IS NULL) OR ((jsonb_typeof(properties) = 'object'::text) AND (octet_length((properties)::text) <= 8192))`]

  Checks {
    `((limit_value IS NULL) AND (overage_percent = '-1'::integer)) OR ((limit_value IS NOT NULL) AND (limit_value >= (0)::numeric) AND (overage_percent >= 0))` [name: 'usage_ledger_limit_check']
    `((window_start IS NULL) AND (window_end IS NULL)) OR ((window_start IS NOT NULL) AND (window_end IS NOT NULL) AND (window_start < window_end))` [name: 'usage_ledger_window_check']
  }

  Indexes {
    (instance_id, entitlement_id, report_seq, reported_at) [pk, type: btree, name: "usage_ledger_pkey"]
    (organization_id, reported_at) [type: btree, name: "idx_usage_ledger_org_reported_at"]
    (instance_id, entitlement_id, reported_at) [type: btree, name: "idx_usage_ledger_pair_reported_at"]
    (instance_id, entitlement_id, transaction_id, reported_at) [type: btree, name: "idx_usage_ledger_transaction_id"]
  }
}

Ref "addon_created_by_id_fkey":"user"."id" <? "addon"."created_by_id" [update: cascade, delete: restrict]

Ref "addon_family_id_fkey":"addon_family".("id", "organization_id") <? "addon".("family_id", "organization_id") [update: cascade, delete: cascade]

Ref "addon_organization_id_fkey":"organization"."id" <? "addon"."organization_id" [update: cascade, delete: cascade]

Ref "addon_updated_by_id_fkey":"user"."id" <? "addon"."updated_by_id" [update: cascade, delete: restrict]

Ref "addon_compatible_license_addon_id_fkey":"addon".("id", "organization_id") <? "addon_compatible_license".("addon_id", "organization_id") [update: cascade, delete: cascade]

Ref "addon_compatible_license_license_family_id_fkey":"license_family".("id", "organization_id") <? "addon_compatible_license".("license_family_id", "organization_id") [update: cascade, delete: cascade]

Ref "addon_compatible_license_organization_id_fkey":"organization"."id" <? "addon_compatible_license"."organization_id" [update: cascade, delete: cascade]

Ref "addon_entitlement_addon_id_fkey":"addon".("id", "organization_id") <? "addon_entitlement".("addon_id", "organization_id") [update: cascade, delete: restrict]

Ref "addon_entitlement_created_by_id_fkey":"user"."id" <? "addon_entitlement"."created_by_id" [update: cascade, delete: restrict]

Ref "addon_entitlement_entitlement_id_fkey":"entitlement".("id", "organization_id") <? "addon_entitlement".("entitlement_id", "organization_id") [update: cascade, delete: restrict]

Ref "addon_entitlement_organization_id_fkey":"organization"."id" <? "addon_entitlement"."organization_id" [update: cascade, delete: cascade]

Ref "addon_entitlement_updated_by_id_fkey":"user"."id" <? "addon_entitlement"."updated_by_id" [update: cascade, delete: restrict]

Ref "addon_family_organization_id_fkey":"organization"."id" <? "addon_family"."organization_id" [update: cascade, delete: cascade]

Ref "addon_price_addon_id_fkey":"addon".("id", "organization_id") <? "addon_price".("addon_id", "organization_id") [update: cascade, delete: cascade]

Ref "addon_price_created_by_id_fkey":"user"."id" <? "addon_price"."created_by_id" [update: cascade, delete: restrict]

Ref "addon_price_meters_entitlement_id_fkey":"entitlement".("id", "organization_id") ?<? "addon_price".("meters_entitlement_id", "organization_id") [update: cascade, delete: restrict]

Ref "addon_price_organization_id_fkey":"organization"."id" <? "addon_price"."organization_id" [update: cascade, delete: cascade]

Ref "addon_price_updated_by_id_fkey":"user"."id" <? "addon_price"."updated_by_id" [update: cascade, delete: restrict]

Ref "audit_trail_actor_id_fkey":"user"."id" ?<? "audit_trail"."actor_id" [update: cascade, delete: set null]

Ref "audit_trail_instance_id_fkey":"instance"."id" ?<? "audit_trail"."instance_id" [update: cascade, delete: set null]

Ref "audit_trail_organization_id_fkey":"organization"."id" <? "audit_trail"."organization_id" [update: cascade, delete: cascade]

Ref "billing_sync_state_organization_id_fkey":"organization"."id" <? "billing_sync_state"."organization_id" [update: cascade, delete: cascade]

Ref "checkout_session_customer_id_fkey":"customer".("id", "organization_id") ?<? "checkout_session".("customer_id", "organization_id") [update: cascade, delete: cascade]

Ref "checkout_session_instance_id_fkey":"instance".("id", "organization_id") ?<? "checkout_session".("instance_id", "organization_id") [update: cascade, delete: cascade]

Ref "checkout_session_license_price_id_fkey":"license_price".("id", "organization_id") <? "checkout_session".("license_price_id", "organization_id") [update: cascade, delete: cascade]

Ref "checkout_session_organization_id_fkey":"organization"."id" <? "checkout_session"."organization_id" [update: cascade, delete: cascade]

Ref "checkout_session_publishable_key_id_fkey":"publishable_key".("id", "organization_id") <? "checkout_session".("publishable_key_id", "organization_id") [update: cascade, delete: cascade]

Ref "component_created_by_fkey":"user"."id" <? "component"."created_by_id" [update: cascade, delete: restrict]

Ref "component_organization_fkey":"organization"."id" <? "component"."organization_id" [update: cascade, delete: cascade]

Ref "component_release_component_fkey":"component"."id" <? "component_release"."component_id" [update: cascade, delete: restrict]

Ref "component_release_organization_fkey":"organization"."id" <? "component_release"."organization_id" [update: cascade, delete: cascade]

Ref "component_release_release_fkey":"release"."id" <? "component_release"."release_id" [update: cascade, delete: restrict]

Ref "customer_created_by_id_fkey":"user"."id" <? "customer"."created_by_id" [update: cascade, delete: restrict]

Ref "customer_organization_id_fkey":"organization"."id" <? "customer"."organization_id" [update: cascade, delete: cascade]

Ref "customer_updated_by_id_fkey":"user"."id" <? "customer"."updated_by_id" [update: cascade, delete: restrict]

Ref "customer_billing_customer_id_fkey":"customer".("id", "organization_id") <? "customer_billing".("customer_id", "organization_id") [update: cascade, delete: cascade]

Ref "customer_billing_organization_id_fkey":"organization"."id" <? "customer_billing"."organization_id" [update: cascade, delete: cascade]

Ref "customer_integrations_customer_id_fkey":"customer"."id" <? "customer_integrations"."customer_id" [update: cascade, delete: cascade]

Ref "customer_integrations_organization_id_fkey":"organization"."id" <? "customer_integrations"."organization_id" [update: cascade, delete: cascade]

Ref "customer_session_created_by_id_fkey":"user"."id" <? "customer_session"."created_by_id" [update: cascade, delete: cascade]

Ref "customer_session_customer_id_fkey":"customer".("id", "organization_id") <? "customer_session".("customer_id", "organization_id") [update: cascade, delete: cascade]

Ref "customer_session_instance_id_fkey":"instance".("id", "organization_id") ?<? "customer_session".("instance_id", "organization_id") [update: cascade, delete: cascade]

Ref "customer_session_organization_id_fkey":"organization"."id" <? "customer_session"."organization_id" [update: cascade, delete: cascade]

Ref "customer_session_revoked_by_id_fkey":"user"."id" ?<? "customer_session"."revoked_by_id" [update: cascade, delete: set null]

Ref "customer_trial_customer_id_fkey":"customer".("id", "organization_id") <? "customer_trial".("customer_id", "organization_id") [update: cascade, delete: cascade]

Ref "customer_trial_instance_id_fkey":"instance"."id" ?<? "customer_trial"."instance_id" [update: cascade, delete: set null]

Ref "customer_trial_license_family_id_fkey":"license_family".("id", "organization_id") <? "customer_trial".("license_family_id", "organization_id") [update: cascade, delete: cascade]

Ref "customer_trial_organization_id_fkey":"organization"."id" <? "customer_trial"."organization_id" [update: cascade, delete: cascade]

Ref "deployment_created_by_fkey":"user"."id" <? "deployment"."created_by_id" [update: cascade, delete: restrict]

Ref "deployment_deployment_zone_fkey":"deployment_zone"."id" <? "deployment"."deployment_zone_id" [update: cascade, delete: cascade]

Ref "deployment_organization_fkey":"organization"."id" <? "deployment"."organization_id" [update: cascade, delete: cascade]

Ref "deployment_release_fkey":"release"."id" <? "deployment"."release_id" [update: cascade, delete: restrict]

Ref "deployment_zone_created_by_id_fkey":"user"."id" <? "deployment_zone"."created_by_id" [update: cascade, delete: restrict]

Ref "deployment_zone_organization_id_fkey":"organization"."id" <? "deployment_zone"."organization_id" [update: cascade, delete: cascade]

Ref "deployment_zone_updated_by_id_fkey":"user"."id" <? "deployment_zone"."updated_by_id" [update: cascade, delete: restrict]

Ref "entitlement_organization_id_fkey":"organization"."id" <? "entitlement"."organization_id" [update: cascade, delete: cascade]

Ref "entitlement_group_organization_id_fkey":"organization"."id" <? "entitlement_group"."organization_id" [update: cascade, delete: cascade]

Ref "entitlement_group_membership_entitlement_fkey":"entitlement"."id" <? "entitlement_group_membership"."entitlement_id" [update: cascade, delete: cascade]

Ref "entitlement_group_membership_group_fkey":"entitlement_group"."id" <? "entitlement_group_membership"."entitlement_group_id" [update: cascade, delete: cascade]

Ref "entitlement_group_membership_organization_id_fkey":"organization"."id" <? "entitlement_group_membership"."organization_id" [update: cascade, delete: cascade]

Ref "entitlement_usage_entitlement_id_fkey":"entitlement"."id" <? "entitlement_usage"."entitlement_id" [update: cascade, delete: cascade]

Ref "entitlement_usage_instance_id_fkey":"instance"."id" <? "entitlement_usage"."instance_id" [update: cascade, delete: cascade]

Ref "entitlement_usage_organization_id_fkey":"organization"."id" <? "entitlement_usage"."organization_id" [update: cascade, delete: cascade]

Ref "feature_flags_organization_id_fkey":"organization"."id" <? "feature_flags"."organization_id" [update: cascade, delete: cascade]

Ref "inbox_events_organization_id_fkey":"organization"."id" <? "inbox_events"."organization_id" [update: cascade, delete: cascade]

Ref "instance_created_by_id_fkey":"user"."id" <? "instance"."created_by_id" [update: cascade, delete: restrict]

Ref "instance_customer_id_fkey":"customer".("id", "organization_id") <? "instance".("customer_id", "organization_id") [update: cascade, delete: cascade]

Ref "instance_deployment_zone_id_fkey":"deployment_zone".("id", "organization_id") ?<? "instance".("deployment_zone_id", "organization_id") [update: cascade, delete: set null]

Ref "instance_license_id_fkey":"license".("id", "organization_id") <? "instance".("license_id", "organization_id") [update: cascade, delete: restrict]

Ref "instance_organization_id_fkey":"organization"."id" <? "instance"."organization_id" [update: cascade, delete: cascade]

Ref "instance_updated_by_id_fkey":"user"."id" <? "instance"."updated_by_id" [update: cascade, delete: restrict]

Ref "instance_addon_addon_id_fkey":"addon".("id", "family_id", "organization_id") <? "instance_addon".("addon_id", "addon_family_id", "organization_id") [update: cascade, delete: restrict]

Ref "instance_addon_created_by_id_fkey":"user"."id" <? "instance_addon"."created_by_id" [update: cascade, delete: restrict]

Ref "instance_addon_instance_id_fkey":"instance".("id", "organization_id") <? "instance_addon".("instance_id", "organization_id") [update: cascade, delete: cascade]

Ref "instance_addon_organization_id_fkey":"organization"."id" <? "instance_addon"."organization_id" [update: cascade, delete: cascade]

Ref "instance_addon_removed_by_id_fkey":"user"."id" ?<? "instance_addon"."removed_by_id" [update: cascade, delete: set null]

Ref "instance_addon_updated_by_id_fkey":"user"."id" <? "instance_addon"."updated_by_id" [update: cascade, delete: restrict]

Ref "instance_billing_base_license_price_id_fkey":"license_price".("id", "organization_id") <? "instance_billing".("base_license_price_id", "organization_id") [update: cascade, delete: restrict]

Ref "instance_billing_created_by_id_fkey":"user"."id" <? "instance_billing"."created_by_id" [update: cascade, delete: restrict]

Ref "instance_billing_customer_id_fkey":"customer"."id" ?<? "instance_billing"."customer_id" [update: cascade, delete: set null]

Ref "instance_billing_instance_id_fkey":"instance"."id" ?<? "instance_billing"."instance_id" [update: cascade, delete: set null]

Ref "instance_billing_organization_id_fkey":"organization"."id" <? "instance_billing"."organization_id" [update: cascade, delete: cascade]

Ref "instance_billing_pending_license_id_fkey":"license".("id", "organization_id") ?<? "instance_billing".("pending_license_id", "organization_id") [update: cascade, delete: restrict]

Ref "instance_billing_scheduled_license_price_id_fkey":"license_price".("id", "organization_id") ?<? "instance_billing".("scheduled_license_price_id", "organization_id") [update: cascade, delete: restrict]

Ref "instance_billing_updated_by_id_fkey":"user"."id" <? "instance_billing"."updated_by_id" [update: cascade, delete: restrict]

Ref "instance_entitlement_exception_created_by_id_fkey":"user"."id" <? "instance_entitlement_exception"."created_by_id" [update: cascade, delete: restrict]

Ref "instance_entitlement_exception_entitlement_id_fkey":"entitlement".("id", "organization_id") <? "instance_entitlement_exception".("entitlement_id", "organization_id") [update: cascade, delete: cascade]

Ref "instance_entitlement_exception_instance_id_fkey":"instance".("id", "organization_id") <? "instance_entitlement_exception".("instance_id", "organization_id") [update: cascade, delete: cascade]

Ref "instance_entitlement_exception_organization_id_fkey":"organization"."id" <? "instance_entitlement_exception"."organization_id" [update: cascade, delete: cascade]

Ref "instance_entitlement_exception_revoked_by_id_fkey":"user"."id" ?<? "instance_entitlement_exception"."revoked_by_id" [update: cascade, delete: restrict]

Ref "instance_integrations_instance_id_fkey":"instance"."id" <? "instance_integrations"."instance_id" [update: cascade, delete: cascade]

Ref "instance_integrations_organization_id_fkey":"organization"."id" <? "instance_integrations"."organization_id" [update: cascade, delete: cascade]

Ref "instance_invoice_customer_id_fkey":"customer"."id" ?<? "instance_invoice"."customer_id" [update: cascade, delete: set null]

Ref "instance_invoice_handoff_acknowledged_by_id_fkey":"user"."id" ?<? "instance_invoice"."handoff_acknowledged_by_id" [update: cascade, delete: set null]

Ref "instance_invoice_hold_released_by_id_fkey":"user"."id" ?<? "instance_invoice"."hold_released_by_id" [update: cascade, delete: set null]

Ref "instance_invoice_instance_billing_id_fkey":"instance_billing".("id", "organization_id") <? "instance_invoice".("instance_billing_id", "organization_id") [update: cascade]

Ref "instance_invoice_marked_paid_by_id_fkey":"user"."id" ?<? "instance_invoice"."marked_paid_by_id" [update: cascade, delete: set null]

Ref "instance_invoice_organization_id_fkey":"organization"."id" <? "instance_invoice"."organization_id" [update: cascade, delete: cascade]

Ref "instance_invoice_replaces_invoice_id_fkey":"instance_invoice".("id", "organization_id") ?<? "instance_invoice".("replaces_invoice_id", "organization_id") [update: cascade]

Ref "instance_invoice_voided_by_id_fkey":"user"."id" ?<? "instance_invoice"."voided_by_id" [update: cascade, delete: set null]

Ref "instance_voucher_instance_id_fkey":"instance".("id", "organization_id") <? "instance_voucher".("instance_id", "organization_id") [update: cascade, delete: cascade]

Ref "instance_voucher_organization_id_fkey":"organization"."id" <? "instance_voucher"."organization_id" [update: cascade, delete: cascade]

Ref "instance_voucher_redeemed_by_id_fkey":"user"."id" <? "instance_voucher"."redeemed_by_id" [update: cascade, delete: restrict]

Ref "instance_voucher_revoked_by_id_fkey":"user"."id" ?<? "instance_voucher"."revoked_by_id" [update: cascade, delete: set null]

Ref "instance_voucher_voucher_id_fkey":"voucher".("id", "organization_id") <? "instance_voucher".("voucher_id", "organization_id") [update: cascade, delete: restrict]

Ref "license_family_id_fkey":"license_family".("id", "organization_id") <? "license".("family_id", "organization_id") [update: cascade, delete: cascade]

Ref "license_organization_id_fkey":"organization"."id" <? "license"."organization_id" [update: cascade, delete: cascade]

Ref "license_entitlement_created_by_id_fkey":"user"."id" <? "license_entitlement"."created_by_id" [update: cascade, delete: restrict]

Ref "license_entitlement_entitlement_id_fkey":"entitlement"."id" <? "license_entitlement"."entitlement_id" [update: cascade, delete: restrict]

Ref "license_entitlement_license_id_fkey":"license"."id" <? "license_entitlement"."license_id" [update: cascade, delete: restrict]

Ref "license_entitlement_organization_id_fkey":"organization"."id" <? "license_entitlement"."organization_id" [update: cascade, delete: cascade]

Ref "license_entitlement_updated_by_id_fkey":"user"."id" <? "license_entitlement"."updated_by_id" [update: cascade, delete: restrict]

Ref "license_family_fallback_license_family_id_fkey":"license_family".("id", "organization_id") ?<? "license_family".("fallback_license_family_id", "organization_id") [update: cascade, delete: restrict]

Ref "license_family_organization_id_fkey":"organization"."id" <? "license_family"."organization_id" [update: cascade, delete: cascade]

Ref "license_price_created_by_id_fkey":"user"."id" <? "license_price"."created_by_id" [update: cascade, delete: restrict]

Ref "license_price_license_id_fkey":"license".("id", "organization_id") <? "license_price".("license_id", "organization_id") [update: cascade, delete: cascade]

Ref "license_price_meters_entitlement_id_fkey":"entitlement".("id", "organization_id") ?<? "license_price".("meters_entitlement_id", "organization_id") [update: cascade, delete: restrict]

Ref "license_price_organization_id_fkey":"organization"."id" <? "license_price"."organization_id" [update: cascade, delete: cascade]

Ref "license_price_updated_by_id_fkey":"user"."id" <? "license_price"."updated_by_id" [update: cascade, delete: restrict]

Ref "metadata_field_created_by_id_fkey":"user"."id" <? "metadata_field"."created_by_id" [update: cascade, delete: restrict]

Ref "metadata_field_organization_id_fkey":"organization"."id" <? "metadata_field"."organization_id" [update: cascade, delete: cascade]

Ref "metadata_field_updated_by_id_fkey":"user"."id" <? "metadata_field"."updated_by_id" [update: cascade, delete: restrict]

Ref "notification_preference_user_id_fkey":"user"."id" <? "notification_preference"."user_id" [update: cascade, delete: cascade]

Ref "notification_read_audit_trail_id_fkey":"audit_trail"."id" <? "notification_read"."audit_trail_id" [update: cascade, delete: cascade]

Ref "notification_read_user_id_fkey":"user"."id" <? "notification_read"."user_id" [update: cascade, delete: cascade]

Ref "notification_user_state_user_id_fkey":"user"."id" <? "notification_user_state"."user_id" [update: cascade, delete: cascade]

Ref "organization_billing_settings_created_by_id_fkey":"user"."id" <? "organization_billing_settings"."created_by_id" [update: cascade, delete: restrict]

Ref "organization_billing_settings_organization_id_fkey":"organization"."id" <? "organization_billing_settings"."organization_id" [update: cascade, delete: cascade]

Ref "organization_billing_settings_updated_by_id_fkey":"user"."id" <? "organization_billing_settings"."updated_by_id" [update: cascade, delete: restrict]

Ref "organization_connector_connector_name_fkey":"connector"."name" <? "organization_connector"."connector_name" [update: cascade, delete: cascade]

Ref "organization_connector_organization_id_fkey":"organization"."id" <? "organization_connector"."organization_id" [update: cascade, delete: cascade]

Ref "outbox_events_organization_id_fkey":"organization"."id" <? "outbox_events"."organization_id" [update: cascade, delete: cascade]

Ref "publishable_key_created_by_id_fkey":"user"."id" <? "publishable_key"."created_by_id" [update: cascade, delete: restrict]

Ref "publishable_key_organization_id_fkey":"organization"."id" <? "publishable_key"."organization_id" [update: cascade, delete: cascade]

Ref "publishable_key_revoked_by_id_fkey":"user"."id" ?<? "publishable_key"."revoked_by_id" [update: cascade, delete: restrict]

Ref "publishable_key_updated_by_id_fkey":"user"."id" <? "publishable_key"."updated_by_id" [update: cascade, delete: restrict]

Ref "previous_release_fkey":"release"."id" ?<? "release"."previous_release_id" [update: cascade, delete: restrict]

Ref "release_created_by_fkey":"user"."id" <? "release"."created_by_id" [update: cascade, delete: restrict]

Ref "release_organization_fkey":"organization"."id" <? "release"."organization_id" [update: cascade, delete: cascade]

Ref "token_created_by_fkey":"user"."id" <? "token"."created_by" [update: cascade, delete: cascade]

Ref "token_issued_by_platform_token_id_fkey":"token"."id" ?<? "token"."issued_by_platform_token_id" [delete: set null]

Ref "token_organization_id_fkey":"organization"."id" ?<? "token"."organization_id" [update: cascade, delete: cascade]

Ref "token_revoked_by_fkey":"user"."id" ?<? "token"."revoked_by" [update: cascade, delete: set null]

Ref "token_service_account_id_fkey":"user"."id" <? "token"."service_account_id" [update: cascade, delete: cascade]

Ref "usage_ledger_organization_id_fkey":"organization"."id" <? "usage_ledger"."organization_id" [update: cascade, delete: cascade]

Ref "user_created_by_id_fkey":"user"."id" ?<? "user"."created_by_id" [update: cascade, delete: set null]

Ref "user_organization_id_fkey":"organization"."id" ?<? "user"."organization_id" [update: cascade, delete: cascade]

Ref "user_managed_profile_user_id_fkey":"user"."id" <? "user_managed_profile"."user_id" [delete: cascade]

Ref "user_on_organization_organization_id_fkey":"organization"."id" <? "user_on_organization"."organization_id" [update: cascade, delete: cascade]

Ref "user_on_organization_user_id_fkey":"user"."id" <? "user_on_organization"."user_id" [update: cascade, delete: restrict]

Ref "user_organization_authorization_organization_id_user_id_fkey":"user_on_organization".("organization_id", "user_id") <? "user_organization_authorization".("organization_id", "user_id") [update: cascade, delete: cascade]

Ref "user_organization_role_organization_id_fkey":"organization"."id" <? "user_organization_role"."organization_id" [delete: cascade]

Ref "voucher_created_by_id_fkey":"user"."id" <? "voucher"."created_by_id" [update: cascade, delete: restrict]

Ref "voucher_organization_id_fkey":"organization"."id" <? "voucher"."organization_id" [update: cascade, delete: cascade]

Ref "voucher_restricted_customer_id_fkey":"customer".("id", "organization_id") ?<? "voucher".("restricted_customer_id", "organization_id") [update: cascade, delete: cascade]

Ref "voucher_updated_by_id_fkey":"user"."id" <? "voucher"."updated_by_id" [update: cascade, delete: restrict]

Ref "voucher_entitlement_grant_entitlement_id_fkey":"entitlement".("id", "organization_id") <? "voucher_entitlement_grant".("entitlement_id", "organization_id") [update: cascade, delete: restrict]

Ref "voucher_entitlement_grant_organization_id_fkey":"organization"."id" <? "voucher_entitlement_grant"."organization_id" [update: cascade, delete: cascade]

Ref "voucher_entitlement_grant_voucher_id_fkey":"voucher".("id", "voucher_type", "organization_id") <? "voucher_entitlement_grant".("voucher_id", "voucher_type", "organization_id") [update: cascade, delete: cascade]

Ref "voucher_flag_grant_flag_id_fkey":"feature_flags".("id", "organization_id") <? "voucher_flag_grant".("flag_id", "organization_id") [update: cascade, delete: restrict]

Ref "voucher_flag_grant_organization_id_fkey":"organization"."id" <? "voucher_flag_grant"."organization_id" [update: cascade, delete: cascade]

Ref "voucher_flag_grant_voucher_id_fkey":"voucher".("id", "voucher_type", "organization_id") <? "voucher_flag_grant".("voucher_id", "voucher_type", "organization_id") [update: cascade, delete: cascade]
```

## Partitioned tables

The DBML above shows each of these once, as the table its partitions share: the same columns, constraints and indexes, under the same names. The partitions themselves are left out.

- `usage_ledger`: `RANGE (reported_at)`

## Partial indexes

The DBML above renders these without their `WHERE` clause, as plain indexes -- a partial unique index on one column even shows up as a unique column. Each one only covers the rows its condition selects.

- `addon_family_id_is_default_key`: `CREATE UNIQUE INDEX addon_family_id_is_default_key ON public.addon USING btree (family_id) WHERE is_default`
- `addon_price_addon_id_billing_period_default_key`: `CREATE UNIQUE INDEX addon_price_addon_id_billing_period_default_key ON public.addon_price USING btree (addon_id, billing_period) WHERE is_default`
- `customer_org_external_id_idx`: `CREATE INDEX customer_org_external_id_idx ON public.customer USING btree (organization_id, external_customer_id) WHERE (external_customer_id IS NOT NULL)`
- `idx_addon_family_public`: `CREATE INDEX idx_addon_family_public ON public.addon_family USING btree (organization_id) WHERE is_public`
- `idx_addon_price_meters_entitlement`: `CREATE INDEX idx_addon_price_meters_entitlement ON public.addon_price USING btree (meters_entitlement_id) WHERE (meters_entitlement_id IS NOT NULL)`
- `idx_audit_trail_changes`: `CREATE INDEX idx_audit_trail_changes ON public.audit_trail USING btree (organization_id, occurred_at DESC, id DESC) WHERE (event_name <> ALL ('{ENTITLEMENT_VALUE_GET,ENTITLEMENT_USAGE_REPORT_ACCEPTED,ENTITLEMENT_USAGE_REPORT_REJECTED,FEATURE_FLAG_EVALUATED,INSTANCE_ENTITLEMENT_USAGE_PERIOD_ROLLED_OVER,INSTANCE_ENTITLEMENT_USAGE_WARNING_THRESHOLD_REACHED,INSTANCE_ENTITLEMENT_USAGE_REACHED,INSTANCE_ENTITLEMENT_CAP_EXCEEDED}'::text[]))`
- `idx_checkout_session_closed_at`: `CREATE INDEX idx_checkout_session_closed_at ON public.checkout_session USING btree (closed_at) WHERE (closed_at IS NOT NULL)`
- `idx_checkout_session_customer`: `CREATE INDEX idx_checkout_session_customer ON public.checkout_session USING btree (customer_id) WHERE (customer_id IS NOT NULL)`
- `idx_checkout_session_instance`: `CREATE INDEX idx_checkout_session_instance ON public.checkout_session USING btree (instance_id) WHERE (instance_id IS NOT NULL)`
- `idx_checkout_session_open_expires_at`: `CREATE INDEX idx_checkout_session_open_expires_at ON public.checkout_session USING btree (expires_at) WHERE (status = 'OPEN'::checkout_session_status)`
- `idx_checkout_session_organization_client_reference`: `CREATE INDEX idx_checkout_session_organization_client_reference ON public.checkout_session USING btree (organization_id, client_reference_id) WHERE (client_reference_id IS NOT NULL)`
- `idx_checkout_session_setup_completed`: `CREATE INDEX idx_checkout_session_setup_completed ON public.checkout_session USING btree (setup_completed_at) WHERE ((status = 'OPEN'::checkout_session_status) AND (setup_completed_at IS NOT NULL))`
- `idx_customer_billing_email_normalized`: `CREATE INDEX idx_customer_billing_email_normalized ON public.customer USING btree (organization_id, lower(billing_email)) WHERE (billing_email IS NOT NULL)`
- `idx_customer_billing_payment_method_expiry`: `CREATE INDEX idx_customer_billing_payment_method_expiry ON public.customer_billing USING btree (payment_method_exp_year, payment_method_exp_month) WHERE (payment_method_status = 'ACTIVE'::payment_method_status)`
- `idx_customer_session_lookup_hash_active`: `CREATE UNIQUE INDEX idx_customer_session_lookup_hash_active ON public.customer_session USING btree (lookup_hash) INCLUDE (organization_id, customer_id, instance_id, expires_at) WHERE (revoked_at IS NULL)`
- `idx_customer_trial_instance`: `CREATE INDEX idx_customer_trial_instance ON public.customer_trial USING btree (instance_id) WHERE (instance_id IS NOT NULL)`
- `idx_instance_billing_customer`: `CREATE INDEX idx_instance_billing_customer ON public.instance_billing USING btree (customer_id) WHERE (customer_id IS NOT NULL)`
- `idx_instance_billing_incomplete_expires_at`: `CREATE INDEX idx_instance_billing_incomplete_expires_at ON public.instance_billing USING btree (incomplete_expires_at) WHERE (incomplete_expires_at IS NOT NULL)`
- `idx_instance_billing_pending_license`: `CREATE INDEX idx_instance_billing_pending_license ON public.instance_billing USING btree (pending_license_id) WHERE (pending_license_id IS NOT NULL)`
- `idx_instance_billing_period_end_live`: `CREATE INDEX idx_instance_billing_period_end_live ON public.instance_billing USING btree (current_period_end) WHERE (status = ANY (ARRAY['TRIAL'::instance_billing_status, 'ACTIVE'::instance_billing_status, 'PAST_DUE'::instance_billing_status]))`
- `idx_instance_billing_scheduled_license_price`: `CREATE INDEX idx_instance_billing_scheduled_license_price ON public.instance_billing USING btree (scheduled_license_price_id) WHERE (scheduled_license_price_id IS NOT NULL)`
- `idx_instance_billing_trial_will_end_at`: `CREATE INDEX idx_instance_billing_trial_will_end_at ON public.instance_billing USING btree (trial_will_end_at) WHERE ((status = 'TRIAL'::instance_billing_status) AND (trial_will_end_notified_at IS NULL))`
- `idx_instance_entitlement_exception_expiry`: `CREATE INDEX idx_instance_entitlement_exception_expiry ON public.instance_entitlement_exception USING btree (ends_at) WHERE ((revoked_at IS NULL) AND (ends_at IS NOT NULL) AND (expired_notified_at IS NULL))`
- `idx_instance_invoice_customer_boundary`: `CREATE INDEX idx_instance_invoice_customer_boundary ON public.instance_invoice USING btree (customer_id, boundary_at DESC, id DESC) WHERE (customer_id IS NOT NULL)`
- `idx_instance_invoice_handoff_pending`: `CREATE INDEX idx_instance_invoice_handoff_pending ON public.instance_invoice USING btree (organization_id, issued_at, id) WHERE (handoff_status = 'PENDING'::handoff_status)`
- `idx_instance_invoice_held`: `CREATE INDEX idx_instance_invoice_held ON public.instance_invoice USING btree (instance_billing_id) WHERE (hold_reason IS NOT NULL)`
- `idx_instance_invoice_open_due_at`: `CREATE INDEX idx_instance_invoice_open_due_at ON public.instance_invoice USING btree (due_at) WHERE (status = ANY (ARRAY['PUSHED'::invoice_status, 'MANUAL'::invoice_status, 'PAYMENT_FAILED'::invoice_status]))`
- `idx_instance_invoice_org_handoff_reclaimed_at`: `CREATE INDEX idx_instance_invoice_org_handoff_reclaimed_at ON public.instance_invoice USING btree (organization_id, handoff_reclaimed_at) WHERE (handoff_reclaimed_at IS NOT NULL)`
- `idx_instance_invoice_org_open_due_at`: `CREATE INDEX idx_instance_invoice_org_open_due_at ON public.instance_invoice USING btree (organization_id, due_at) WHERE (status = ANY (ARRAY['PUSHED'::invoice_status, 'MANUAL'::invoice_status, 'PAYMENT_FAILED'::invoice_status]))`
- `idx_instance_invoice_provider_open`: `CREATE INDEX idx_instance_invoice_provider_open ON public.instance_invoice USING btree (provider_kind, synced_at) WHERE (status = ANY (ARRAY['PUSHED'::invoice_status, 'PAYMENT_FAILED'::invoice_status]))`
- `idx_instance_invoice_push_queue`: `CREATE INDEX idx_instance_invoice_push_queue ON public.instance_invoice USING btree (next_push_at) WHERE ((provider_kind <> 'NOOP'::billing_provider_kind) AND (status = ANY (ARRAY['DRAFT'::invoice_status, 'PUSH_FAILED'::invoice_status])) AND (hold_reason IS NULL))`
- `idx_instance_voucher_active_expires_at`: `CREATE INDEX idx_instance_voucher_active_expires_at ON public.instance_voucher USING btree (effective_expires_at) WHERE ((status = 'ACTIVE'::instance_voucher_status) AND (effective_expires_at IS NOT NULL))`
- `idx_instance_voucher_instance_active`: `CREATE INDEX idx_instance_voucher_instance_active ON public.instance_voucher USING btree (instance_id, voucher_id) WHERE (status = 'ACTIVE'::instance_voucher_status)`
- `idx_license_family_fallback`: `CREATE INDEX idx_license_family_fallback ON public.license_family USING btree (fallback_license_family_id) WHERE (fallback_license_family_id IS NOT NULL)`
- `idx_license_family_public`: `CREATE INDEX idx_license_family_public ON public.license_family USING btree (organization_id) WHERE is_public`
- `idx_license_price_meters_entitlement`: `CREATE INDEX idx_license_price_meters_entitlement ON public.license_price USING btree (meters_entitlement_id) WHERE (meters_entitlement_id IS NOT NULL)`
- `idx_metadata_field_org_resource`: `CREATE INDEX idx_metadata_field_org_resource ON public.metadata_field USING btree (organization_id, resource_type) WHERE (archived_at IS NULL)`
- `idx_publishable_key_lookup_hash_active`: `CREATE UNIQUE INDEX idx_publishable_key_lookup_hash_active ON public.publishable_key USING btree (lookup_hash) INCLUDE (organization_id, allowed_origins) WHERE (revoked_at IS NULL)`
- `idx_token_issued_by_platform_active`: `CREATE INDEX idx_token_issued_by_platform_active ON public.token USING btree (issued_by_platform_token_id) WHERE (revoked_date IS NULL)`
- `idx_token_lookup_hash_active`: `CREATE UNIQUE INDEX idx_token_lookup_hash_active ON public.token USING btree (lookup_hash) INCLUDE (hash, service_account_id, organization_id, scopes, expires_at) WHERE (revoked_date IS NULL)`
- `idx_token_platform_lookup_hash_active`: `CREATE UNIQUE INDEX idx_token_platform_lookup_hash_active ON public.token USING btree (lookup_hash) INCLUDE (hash, service_account_id, scopes, expires_at) WHERE ((kind = 'platform'::token_kind) AND (revoked_date IS NULL))`
- `idx_unique_machine_slug_per_org`: `CREATE UNIQUE INDEX idx_unique_machine_slug_per_org ON public."user" USING btree (slug, organization_id) WHERE (type = 'machine'::user_type)`
- `idx_unique_orgless_machine_slug`: `CREATE UNIQUE INDEX idx_unique_orgless_machine_slug ON public."user" USING btree (slug) WHERE ((type = 'machine'::user_type) AND (organization_id IS NULL))`
- `idx_usage_ledger_transaction_id`: `CREATE INDEX idx_usage_ledger_transaction_id ON public.usage_ledger USING btree (instance_id, entitlement_id, transaction_id, reported_at) WHERE (transaction_id IS NOT NULL)`
- `idx_voucher_active_expires_at`: `CREATE INDEX idx_voucher_active_expires_at ON public.voucher USING btree (expires_at) WHERE ((status = 'ACTIVE'::voucher_status) AND (expires_at IS NOT NULL))`
- `idx_voucher_restricted_customer`: `CREATE INDEX idx_voucher_restricted_customer ON public.voucher USING btree (restricted_customer_id) WHERE (restricted_customer_id IS NOT NULL)`
- `instance_addon_instance_id_addon_family_id_active_key`: `CREATE UNIQUE INDEX instance_addon_instance_id_addon_family_id_active_key ON public.instance_addon USING btree (instance_id, addon_family_id) WHERE (removed_at IS NULL)`
- `instance_invoice_boundary_key`: `CREATE UNIQUE INDEX instance_invoice_boundary_key ON public.instance_invoice USING btree (instance_billing_id, kind, boundary_at) WHERE (status <> 'VOID'::invoice_status)`
- `instance_invoice_external_invoice_key`: `CREATE UNIQUE INDEX instance_invoice_external_invoice_key ON public.instance_invoice USING btree (provider_kind, external_invoice_id) WHERE (external_invoice_id IS NOT NULL)`
- `instance_invoice_replaces_invoice_id_key`: `CREATE UNIQUE INDEX instance_invoice_replaces_invoice_id_key ON public.instance_invoice USING btree (replaces_invoice_id) WHERE (replaces_invoice_id IS NOT NULL)`
- `license_family_id_is_default_key`: `CREATE UNIQUE INDEX license_family_id_is_default_key ON public.license USING btree (family_id) WHERE is_default`
- `license_price_license_id_billing_period_default_key`: `CREATE UNIQUE INDEX license_price_license_id_billing_period_default_key ON public.license_price USING btree (license_id, billing_period) WHERE is_default`
- `token_name`: `CREATE UNIQUE INDEX token_name ON public.token USING btree (service_account_id, name, organization_id) WHERE (revoked_date IS NULL)`
- `uq_metadata_field_key_active`: `CREATE UNIQUE INDEX uq_metadata_field_key_active ON public.metadata_field USING btree (organization_id, resource_type, key) WHERE (archived_at IS NULL)`
- `uq_token_platform_name_active`: `CREATE UNIQUE INDEX uq_token_platform_name_active ON public.token USING btree (name) WHERE ((kind = 'platform'::token_kind) AND (revoked_date IS NULL))`
- `uq_token_platform_slug`: `CREATE UNIQUE INDEX uq_token_platform_slug ON public.token USING btree (slug) WHERE (kind = 'platform'::token_kind)`

## Covering indexes

The DBML above lists each of these with its key columns only. The `INCLUDE` columns are stored in the index, to answer a query without reading the table; they are not part of its key, and take no part in its uniqueness.

- `idx_checkout_session_lookup_hash`: `CREATE UNIQUE INDEX idx_checkout_session_lookup_hash ON public.checkout_session USING btree (lookup_hash) INCLUDE (organization_id, status)`
- `idx_customer_session_lookup_hash_active`: `CREATE UNIQUE INDEX idx_customer_session_lookup_hash_active ON public.customer_session USING btree (lookup_hash) INCLUDE (organization_id, customer_id, instance_id, expires_at) WHERE (revoked_at IS NULL)`
- `idx_publishable_key_lookup_hash_active`: `CREATE UNIQUE INDEX idx_publishable_key_lookup_hash_active ON public.publishable_key USING btree (lookup_hash) INCLUDE (organization_id, allowed_origins) WHERE (revoked_at IS NULL)`
- `idx_token_lookup_hash_active`: `CREATE UNIQUE INDEX idx_token_lookup_hash_active ON public.token USING btree (lookup_hash) INCLUDE (hash, service_account_id, organization_id, scopes, expires_at) WHERE (revoked_date IS NULL)`
- `idx_token_platform_lookup_hash_active`: `CREATE UNIQUE INDEX idx_token_platform_lookup_hash_active ON public.token USING btree (lookup_hash) INCLUDE (hash, service_account_id, scopes, expires_at) WHERE ((kind = 'platform'::token_kind) AND (revoked_date IS NULL))`
- `idx_usage_ledger_pair_reported_at`: `CREATE INDEX idx_usage_ledger_pair_reported_at ON public.usage_ledger USING btree (instance_id, entitlement_id, reported_at) INCLUDE (report_seq, window_start, window_end, value_before, value_after, limit_value)`
