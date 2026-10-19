package reportentitlementusagemetric

import (
	"context"
	"testing"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/stretchr/testify/require"
)

func TestDirectAIReportRejectsGenericKeyBeforeAnyDependency(t *testing.T) {
	h := NewUseCase(Deps{})
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
