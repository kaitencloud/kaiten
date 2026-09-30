# Database Schema

> Auto-generated. Run `task schema-docs` to update.

```dbml
Enum "aggregation_method" {
  "SUM"
  "COUNT"
  "AVERAGE"
  "MAX"
  "MIN"
  "LATEST"
}

Enum "entitlement_reset_anchor" {
  "CALENDAR"
  "LICENSE_START"
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

Enum "instance_status" {
  "HEALTHY"
  "DEGRADED"
  "INCIDENT"
  "MAINTENANCE"
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

Enum "token_kind" {
  "organization"
  "platform"
}

Enum "user_type" {
  "human"
  "machine"
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

  Indexes {
    (id, organization_id) [type: btree, unique, name: "customer_id_organization_id_key"]
    (organization_id, slug) [type: btree, unique, name: "customer_organization_id_slug_key"]
    (organization_id, external_customer_id) [type: btree, name: "customer_org_external_id_idx"]
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
  }

  Indexes {
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
    (organization_id, slug) [type: btree, unique, name: "instance_organization_id_slug_key"]
  }
}

Table "entitlement_usage" {
  "entitlement_id" uuid [not null]
  "instance_id" uuid [not null]
  "value" jsonb [not null, check: `(jsonb_typeof(value) = 'object'::text) AND (value ? 'type'::text) AND (value ? 'value'::text) AND (value ? 'event_count'::text) AND ((value ->> 'type'::text) = 'number'::text) AND (jsonb_typeof((value -> 'value'::text)) = 'number'::text) AND (jsonb_typeof((value -> 'event_count'::text)) = 'number'::text) AND (((value ->> 'event_count'::text))::numeric >= (0)::numeric) AND (floor(((value ->> 'event_count'::text))::numeric) = ((value ->> 'event_count'::text))::numeric)`]
  "organization_id" uuid [not null]
  "period_start" timestamp

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

  Indexes {
    (organization_id, event_name, occurred_at, id) [type: btree, name: "idx_audit_trail_feed"]
    occurred_at [type: btree, name: "idx_audit_trail_occurred_at"]
    (organization_id, instance_id) [type: btree, name: "idx_audit_trail_org_instance"]
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
  "scopes" "text[]" [not null, default: 'ARRAY[text[]']
  "kind" token_kind [not null, default: 'organization']
  "issued_by_platform_token_id" uuid

  Checks {
    `((kind = 'organization'::token_kind) AND (organization_id IS NOT NULL)) OR ((kind = 'platform'::token_kind) AND (organization_id IS NULL) AND (service_account_id = '00000000-0000-0000-0000-000000000001'::uuid))` [name: 'token_platform_is_orgless_system']
    `(kind = 'organization'::token_kind) OR (issued_by_platform_token_id IS NULL)` [name: 'token_platform_has_no_parent']
  }

  Indexes {
    (lookup_hash, hash, service_account_id, organization_id, scopes, expires_at) [type: btree, unique, name: "idx_token_lookup_hash_active"]
    (lookup_hash, hash, service_account_id, scopes, expires_at) [type: btree, unique, name: "idx_token_platform_lookup_hash_active"]
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

Table "license_family" {
  "id" uuid [pk, not null, default: `gen_random_uuid()`]
  "organization_id" uuid [not null]
  "slug" text [not null]
  "last_version" int4 [not null, default: 0]
  "created_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]
  "updated_at" timestamp [not null, default: `CURRENT_TIMESTAMP`]

  Indexes {
    (id, organization_id) [type: btree, unique, name: "license_family_id_organization_id_key"]
    (organization_id, slug) [type: btree, unique, name: "license_family_organization_id_slug_key"]
    (organization_id, created_at, id) [type: btree, name: "idx_license_family_org_created_at"]
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

Ref "audit_trail_instance_id_fkey":"instance"."id" ?<? "audit_trail"."instance_id" [update: cascade, delete: set null]

Ref "audit_trail_organization_id_fkey":"organization"."id" <? "audit_trail"."organization_id" [update: cascade, delete: cascade]

Ref "component_created_by_fkey":"user"."id" <? "component"."created_by_id" [update: cascade, delete: restrict]

Ref "component_organization_fkey":"organization"."id" <? "component"."organization_id" [update: cascade, delete: cascade]

Ref "component_release_component_fkey":"component"."id" <? "component_release"."component_id" [update: cascade, delete: restrict]

Ref "component_release_organization_fkey":"organization"."id" <? "component_release"."organization_id" [update: cascade, delete: cascade]

Ref "component_release_release_fkey":"release"."id" <? "component_release"."release_id" [update: cascade, delete: restrict]

Ref "customer_created_by_id_fkey":"user"."id" <? "customer"."created_by_id" [update: cascade, delete: restrict]

Ref "customer_organization_id_fkey":"organization"."id" <? "customer"."organization_id" [update: cascade, delete: cascade]

Ref "customer_updated_by_id_fkey":"user"."id" <? "customer"."updated_by_id" [update: cascade, delete: restrict]

Ref "customer_integrations_customer_id_fkey":"customer"."id" <? "customer_integrations"."customer_id" [update: cascade, delete: cascade]

Ref "customer_integrations_organization_id_fkey":"organization"."id" <? "customer_integrations"."organization_id" [update: cascade, delete: cascade]

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

Ref "entitlement_usage_entitlement_id_fkey":"entitlement"."id" <? "entitlement_usage"."entitlement_id" [update: cascade, delete: restrict]

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

Ref "instance_integrations_instance_id_fkey":"instance"."id" <? "instance_integrations"."instance_id" [update: cascade, delete: cascade]

Ref "instance_integrations_organization_id_fkey":"organization"."id" <? "instance_integrations"."organization_id" [update: cascade, delete: cascade]

Ref "license_family_id_fkey":"license_family".("id", "organization_id") <? "license".("family_id", "organization_id") [update: cascade, delete: cascade]

Ref "license_organization_id_fkey":"organization"."id" <? "license"."organization_id" [update: cascade, delete: cascade]

Ref "license_entitlement_created_by_id_fkey":"user"."id" <? "license_entitlement"."created_by_id" [update: cascade, delete: restrict]

Ref "license_entitlement_entitlement_id_fkey":"entitlement"."id" <? "license_entitlement"."entitlement_id" [update: cascade, delete: restrict]

Ref "license_entitlement_license_id_fkey":"license"."id" <? "license_entitlement"."license_id" [update: cascade, delete: restrict]

Ref "license_entitlement_organization_id_fkey":"organization"."id" <? "license_entitlement"."organization_id" [update: cascade, delete: cascade]

Ref "license_entitlement_updated_by_id_fkey":"user"."id" <? "license_entitlement"."updated_by_id" [update: cascade, delete: restrict]

Ref "license_family_organization_id_fkey":"organization"."id" <? "license_family"."organization_id" [update: cascade, delete: cascade]

Ref "metadata_field_created_by_id_fkey":"user"."id" <? "metadata_field"."created_by_id" [update: cascade, delete: restrict]

Ref "metadata_field_organization_id_fkey":"organization"."id" <? "metadata_field"."organization_id" [update: cascade, delete: cascade]

Ref "metadata_field_updated_by_id_fkey":"user"."id" <? "metadata_field"."updated_by_id" [update: cascade, delete: restrict]

Ref "notification_preference_user_id_fkey":"user"."id" <? "notification_preference"."user_id" [update: cascade, delete: cascade]

Ref "notification_read_audit_trail_id_fkey":"audit_trail"."id" <? "notification_read"."audit_trail_id" [update: cascade, delete: cascade]

Ref "notification_read_user_id_fkey":"user"."id" <? "notification_read"."user_id" [update: cascade, delete: cascade]

Ref "notification_user_state_user_id_fkey":"user"."id" <? "notification_user_state"."user_id" [update: cascade, delete: cascade]

Ref "organization_connector_connector_name_fkey":"connector"."name" <? "organization_connector"."connector_name" [update: cascade, delete: cascade]

Ref "organization_connector_organization_id_fkey":"organization"."id" <? "organization_connector"."organization_id" [update: cascade, delete: cascade]

Ref "outbox_events_organization_id_fkey":"organization"."id" <? "outbox_events"."organization_id" [update: cascade, delete: cascade]

Ref "previous_release_fkey":"release"."id" ?<? "release"."previous_release_id" [update: cascade, delete: restrict]

Ref "release_created_by_fkey":"user"."id" <? "release"."created_by_id" [update: cascade, delete: restrict]

Ref "release_organization_fkey":"organization"."id" <? "release"."organization_id" [update: cascade, delete: cascade]

Ref "token_created_by_fkey":"user"."id" <? "token"."created_by" [update: cascade, delete: cascade]

Ref "token_issued_by_platform_token_id_fkey":"token"."id" ?<? "token"."issued_by_platform_token_id" [delete: set null]

Ref "token_organization_id_fkey":"organization"."id" ?<? "token"."organization_id" [update: cascade, delete: cascade]

Ref "token_revoked_by_fkey":"user"."id" ?<? "token"."revoked_by" [update: cascade, delete: set null]

Ref "token_service_account_id_fkey":"user"."id" <? "token"."service_account_id" [update: cascade, delete: cascade]

Ref "user_created_by_id_fkey":"user"."id" ?<? "user"."created_by_id" [update: cascade, delete: set null]

Ref "user_organization_id_fkey":"organization"."id" ?<? "user"."organization_id" [update: cascade, delete: cascade]

Ref "user_on_organization_organization_id_fkey":"organization"."id" <? "user_on_organization"."organization_id" [update: cascade, delete: cascade]

Ref "user_on_organization_user_id_fkey":"user"."id" <? "user_on_organization"."user_id" [update: cascade, delete: restrict]
```

## Partial indexes

The DBML above renders these without their `WHERE` clause, as plain indexes -- a partial unique index on one column even shows up as a unique column. Each one only covers the rows its condition selects.

- `customer_org_external_id_idx`: `CREATE INDEX customer_org_external_id_idx ON public.customer USING btree (organization_id, external_customer_id) WHERE (external_customer_id IS NOT NULL)`
- `idx_metadata_field_org_resource`: `CREATE INDEX idx_metadata_field_org_resource ON public.metadata_field USING btree (organization_id, resource_type) WHERE (archived_at IS NULL)`
- `idx_token_issued_by_platform_active`: `CREATE INDEX idx_token_issued_by_platform_active ON public.token USING btree (issued_by_platform_token_id) WHERE (revoked_date IS NULL)`
- `idx_token_lookup_hash_active`: `CREATE UNIQUE INDEX idx_token_lookup_hash_active ON public.token USING btree (lookup_hash) INCLUDE (hash, service_account_id, organization_id, scopes, expires_at) WHERE (revoked_date IS NULL)`
- `idx_token_platform_lookup_hash_active`: `CREATE UNIQUE INDEX idx_token_platform_lookup_hash_active ON public.token USING btree (lookup_hash) INCLUDE (hash, service_account_id, scopes, expires_at) WHERE ((kind = 'platform'::token_kind) AND (revoked_date IS NULL))`
- `idx_unique_machine_slug_per_org`: `CREATE UNIQUE INDEX idx_unique_machine_slug_per_org ON public."user" USING btree (slug, organization_id) WHERE (type = 'machine'::user_type)`
- `idx_unique_orgless_machine_slug`: `CREATE UNIQUE INDEX idx_unique_orgless_machine_slug ON public."user" USING btree (slug) WHERE ((type = 'machine'::user_type) AND (organization_id IS NULL))`
- `license_family_id_is_default_key`: `CREATE UNIQUE INDEX license_family_id_is_default_key ON public.license USING btree (family_id) WHERE is_default`
- `token_name`: `CREATE UNIQUE INDEX token_name ON public.token USING btree (service_account_id, name, organization_id) WHERE (revoked_date IS NULL)`
- `uq_metadata_field_key_active`: `CREATE UNIQUE INDEX uq_metadata_field_key_active ON public.metadata_field USING btree (organization_id, resource_type, key) WHERE (archived_at IS NULL)`
- `uq_token_platform_name_active`: `CREATE UNIQUE INDEX uq_token_platform_name_active ON public.token USING btree (name) WHERE ((kind = 'platform'::token_kind) AND (revoked_date IS NULL))`
- `uq_token_platform_slug`: `CREATE UNIQUE INDEX uq_token_platform_slug ON public.token USING btree (slug) WHERE (kind = 'platform'::token_kind)`
