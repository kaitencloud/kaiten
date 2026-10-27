package previewlicenseinvoice

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/gate"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type unavailableFlags struct{ calls int }

func (f *unavailableFlags) BooleanValue(context.Context, uuid.UUID, string) (bool, error) {
	f.calls++
	return false, errors.New("platform source unavailable")
}

func TestFinancialPreviewValidationDoesNotEvaluateAIAvailability(t *testing.T) {
	flags := &unavailableFlags{}
	u := NewUseCase(prices.Deps{
		AIPolicy: aiusage.Policy{Flags: flags}, Gate: gate.New(true, nil),
		UserProvider: &currentuser.StaticUserProvider{UserID: uuid.New(), OrganizationID: uuid.New()},
	}, nil)
	// Validation stops before any database read. A financial preview must not
	// ask an unavailable rollout source or classify the entire licence first.
	_, err := u.Execute(t.Context(), "mixed-license", Scenario{SampleUsage: []Sample{{EntitlementSlug: "ordinary", Quantity: "-1"}}})
	require.Equal(t, "PreviewLicenseInvoice.InvalidSampleUsage", apierrors.GetCode(err))
	require.Zero(t, flags.calls)
}
