package combined

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

func TestParse_NamesTheRuleBroken(t *testing.T) {
	source := func(slug, weight string) schema.EntitlementSource {
		return schema.EntitlementSource{EntitlementSlug: slug, Weight: weight}
	}

	for _, tt := range []struct {
		name    string
		sources []schema.EntitlementSource
		code    string
	}{
		{"none", nil, "UpdateEntitlement.CombinedSourcesRequired"},
		{"one", []schema.EntitlementSource{source("a-source", "1")}, "UpdateEntitlement.CombinedSourcesRequired"},
		{"twice", []schema.EntitlementSource{source("a-source", "1"), source("a-source", "1")}, "UpdateEntitlement.CombinedSourceDuplicate"},
		{"weight zero", []schema.EntitlementSource{source("a-source", "0"), source("b-source", "1")}, "UpdateEntitlement.CombinedSourceWeightInvalid"},
		{"weight text", []schema.EntitlementSource{source("a-source", "x"), source("b-source", "1")}, "UpdateEntitlement.CombinedSourceWeightInvalid"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			_, err := Parse("UpdateEntitlement", tt.sources)

			require.Error(t, err)
			require.True(t, kaitenerrors.IsUnprocessable(err), "every one is a 422")
			require.Equal(t, tt.code, kaitenerrors.GetCode(err))
		})
	}

	parsed, err := Parse("CreateEntitlement", []schema.EntitlementSource{source("a-source", "0.4"), source("b-source", "")})
	require.NoError(t, err)
	require.Len(t, parsed, 2)
}

func TestRefuseWarningThreshold(t *testing.T) {
	require.NoError(t, RefuseWarningThreshold("CreateEntitlement", nil))
	require.NoError(t, RefuseWarningThreshold("CreateEntitlement", ptr.To(int32(0))), "0 is what the API answers for every NUMBER")

	err := RefuseWarningThreshold("CreateEntitlement", ptr.To(int32(80)))
	require.True(t, kaitenerrors.IsUnprocessable(err))
	require.Equal(t, "CreateEntitlement.CombinedWarningThreshold", kaitenerrors.GetCode(err))
}

func TestCheckWindow(t *testing.T) {
	monthly := &Resolved{ResetPeriod: ptr.To(period.Month), ResetAnchor: ptr.To(period.Calendar)}
	lifetime := &Resolved{}

	t.Run("a caller that sends none is given the sources'", func(t *testing.T) {
		require.NoError(t, monthly.CheckWindow("CreateEntitlement", nil, nil))
		require.NoError(t, lifetime.CheckWindow("CreateEntitlement", nil, nil))
	})

	t.Run("a caller that sends the sources' is accepted", func(t *testing.T) {
		require.NoError(t, monthly.CheckWindow("CreateEntitlement", ptr.To(period.Month), ptr.To(period.Calendar)))
	})

	for _, tt := range []struct {
		name     string
		resolved *Resolved
		period   *period.ResetPeriod
		anchor   *period.ResetAnchor
	}{
		{"another period", monthly, ptr.To(period.Week), ptr.To(period.Calendar)},
		{"another anchor", monthly, ptr.To(period.Month), ptr.To(period.LicenseStart)},
		{"a period for lifetime sources", lifetime, ptr.To(period.Month), ptr.To(period.Calendar)},
		{"a lifetime one for periodic sources: sending the anchor alone", monthly, nil, ptr.To(period.Calendar)},
	} {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.resolved.CheckWindow("UpdateEntitlement", tt.period, tt.anchor)

			require.Error(t, err)
			require.True(t, kaitenerrors.IsUnprocessable(err))
			require.Equal(t, "UpdateEntitlement.CombinedWindowMismatch", kaitenerrors.GetCode(err))
		})
	}
}
