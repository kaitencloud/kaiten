package seeder

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type seedFlags struct {
	enabled bool
	orgID   uuid.UUID
	calls   int
}

func (f *seedFlags) BooleanValue(_ context.Context, orgID uuid.UUID, key string) (bool, error) {
	f.calls++
	f.orgID = orgID
	if key != "ai-credits" {
		return false, nil
	}
	return f.enabled, nil
}

func TestSeederPolicyInheritsReaderAndResolvesTargetOrganization(t *testing.T) {
	for _, enabled := range []bool{false, true} {
		flags := &seedFlags{enabled: enabled}
		sc := NewSeederContext(nil, nil)
		sc.PlatformFlags = flags
		orgID := uuid.New()
		scoped := sc.WithOrganization(orgID, uuid.New())
		require.Same(t, flags, scoped.PlatformFlags)
		require.Zero(t, flags.calls, "constructing a seeder graph must not evaluate a flag")
		ctx := scoped.AIPolicy.Resolve(t.Context(), orgID)
		require.Equal(t, enabled, scoped.AIPolicy.Enabled(ctx))
		require.Equal(t, orgID, flags.orgID)
		require.Equal(t, 1, flags.calls)
	}
}

func TestSeederWithoutReaderDeniesAI(t *testing.T) {
	sc := NewSeederContext(nil, nil).WithOrganization(uuid.New(), uuid.New())
	ctx := sc.AIPolicy.Resolve(t.Context(), sc.OrganizationID)
	require.False(t, sc.AIPolicy.Enabled(ctx))
}
