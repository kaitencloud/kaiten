package validator

import (
	"bytes"
	"context"
	"fmt"
	"reflect"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/santhosh-tekuri/jsonschema/v6"

	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const composedResourceID = "metadata_resource_schema.json"

// ValidateMetadata validates a metadata payload against an already-composed
// resource schema (cf. BuildResourceSchema).
//
// Returns nil on success, or a kaitenerrors.UnprocessableEntity (HTTP 422) on
// validation failure — the underlying jsonschema error is rendered into the
// message so callers (and admins) get a precise field path.
//
// A compilation error on the composed schema is treated as a 500-level
// problem (returned as a plain error) because it indicates corrupted data in
// the DB rather than user input — ValidateSchemaShape on POST/PATCH should
// have caught it. The plain error bubbles up through the standard handler
// chain.
func ValidateMetadata(metadata map[string]any, composedSchema []byte) error {
	sch, err := compileComposedSchema(composedSchema)
	if err != nil {
		return fmt.Errorf("validator: compiling composed schema (DB corruption?): %w", err)
	}

	if err := sch.Validate(normalizeJSONValue(metadata)); err != nil {
		return kaitenerrors.UnprocessableEntity(
			"MetadataValidation.Failed",
			fmt.Sprintf("metadata does not satisfy the resource schema: %s", err),
		)
	}
	return nil
}

// MetadataFieldsLister is the minimal subset of *db.Queries this package
// needs to load the metadata fields of a resource type (active + archived).
// Defining it here keeps the validator decoupled from the wider Queries
// surface and makes unit tests easier to mock.
type MetadataFieldsLister interface {
	ListMetadataFieldsByResourceTypeIncludingArchived(
		ctx context.Context,
		arg db.ListMetadataFieldsByResourceTypeIncludingArchivedParams,
	) ([]db.MetadataField, error)
}

// NewLister builds the MetadataFieldsLister ValidateMetadataForResource
// needs, bound to pool. This is the metadatafields module's public
// constructor for callers outside the module (e.g. deploymentzones,
// instances) -- they call this instead of importing this module's own
// generated db package directly, keeping that package's types private to
// the module.
func NewLister(pool *pgxpool.Pool) MetadataFieldsLister {
	return db.New(pool)
}

// ValidateMetadataForResource validates a resource's metadata payload against
// the active MetadataField schema for (org, resourceType) and returns the map
// the caller must persist.
//
// Callers MUST assign the returned map. Archived keys the payload omitted are
// merged back into it, and persisting the input map instead drops them
// permanently -- the one thing nothing in the type system prevents. The
// metadata_validation_test.go suites under tests/integrations pin it for the
// four handlers that exist; a new metadata-writing resource has to bring its
// own case.
//
// strict selects the unknown-key policy (additionalProperties). The calling
// module owns it -- admin-writable resources pass true, auto-reported ones
// false -- so the validator stays agnostic of which resource types exist.
//
// currentMetadata is what is persisted on the resource today, nil for creates.
// An archived key is tolerated only if it is already in there; a payload
// introducing a fresh one is rejected.
//
// Returns a kaitenerrors.UnprocessableEntity (HTTP 422) on validation failure,
// or a plain error on a DB or composition failure.
func ValidateMetadataForResource(
	ctx context.Context,
	queries MetadataFieldsLister,
	orgID uuid.UUID,
	resourceType db.MetadataFieldResourceType,
	strict bool,
	newMetadata map[string]any,
	currentMetadata map[string]any,
) (map[string]any, error) {
	// Idempotent fast-path. If the payload deep-equals what's already stored,
	// there's nothing to validate or merge: the previous write already passed
	// through the validator (invariant), and no key is being introduced or
	// changed. Saves the ajv `Validate` call on no-op form re-submits, which
	// is the dominant case for "Save" buttons clicked without changes.
	//
	// Note: this only skips validation. The handler still opens its tx and
	// writes the row — that's the layer's job, not the validator's. Outbox
	// noise is a separate consideration; per-handler idempotence would need
	// to compare every persisted field, not just metadata.
	if currentMetadata != nil && reflect.DeepEqual(newMetadata, currentMetadata) {
		return newMetadata, nil
	}

	resolved, err := loadOrBuildResolvedSchema(ctx, queries, orgID, resourceType, strict)
	if err != nil {
		return nil, err
	}

	// No fields declared at all → no contract → any metadata is accepted.
	// The strict policy only kicks in once an admin has declared at least one
	// field; until then we behave as fully tolerant. This keeps fresh orgs
	// and tests that don't seed metadata_field rows working out of the box.
	if resolved.compiled == nil && len(resolved.archivedKeys) == 0 {
		return newMetadata, nil
	}

	// The "fallback raw JSON" semantics — handle archived keys before
	// validating against the compiled schema so strict mode doesn't reject
	// them.
	filtered := newMetadata
	if len(resolved.archivedKeys) > 0 {
		filtered = make(map[string]any, len(newMetadata))
		for k, v := range newMetadata {
			if _, isArchived := resolved.archivedKeys[k]; isArchived {
				if _, wasPresent := currentMetadata[k]; !wasPresent {
					return nil, kaitenerrors.UnprocessableEntity(
						"MetadataValidation.ArchivedKeyIntroduced",
						fmt.Sprintf("metadata key %q refers to an archived field and cannot be introduced; it can only persist if it was already present on the resource", k),
					)
				}
				// Archived key that was already there — let it pass through
				// as raw jsonb, but don't submit it to the active-schema
				// validation.
				continue
			}
			filtered[k] = v
		}
	}

	// All fields archived ⇒ no active contract. Same fallback as the
	// "no fields at all" case above: accept the remaining (non-archived) keys
	// as raw jsonb. Still merge archived leftovers from currentMetadata.
	if resolved.compiled == nil {
		return mergeArchivedLeftovers(newMetadata, currentMetadata, resolved.archivedKeys), nil
	}

	if err := resolved.compiled.Validate(normalizeJSONValue(filtered)); err != nil {
		return nil, kaitenerrors.UnprocessableEntity(
			"MetadataValidation.Failed",
			fmt.Sprintf("metadata does not satisfy the resource schema: %s", err),
		)
	}

	return mergeArchivedLeftovers(newMetadata, currentMetadata, resolved.archivedKeys), nil
}

// normalizeJSONValue converts common Go-native JSON shapes (notably []string
// built by internal seeders) into the generic map[string]any / []any form
// expected by santhosh-tekuri/jsonschema/v6's Schema.Validate.
func normalizeJSONValue(value any) any {
	switch v := value.(type) {
	case map[string]any:
		if v == nil {
			return v
		}
		out := make(map[string]any, len(v))
		for key, nested := range v {
			out[key] = normalizeJSONValue(nested)
		}
		return out
	case []any:
		if v == nil {
			return v
		}
		out := make([]any, len(v))
		for i, nested := range v {
			out[i] = normalizeJSONValue(nested)
		}
		return out
	}

	rv := reflect.ValueOf(value)
	if !rv.IsValid() {
		return value
	}

	switch rv.Kind() {
	case reflect.Map:
		if rv.Type().Key().Kind() != reflect.String {
			return value
		}
		if rv.IsNil() {
			return map[string]any(nil)
		}
		out := make(map[string]any, rv.Len())
		iter := rv.MapRange()
		for iter.Next() {
			out[iter.Key().String()] = normalizeJSONValue(iter.Value().Interface())
		}
		return out
	case reflect.Slice, reflect.Array:
		if rv.Kind() == reflect.Slice && rv.IsNil() {
			return []any(nil)
		}
		out := make([]any, rv.Len())
		for i := range rv.Len() {
			out[i] = normalizeJSONValue(rv.Index(i).Interface())
		}
		return out
	default:
		return value
	}
}

// loadOrBuildResolvedSchema returns the cached snapshot if present, otherwise
// reloads from DB, recompiles, and stores. This is where the perf savings
// kick in: a warm cache turns ValidateMetadataForResource into a single map
// lookup plus the jsonschema.Validate call.
func loadOrBuildResolvedSchema(
	ctx context.Context,
	queries MetadataFieldsLister,
	orgID uuid.UUID,
	resourceType db.MetadataFieldResourceType,
	strict bool,
) (*resolvedSchema, error) {
	// The cache is keyed by (org, resourceType) only: `strict` is invariant per
	// resource type (the owning module always passes the same value), so the
	// cached compiled schema's additionalProperties never disagrees with it.
	if cached, ok := loadCachedSchema(orgID, resourceType); ok {
		return cached, nil
	}

	fields, err := queries.ListMetadataFieldsByResourceTypeIncludingArchived(ctx, db.ListMetadataFieldsByResourceTypeIncludingArchivedParams{
		OrganizationID: orgID,
		ResourceType:   resourceType,
	})
	if err != nil {
		return nil, fmt.Errorf("validator: loading metadata fields for %s: %w", resourceType, err)
	}

	resolved := &resolvedSchema{
		archivedKeys: make(map[string]struct{}),
	}

	activeFields := make([]db.MetadataField, 0, len(fields))
	activeKeys := make(map[string]struct{}, len(fields))
	for _, f := range fields {
		if !f.ArchivedAt.Valid {
			activeFields = append(activeFields, f)
			activeKeys[f.Key] = struct{}{}
		}
	}

	// A key is archived only while no active field carries it.
	// uq_metadata_field_key_active lets a field be declared again under the key
	// of one that was archived, and from then on the new field is the contract:
	// counting the key as archived too would refuse it on every create, and
	// re-inject a value the active schema never validated on every update.
	for _, f := range fields {
		if _, active := activeKeys[f.Key]; f.ArchivedAt.Valid && !active {
			resolved.archivedKeys[f.Key] = struct{}{}
		}
	}

	if len(activeFields) > 0 {
		composed, err := BuildResourceSchema(activeFields, strict)
		if err != nil {
			return nil, fmt.Errorf("validator: composing resource schema: %w", err)
		}
		compiled, err := compileComposedSchema(composed)
		if err != nil {
			return nil, fmt.Errorf("validator: compiling composed schema (DB corruption?): %w", err)
		}
		resolved.compiled = compiled
	}

	storeCachedSchema(orgID, resourceType, resolved)
	return resolved, nil
}

// ValueValidator validates individual metadata values against a single
// field's JSON Schema. Build it once with CompileValueValidator and reuse it
// across many values — used by the dry-run impact preview to test each
// resource's stored value for one key against a candidate schema.
type ValueValidator struct {
	sch *jsonschema.Schema
}

// CompileValueValidator compiles a single JSON Schema 2020-12 document for
// validating individual metadata values. schemaBytes should already have
// passed ValidateSchemaShape. Returns a plain error if the schema fails to
// compile (treated as caller error / 500 upstream).
func CompileValueValidator(schemaBytes []byte) (*ValueValidator, error) {
	sch, err := compileComposedSchema(schemaBytes)
	if err != nil {
		return nil, fmt.Errorf("validator: compiling value schema: %w", err)
	}
	return &ValueValidator{sch: sch}, nil
}

// Valid reports whether value satisfies the schema. Values are normalized
// (Go-native shapes → generic JSON shapes) before validation, mirroring
// ValidateMetadata.
func (v *ValueValidator) Valid(value any) bool {
	return v.sch.Validate(normalizeJSONValue(value)) == nil
}

// newConfiguredCompiler builds a v6 compiler pinned to Draft 2020-12 with
// format assertion enabled. v6 leaves format assertion OFF by default for
// draft 2020-12 (it lives in a separate "format-assertion" vocabulary), so the
// explicit AssertFormat() call is what reproduces the v5 `AssertFormat = true`
// behaviour the validator has always relied on — notably so the DATE field
// type's `format: "date"` keeps rejecting non-date values at validation time.
// Shared with ValidateSchemaShape (shape.go) so both compile paths stay in
// lockstep on draft + format policy.
func newConfiguredCompiler() *jsonschema.Compiler {
	c := jsonschema.NewCompiler()
	c.DefaultDraft(jsonschema.Draft2020)
	c.AssertFormat()
	return c
}

// compileComposedSchema returns the *jsonschema.Schema that ValidateMetadata
// builds internally — extracted here so the cache can hold the compiled
// artefact directly. v6's AddResource consumes an already-decoded JSON value,
// so we run it through jsonschema.UnmarshalJSON first.
func compileComposedSchema(composed []byte) (*jsonschema.Schema, error) {
	doc, err := jsonschema.UnmarshalJSON(bytes.NewReader(composed))
	if err != nil {
		return nil, fmt.Errorf("validator: decoding composed schema: %w", err)
	}
	c := newConfiguredCompiler()
	if err := c.AddResource(composedResourceID, doc); err != nil {
		return nil, fmt.Errorf("validator: adding composed schema: %w", err)
	}
	return c.Compile(composedResourceID)
}

// mergeArchivedLeftovers preserves archived keys that the caller's payload
// omitted: PUT semantics would otherwise drop them, but mandates that
// archived values survive on the resource until an admin actively rewrites
// them. Returns newMetadata unchanged if there's nothing to merge.
func mergeArchivedLeftovers(
	newMetadata map[string]any,
	currentMetadata map[string]any,
	archivedKeys map[string]struct{},
) map[string]any {
	if len(archivedKeys) == 0 || len(currentMetadata) == 0 {
		return newMetadata
	}
	out := newMetadata
	cloned := false
	for k, v := range currentMetadata {
		if _, isArchived := archivedKeys[k]; !isArchived {
			continue
		}
		if _, present := newMetadata[k]; present {
			continue
		}
		// Lazily clone so we don't mutate the caller's input when nothing
		// actually needs adding.
		if !cloned {
			fresh := make(map[string]any, len(newMetadata)+1)
			for ck, cv := range newMetadata {
				fresh[ck] = cv
			}
			out = fresh
			cloned = true
		}
		out[k] = v
	}
	return out
}
