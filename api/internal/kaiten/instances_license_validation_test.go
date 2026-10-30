package kaiten

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

func TestLicenseValidationRequiresInstanceReadScope(t *testing.T) {
	// A nil use case proves the facade rejects before any database lookup.
	for _, grants := range [][]string{nil, {"read:feature_flags"}, {"read:licenses"}} {
		cl := caller.Static(uuid.New(), uuid.New(), grants)
		result, err := (Instances{}).GetLicenseValidation(t.Context(), cl, "ninja-prod")
		require.Nil(t, result)
		require.Error(t, err)
	}
}
