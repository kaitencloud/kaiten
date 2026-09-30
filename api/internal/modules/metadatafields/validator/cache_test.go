package validator

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"
)

// countingLister wraps a stubLister and counts how many times the underlying
// DB load was called. Cache hits MUST NOT increment the counter.
type countingLister struct {
	delegate *stubLister
	calls    int
}

func (c *countingLister) ListMetadataFieldsByResourceTypeIncludingArchived(
	ctx context.Context,
	arg db.ListMetadataFieldsByResourceTypeIncludingArchivedParams,
) ([]db.MetadataField, error) {
	c.calls++
	return c.delegate.ListMetadataFieldsByResourceTypeIncludingArchived(ctx, arg)
}

func TestSchemaCache(t *testing.T) {
	// Not parallel — the cache is process-wide and other tests touch it.
	t.Cleanup(ClearCache)
	ClearCache()

	orgID := uuid.New()
	otherOrgID := uuid.New()
	lister := &countingLister{delegate: &stubLister{
		fields: []db.MetadataField{
			mkField("region", `{"type":"string"}`),
		},
	}}

	t.Run("first call loads from DB, second call hits cache", func(t *testing.T) {
		ClearCache()
		lister.calls = 0
		_, err := ValidateMetadataForResource(
			context.Background(), lister, orgID,
			db.MetadataFieldResourceTypeDEPLOYMENTZONE,
			true,
			map[string]any{"region": "eu"}, nil,
		)
		require.NoError(t, err)
		require.Equal(t, 1, lister.calls)

		_, err = ValidateMetadataForResource(
			context.Background(), lister, orgID,
			db.MetadataFieldResourceTypeDEPLOYMENTZONE,
			true,
			map[string]any{"region": "us"}, nil,
		)
		require.NoError(t, err)
		assert.Equal(t, 1, lister.calls, "second call should hit cache, not DB")
	})

	t.Run("InvalidateCache forces a fresh load", func(t *testing.T) {
		ClearCache()
		lister.calls = 0

		_, _ = ValidateMetadataForResource(
			context.Background(), lister, orgID,
			db.MetadataFieldResourceTypeDEPLOYMENTZONE,
			true,
			map[string]any{"region": "eu"}, nil,
		)
		require.Equal(t, 1, lister.calls)

		InvalidateCache(orgID, db.MetadataFieldResourceTypeDEPLOYMENTZONE)

		_, _ = ValidateMetadataForResource(
			context.Background(), lister, orgID,
			db.MetadataFieldResourceTypeDEPLOYMENTZONE,
			true,
			map[string]any{"region": "us"}, nil,
		)
		assert.Equal(t, 2, lister.calls)
	})

	t.Run("cache is partitioned by (org, resourceType)", func(t *testing.T) {
		ClearCache()
		lister.calls = 0

		// Same org, two resource types — two distinct cache entries.
		_, _ = ValidateMetadataForResource(
			context.Background(), lister, orgID,
			db.MetadataFieldResourceTypeDEPLOYMENTZONE,
			true,
			map[string]any{"region": "eu"}, nil,
		)
		_, _ = ValidateMetadataForResource(
			context.Background(), lister, orgID,
			db.MetadataFieldResourceTypeINSTANCE,
			false,
			map[string]any{"region": "eu"}, nil,
		)
		require.Equal(t, 2, lister.calls)

		// Different org, same resource type — third distinct entry.
		_, _ = ValidateMetadataForResource(
			context.Background(), lister, otherOrgID,
			db.MetadataFieldResourceTypeDEPLOYMENTZONE,
			true,
			map[string]any{"region": "eu"}, nil,
		)
		assert.Equal(t, 3, lister.calls)

		// Repeat the first call — should hit cache.
		_, _ = ValidateMetadataForResource(
			context.Background(), lister, orgID,
			db.MetadataFieldResourceTypeDEPLOYMENTZONE,
			true,
			map[string]any{"region": "fr"}, nil,
		)
		assert.Equal(t, 3, lister.calls)
	})

	t.Run("no-contract case (no fields) is also cached", func(t *testing.T) {
		ClearCache()
		emptyLister := &countingLister{delegate: &stubLister{fields: nil}}

		_, _ = ValidateMetadataForResource(
			context.Background(), emptyLister, orgID,
			db.MetadataFieldResourceTypeDEPLOYMENTZONE,
			true,
			map[string]any{"whatever": "anything"}, nil,
		)
		_, _ = ValidateMetadataForResource(
			context.Background(), emptyLister, orgID,
			db.MetadataFieldResourceTypeDEPLOYMENTZONE,
			true,
			map[string]any{"whatever": "anything"}, nil,
		)
		assert.Equal(t, 1, emptyLister.calls,
			"the empty-fields fallback should be cacheable too")
	})
}

// TestApplyInvalidation covers the receiving side of cross-replica
// invalidation (see PublishInvalidation/ApplyInvalidation in cache.go)
// without needing a real Postgres LISTEN/NOTIFY round trip: that mechanism
// itself is proven against a real DB in
// tests/integrations/pgnotify/listener_test.go. What's specific to this
// package, and worth a pure unit test, is the payload encoding contract:
// ApplyInvalidation must undo exactly what encodeInvalidationKey encoded,
// and must never panic on a payload it didn't produce.
func TestApplyInvalidation(t *testing.T) {
	t.Cleanup(ClearCache)
	ClearCache()

	orgID := uuid.New()
	resourceType := db.MetadataFieldResourceTypeDEPLOYMENTZONE
	lister := &countingLister{delegate: &stubLister{
		fields: []db.MetadataField{mkField("region", `{"type":"string"}`)},
	}}

	t.Run("evicts the entry named by an encoded payload", func(t *testing.T) {
		ClearCache()
		lister.calls = 0

		_, err := ValidateMetadataForResource(
			context.Background(), lister, orgID, resourceType, true,
			map[string]any{"region": "eu"}, nil,
		)
		require.NoError(t, err)
		require.Equal(t, 1, lister.calls, "first call should load from DB")

		ApplyInvalidation(encodeInvalidationKey(orgID, resourceType))

		_, err = ValidateMetadataForResource(
			context.Background(), lister, orgID, resourceType, true,
			map[string]any{"region": "us"}, nil,
		)
		require.NoError(t, err)
		assert.Equal(t, 2, lister.calls, "ApplyInvalidation should have forced a fresh load")
	})

	t.Run("a malformed payload is a no-op, not a panic", func(t *testing.T) {
		ClearCache()
		lister.calls = 0

		_, err := ValidateMetadataForResource(
			context.Background(), lister, orgID, resourceType, true,
			map[string]any{"region": "eu"}, nil,
		)
		require.NoError(t, err)
		require.Equal(t, 1, lister.calls)

		assert.NotPanics(t, func() {
			ApplyInvalidation("not-a-valid-payload")
			ApplyInvalidation("not-a-uuid|" + string(resourceType))
			ApplyInvalidation("")
		})

		_, err = ValidateMetadataForResource(
			context.Background(), lister, orgID, resourceType, true,
			map[string]any{"region": "us"}, nil,
		)
		require.NoError(t, err)
		assert.Equal(t, 1, lister.calls, "malformed payloads must not evict unrelated entries")
	})

	t.Run("encode/decode round-trips", func(t *testing.T) {
		payload := encodeInvalidationKey(orgID, resourceType)
		gotOrgID, gotResourceType, ok := decodeInvalidationKey(payload)
		require.True(t, ok)
		assert.Equal(t, orgID, gotOrgID)
		assert.Equal(t, resourceType, gotResourceType)
	})
}
