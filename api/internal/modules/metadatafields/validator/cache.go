package validator

import (
	"context"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/santhosh-tekuri/jsonschema/v6"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/pgnotify"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"
)

// resolvedSchema is the cached, ready-to-use snapshot of a resource type's
// metadata contract for one org. It holds everything ValidateMetadataForResource
// needs *after* the DB load and the per-field JSON Schema compilation — both
// of which are the expensive steps on the hot write path.
//
// `compiled` is nil when the org has either no MetadataField rows at all or
// only archived ones; in both cases there's no active contract, validation
// short-circuits, and we still need `archivedKeys` to enforce the
// "no introduction of archived keys" rule.
type resolvedSchema struct {
	compiled     *jsonschema.Schema
	archivedKeys map[string]struct{}
	cachedAt     time.Time
}

// cacheKey is the cache lookup key. Org + resource type uniquely identify a
// contract — keys never need to be invalidated across orgs.
type cacheKey struct {
	orgID        uuid.UUID
	resourceType db.MetadataFieldResourceType
}

// cacheTTL is the maximum age of a cached entry. Cache misses are O(DB+compile),
// hits are O(map lookup); a few minutes of staleness is fine when the explicit
// invalidation path runs synchronously inside the mutation handlers (see
// InvalidateCache). Cross-node invalidation is now handled by
// PublishInvalidation/ApplyInvalidation below, via Postgres LISTEN/NOTIFY
// (see internal/infrastructure/pgnotify) -- the TTL remains as a safety net
// for the case where a NOTIFY is missed (e.g. a replica's listener
// reconnecting at the exact wrong moment), not as the primary mechanism.
const cacheTTL = 5 * time.Minute

// InvalidationChannel is the Postgres NOTIFY channel every metadatafields
// write handler publishes to (via PublishInvalidation) after committing a
// change to metadata_field, and that every replica listens on (via
// ApplyInvalidation, registered in metadatafield_module.go) to evict the
// same (org, resourceType) entry from its own local cache.
const InvalidationChannel = "metadata_schema_cache_invalidate"

// schemaCache stores *resolvedSchema by (orgID, resourceType). sync.Map is the
// right shape here because the read path is overwhelmingly hot (every metadata
// write on every resource) and writes are rare (every schema mutation).
var schemaCache sync.Map //nolint:gochecknoglobals // process-wide cache by design

// loadCachedSchema returns the cached snapshot for (orgID, resourceType) if
// present and fresh, otherwise (nil, false). Expired entries are deleted on
// the spot so stale data doesn't accumulate.
func loadCachedSchema(orgID uuid.UUID, resourceType db.MetadataFieldResourceType) (*resolvedSchema, bool) {
	v, ok := schemaCache.Load(cacheKey{orgID, resourceType})
	if !ok {
		return nil, false
	}
	entry, ok := v.(*resolvedSchema)
	if !ok {
		// Defensive: should never happen, but treat any unexpected type as a
		// cache miss rather than panicking on the hot path.
		schemaCache.Delete(cacheKey{orgID, resourceType})
		return nil, false
	}
	if time.Since(entry.cachedAt) > cacheTTL {
		schemaCache.Delete(cacheKey{orgID, resourceType})
		return nil, false
	}
	return entry, true
}

// storeCachedSchema records a freshly-built snapshot.
func storeCachedSchema(orgID uuid.UUID, resourceType db.MetadataFieldResourceType, entry *resolvedSchema) {
	entry.cachedAt = time.Now()
	schemaCache.Store(cacheKey{orgID, resourceType}, entry)
}

// InvalidateCache drops the cached snapshot for (orgID, resourceType). Every
// handler that writes to metadata_field (create / update / archive / reorder)
// MUST call this after a successful commit so the next write against a
// resource of that type reflects the new schema.
//
// Called from the same goroutine as the write, after Uof.Begin().Do() returns
// without error. If the tx rolls back later (it can't with this codebase, but
// in theory), the worst case is one extra DB load on the next validation
// call — no correctness issue.
func InvalidateCache(orgID uuid.UUID, resourceType db.MetadataFieldResourceType) {
	schemaCache.Delete(cacheKey{orgID, resourceType})
}

// PublishInvalidation NOTIFYs InvalidationChannel with the encoded
// (orgID, resourceType) key, so every other replica's ApplyInvalidation
// runs for the same entry. Call it right after InvalidateCache, in the same
// place every metadatafields write handler already calls InvalidateCache
// today (after its Uof.Transact call returns successfully) -- see
// createmetadatafield.Execute for the reference call site.
//
// dbtx need not be transaction-scoped: by the time callers reach this
// point the triggering write has already committed (InvalidateCache's own
// doc comment describes the same timing), so a plain pool-backed NOTIFY is
// already correctly "after commit." Passing a transaction-scoped DBTX
// (obtained via uow.DBTX(ctx) from inside a still-open Transact call)
// also works and is strictly safer: see pgnotify.Publish's doc comment for why.
func PublishInvalidation(ctx context.Context, dbtx pgnotify.DBTX, orgID uuid.UUID, resourceType db.MetadataFieldResourceType) error {
	return pgnotify.Publish(ctx, dbtx, InvalidationChannel, encodeInvalidationKey(orgID, resourceType))
}

// InvalidateAndPublish combines InvalidateCache with PublishInvalidation,
// logging (rather than returning) any NOTIFY failure. This is the single
// call every metadatafields write handler makes after a successful commit
// -- replacing the bare InvalidateCache call each of them made before
// cross-node invalidation existed.
func InvalidateAndPublish(ctx context.Context, dbtx pgnotify.DBTX, orgID uuid.UUID, resourceType db.MetadataFieldResourceType) {
	InvalidateCache(orgID, resourceType)
	if err := PublishInvalidation(ctx, dbtx, orgID, resourceType); err != nil {
		slog.WarnContext(ctx, "failed to publish metadata schema cache invalidation", "error", err)
	}
}

// ApplyInvalidation evicts the cache entry named by payload, a value
// produced by encodeInvalidationKey and delivered via InvalidationChannel.
// It is the pgnotify.Handler registered for that channel -- exported (rather
// than registered as a closure here) so metadatafield_module.go can wire it
// up without this package needing to import pgnotify for its Handler type.
// Malformed payloads (there should never be one -- the only publisher is
// PublishInvalidation) are silently ignored rather than logged: this
// package doesn't otherwise depend on a logger, and a bad payload here can
// only make the cache too fresh (a stray DB reload), never wrong.
func ApplyInvalidation(payload string) {
	orgID, resourceType, ok := decodeInvalidationKey(payload)
	if !ok {
		return
	}
	schemaCache.Delete(cacheKey{orgID, resourceType})
}

// encodeInvalidationKey and decodeInvalidationKey define the wire format
// for InvalidationChannel payloads: "<org UUID>|<resource type>". Postgres
// NOTIFY payloads are plain text, and neither part can itself contain "|"
// (a UUID's canonical form and MetadataFieldResourceType's enum values are
// both closed, delimiter-free character sets), so a single split is enough
// -- no need for JSON here.
func encodeInvalidationKey(orgID uuid.UUID, resourceType db.MetadataFieldResourceType) string {
	return orgID.String() + "|" + string(resourceType)
}

func decodeInvalidationKey(payload string) (uuid.UUID, db.MetadataFieldResourceType, bool) {
	idPart, typePart, found := strings.Cut(payload, "|")
	if !found {
		return uuid.Nil, "", false
	}
	orgID, err := uuid.Parse(idPart)
	if err != nil {
		return uuid.Nil, "", false
	}
	return orgID, db.MetadataFieldResourceType(typePart), true
}

// ClearCache drops every cached snapshot. Intended for tests that reset the
// underlying DB between subtests and need the validator to forget what it
// loaded in a previous subtest. Not exposed for production code paths — the
// per-org InvalidateCache is the right granularity there.
func ClearCache() {
	schemaCache.Range(func(key, _ any) bool {
		schemaCache.Delete(key)
		return true
	})
}
