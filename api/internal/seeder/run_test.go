package seeder

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestTargetedSeedRefusesTrustedSourceBeforeCleanup(t *testing.T) {
	platformID := uuid.New()
	// No pool and no profiles: refusal must occur before any target DB read or
	// cleanup and reject the entire mixed batch, not only the platform row.
	err := Run(t.Context(), nil, nil, RunOptions{
		PlatformOrganizationID: platformID,
		OrganizationIDs:        []uuid.UUID{uuid.New(), platformID},
	})
	require.ErrorContains(t, err, "trusted platform source")
	require.NoError(t, validateTargetOrganizations([]uuid.UUID{uuid.New()}, platformID))
	require.NoError(t, validateTargetOrganizations([]uuid.UUID{uuid.New()}, uuid.Nil))
}

func TestDeletionOrder(t *testing.T) {
	t.Run("children before parents", func(t *testing.T) {
		tables := map[string]bool{"parent": true, "child": true, "grandchild": true}
		dependencies := map[string]map[string]bool{
			"parent":     {},
			"child":      {"parent": true},
			"grandchild": {"child": true},
		}

		order, err := deletionOrder(tables, dependencies)

		require.NoError(t, err)
		require.Equal(t, []string{"grandchild", "child", "parent"}, order)
	})

	t.Run("independent tables are deterministic", func(t *testing.T) {
		tables := map[string]bool{"zebra": true, "alpha": true}
		dependencies := map[string]map[string]bool{"zebra": {}, "alpha": {}}

		order, err := deletionOrder(tables, dependencies)

		require.NoError(t, err)
		require.Equal(t, []string{"alpha", "zebra"}, order)
	})

	t.Run("cycles fail", func(t *testing.T) {
		tables := map[string]bool{"a": true, "b": true}
		dependencies := map[string]map[string]bool{
			"a": {"b": true},
			"b": {"a": true},
		}

		_, err := deletionOrder(tables, dependencies)

		require.Error(t, err)
	})
}
