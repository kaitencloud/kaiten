package reportentitlementusagemetric

import (
	"context"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usage"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

func TestDirectAIReportRejectsGenericKeyBeforeDatabase(t *testing.T) {
	h := NewUseCase(Deps{AIPolicy: aiusage.Policy{Enabled: true}, UserProvider: &currentuser.StaticUserProvider{UserID: uuid.New(), OrganizationID: uuid.New()}})
	key := "numeric-key"
	result, err := h.Execute(context.Background(), "instance", "pool", &Command{TransactionID: &key, AI: &schema.AiUsageValue{TransactionID: "ai-key", Phase: "commit"}})
	require.Nil(t, result)
	var domain *apierrors.Error
	require.ErrorAs(t, err, &domain)
	require.Equal(t, "ReportEntitlementUsageMetric.AiIdempotencyKeyUnsupported", domain.Code)
}

func TestReportedSeparatesAIImmutableReplayAndNumericJournalReplay(t *testing.T) {
	original := &schema.EntitlementUsage{Source: schema.SourceLicense, Provenance: &schema.Provenance{}, AI: &schema.AiUsageOutcome{TransactionID: "ai-key"}}
	first := reported(original, false, nil)
	replay := reported(original, true, nil)
	require.Equal(t, first, replay)
	require.NotNil(t, replay.Source)
	require.Same(t, original.Provenance, replay.Provenance)
	require.Nil(t, replay.TransactionID)
	original.AI = nil
	numericReplay := reported(original, true, nil)
	require.Nil(t, numericReplay.Source)
	require.Nil(t, numericReplay.Provenance)
}

func TestExtractedNumericReportPreservesExceptionSourceAndLockedLicence(t *testing.T) {
	licenceID := uuid.New()
	licenceSlug := "locked-version"
	st := &State{Pair: &UsageContext{LicenseID: licenceID, LicenseSlug: &licenceSlug, EntitlementSlug: "pool", Source: "exception", Provenance: []byte(`{}`), EffectiveValue: []byte(`{"type":"number","value":10}`)}, Limit: usage.Limit{Threshold: 10}, AggregationMethod: "SUM"}
	eff, err := (numberKind{}).plan(st, &Command{Value: 1, Behavior: BehaviorAppend})
	require.NoError(t, err)
	require.Equal(t, "exception", eff.Response.Source)
	require.Equal(t, licenceID, eff.Response.LicenseID)
	require.Equal(t, licenceSlug, eff.Response.LicenseSlug)
}

func TestExtractedNumericReportKeepsInvalidBehaviorUnprocessable(t *testing.T) {
	_, err := (numberKind{}).plan(&State{Pair: &UsageContext{}, AggregationMethod: "SUM"}, &Command{Behavior: "invalid"})
	var domain *apierrors.Error
	require.ErrorAs(t, err, &domain)
	require.Equal(t, "ReportEntitlementUsageMetric.InvalidBehavior", domain.Code)
	require.Equal(t, http.StatusUnprocessableEntity, domain.HTTPStatus())
}
