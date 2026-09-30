# `metadatafields` module

The typed metadata system of `DEPLOYMENT_ZONE` and `INSTANCE`. An organization
declares a schema per resource type, as a list of `MetadataField` rows, and every
writer of a `metadata` jsonb column validates its payload against that schema.

A field has a `key`, a `label`, a `displayOrder` and a `jsonSchema`, which is a
standard [JSON Schema 2020-12](https://json-schema.org/specification.html)
document. A field is never deleted: archiving sets `archived_at` and leaves the
row, so metadata written under the field stays interpretable.

## Layout

```
metadatafields/
├── validator/                 # shape, transition, compose, validate, cache
├── events/                    # METADATA_FIELD_* outbox events
├── schema/                    # public DTO (schema.go) and GraphQL types (.graphqls)
├── infrastructure/            # sqlc queries and models (db/), row to DTO mapping (dbmap/)
├── listcursor/                # cursor format shared by the REST and GraphQL lists
├── graphql/                   # the read-only metadataFields query
├── createmetadatafield/       # POST   /api/metadata-fields
├── updatemetadatafield/       # PATCH  /api/metadata-fields/{id}
├── archivemetadatafield/      # POST   /api/metadata-fields/{id}/archive
├── unarchivemetadatafield/    # POST   /api/metadata-fields/{id}/unarchive
├── dryrunmetadatafield/       # POST   /api/metadata-fields/{id}/dry-run
├── getmetadatafields/         # GET    /api/metadata-fields?resourceType=...
├── reordermetadatafields/     # POST   /api/metadata-fields/reorder
└── metadatafield_module.go    # UseCases aggregator
```

The console side is the settings screen in
`app/src/features/settings/metadata-fields/` and the helpers in
`app/src/functionals/metadata-fields/`.

## "Admin only" is a scope

Every REST operation requires a scope. Each use case declares its own in
`scope.go` (`RequiredScope`), and the facade method in
`internal/kaiten/metadatafields.go` enforces it with `caller.Require` before it
runs the use case. A caller without the scope receives `403` with the code
`Auth.MissingScope`. The GraphQL `metadataFields` query is the exception (see
[GraphQL](#graphql)).

| Operation | Required scope |
| --- | --- |
| `GET /api/metadata-fields` | `read:metadata_fields` |
| `POST /api/metadata-fields` | `write:metadata_fields` |
| `PATCH /api/metadata-fields/{id}` | `write:metadata_fields` |
| `POST /api/metadata-fields/{id}/archive` | `write:metadata_fields` |
| `POST /api/metadata-fields/{id}/unarchive` | `write:metadata_fields` |
| `POST /api/metadata-fields/{id}/dry-run` | `write:metadata_fields` |
| `POST /api/metadata-fields/reorder` | `write:metadata_fields` |

The dry-run changes nothing but requires the scope of the update it previews:
it reports which resources would break.

The platform has no role concept, so "admin only" is a token-attribution
policy: grant `write:metadata_fields` only to tokens issued to administrators.
A role check, if one is added, belongs in the facade method next to the scope
check, so that a caller that does not go through HTTP cannot skip it.

The scope check runs after Huma has parsed and validated the request body, so a
caller that lacks the scope and sends an invalid body receives `422`, not `403`.
[`tests/integrations/metadatafields/scope_gating_test.go`](../../../tests/integrations/metadatafields/scope_gating_test.go)
pins both behaviours.

## Convention: the binding contract

> **Every handler that writes a jsonb `metadata` column on a resource must call
> `validator.ValidateMetadataForResource` before it persists, and must persist
> the map it returns, not the input.**

The returned map matters because the validator merges archived keys back into
it. A handler that writes `command.Metadata` directly defeats the merge, and an
archived key silently disappears from the resource on the next `PUT` that omits
it.

Four handlers follow the contract today:

- `createdeploymentzone` and `updatedeploymentzone` (`DEPLOYMENT_ZONE`, strict)
- `createinstance` and `updateinstance` (`INSTANCE`, tolerant)

The update handlers serve `PUT /api/deployment-zones/{deploymentZoneSlug}` and
`PUT /api/instances/{instanceSlug}`, which replace the whole resource.

### Adding a resource type

1. Add the value to the Postgres enum `metadata_field_resource_type` with a
   migration, and regenerate sqlc (`task generate:sqlc`).
2. Add it to the other places that list the enum: the `enum:` tags in
   `schema/schema.go`, `createmetadatafield/command.go` and
   `getmetadatafields/endpoint.go`, and the `MetadataFieldResourceType` enum in
   `schema/metadata_field.graphqls`. Then run `task generate:gqlgen` and
   `task generate:oas`.
3. Teach the dry-run about it: `ListResourceMetadata` in
   `dryrunmetadatafield/repository.go` switches on the resource type.
4. Call `ValidateMetadataForResource` from the create and update handlers of the
   resource, passing the `strict` flag that the resource needs. The owning
   module decides the policy; the validator never switches on a resource type.
5. Pin the contract with the two regression tests below.

### Regression tests that pin the contract

Cover every new handler with at least these two cases:

1. **Active key omitted, key deleted.** `PUT` a resource with an active metadata
   key, `PUT` it again without the key, read it back and assert the key is gone.
   This catches a handler that forgot the validator.
2. **Archived key omitted, key preserved.** `PUT` a resource that carries an
   archived key, `PUT` it again without the key, and assert that the key
   survived. This catches a handler that called the validator but ignored its
   return value.

Examples:
[`tests/integrations/deploymentzones/metadata_validation_test.go`](../../../tests/integrations/deploymentzones/metadata_validation_test.go)
and
[`tests/integrations/instances/metadata_validation_test.go`](../../../tests/integrations/instances/metadata_validation_test.go).

The validator is the only place that checks a metadata payload. Nothing in the
database checks the content of a `metadata` column.

## Strict and tolerant

| Resource | Mode | Unknown keys | Reason |
| --- | --- | --- | --- |
| `DEPLOYMENT_ZONE` | strict | rejected (`additionalProperties: false`) | Administrators write it, and the schema is well controlled. |
| `INSTANCE` | tolerant | accepted (`additionalProperties: true`) | Instances report it themselves, so new keys must stay accepted. |

The consuming module owns the policy. Its handler passes a `strict bool` to
`ValidateMetadataForResource`: `createdeploymentzone` and `updatedeploymentzone`
pass `true`, `createinstance` and `updateinstance` pass `false`. Default to
`strict` for a new resource that administrators write, so that untyped keys are
not accepted silently.

## JSON Schema 2020-12, no DSL

The `json_schema` column stores a standard JSON Schema document, for example:

```json
{"type": "string", "enum": ["production", "staging", "development"]}
```

The validator compiles it with `santhosh-tekuri/jsonschema/v6`, pinned to draft
2020-12 with format assertion on, so `format: "date"` rejects a value that is
not a date. `validator.BuildResourceSchema` composes the active fields of a
resource type into one object schema, one property per `key`. No translation
layer sits in between.

## Changing a field's schema

- **Shape.** `ValidateSchemaShape` runs on create, on update and on the dry-run.
  It rejects, with `422`, a document that is not valid JSON or not a valid JSON
  Schema 2020-12 document, and an array schema that declares no `items`.
- **Transition.** On update, `ValidateSchemaTransition` compares the stored
  schema with the new one. It rejects a change of the primary `type`, a change
  of the `items` type of an array, and a switch between a free string and a
  string with an `enum`, with `422`. Labels, descriptions, and adding,
  reordering or removing enum values are accepted. To change a type, archive the
  field and create a new one.
- **Immutable keys.** `key` and `resourceType` cannot change, and `displayOrder`
  is only set through `POST /api/metadata-fields/reorder`.
- **Dry-run.** `POST /api/metadata-fields/{id}/dry-run` takes a candidate schema
  and counts the resources whose stored value under the field's key would no
  longer satisfy it, with up to five samples. The console uses it to preview
  the impact of an edit.
- **Unarchive.** `POST /api/metadata-fields/{id}/unarchive` restores an archived
  field. It answers `409` when another active field has taken the same key for
  the resource type, because the key is unique among active fields.

## No declared field

When an organization has declared no field for a resource type,
`ValidateMetadataForResource` returns the payload unchanged and accepts any
metadata, because there is no contract yet. Strict mode for `DEPLOYMENT_ZONE`
only applies once an administrator has declared at least one field.

## Archived fields: fall back to raw JSON

Archiving a field does not remove the values already stored in the `metadata`
columns. To keep updates non-destructive, `ValidateMetadataForResource` applies
these rules to an archived key:

| Update scenario | Result |
| --- | --- |
| The key is already on the resource and the value is kept | Accepted |
| The key is already on the resource and the value changes | Accepted as raw jsonb, with no type check |
| The key is not on the resource yet | `422` with the code `MetadataValidation.ArchivedKeyIntroduced` |
| The key is on the resource and the payload omits it | Accepted, and the server re-injects the value before the write |

The validator therefore needs the metadata the resource has today. An update
handler loads the existing row first and passes its metadata as
`currentMetadata`. A create handler passes `nil`, so any archived key in a create
payload is rejected. When every field of a resource type is archived, there is
no active contract: the remaining keys are accepted as raw jsonb and the
archived-key rules still apply. A payload that is deeply equal to
`currentMetadata` is accepted without validation.

### Preservation on omission

`PUT` replaces the whole resource, so a payload that omits an archived key would
delete it. The validator prevents that: the map it returns, its first return
value, has the archived keys present in `currentMetadata` and absent from the
payload put back. A handler that persists the input map instead of the returned
one defeats this rule.

## Caching

Without a cache, `ValidateMetadataForResource` would load the field list and
compile the schema on every write. `validator/cache.go` keeps one compiled
snapshot per `(organization, resource type)` in memory. Every write handler
(create, update, archive, unarchive, reorder) calls
`validator.InvalidateAndPublish` once its transaction has committed. It evicts
the local entry and sends a `NOTIFY` on `validator.InvalidationChannel` (see
`internal/infrastructure/pgnotify`), so that every other replica evicts the same
entry. The module starts its own `pgnotify` listener in `metadatafield_module.go`.
A five-minute TTL is the safety net for a missed `NOTIFY`, such as a listener
that reconnects at the wrong moment. It is not the primary invalidation path.

## GraphQL

GraphQL exposes one read-only query, `metadataFields` (resource type, optional
`includeArchived`), in `graphql/` and `schema/metadata_field.graphqls`. It pages
with the same cursor format as `GET /api/metadata-fields`, so a cursor from one
surface works on the other. All mutations are REST operations.

The query does not go through the facade, so `read:metadata_fields` is not
checked on it: the GraphQL route requires an organization credential and applies
no scope to any query. A token that lacks the scope can still list the fields
of its organization through GraphQL.
