package seeder

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
)

func TestSeederPolicyPreservesUnrelatedZeroSettingsAndOrganizationInheritance(t *testing.T) {
	for _, enabled := range []bool{false, true} {
		policy := aiusage.Policy{Enabled: enabled}
		cfg := seedConfig(policy)
		require.Equal(t, enabled, cfg.AIUsage.Enabled)
		require.False(t, cfg.Billing.Enabled, "AI opt-in must not opt the seeder into billing")
		sc := NewSeederContext(nil, nil)
		sc.AIPolicy = policy
		scoped := sc.WithOrganization(uuid.New(), uuid.New())
		require.Equal(t, policy, scoped.AIPolicy)
	}
}
