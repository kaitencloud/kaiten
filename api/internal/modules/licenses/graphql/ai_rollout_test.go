package graphql

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

func TestDisabledConversionRuleBatchDeniesBeforeRepositoryEvenForAliases(t *testing.T) {
	ctx := principal.ContextWithPrincipal(t.Context(), &principal.Principal{Kind: principal.KindOrganization, OrganizationID: uuid.New(), UserID: uuid.New()})
	id := uuid.New()
	results := newConversionRulesBatchFn(nil, aiusage.Policy{})(ctx, []ConversionRulesKey{{LicenseID: id}, {LicenseID: id, Status: "ARCHIVED"}})
	require.Len(t, results, 2)
	for _, result := range results {
		require.Equal(t, "AIUsage.Disabled", apierrors.GetCode(result.Error))
		require.Empty(t, result.Data)
	}
}
