package localai

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/openfeature"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/evaluator"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
)

func TestLocalAIFlagDefaultsOffAndTargetsActualOrganization(t *testing.T) {
	// Deliberately not the profile's static requested Sushi UUID.
	actualTenantID := uuid.New()
	flag := localAIFlag(actualTenantID)
	require.Equal(t, "ai-credits", flag.Slug)
	require.Equal(t, "boolean", flag.Type)
	require.Equal(t, false, flag.GetVariantSet()["off"])
	require.Equal(t, true, flag.GetVariantSet()["on"])
	require.Equal(t, schema.BasicVariant("off"), flag.DefaultVariant.Value)
	require.Equal(t, false, flag.Metadata["fallback_value"])
	for _, test := range []struct {
		name string
		id   uuid.UUID
		want bool
	}{
		{"actual tenant", actualTenantID, true},
		{"other tenant", uuid.New(), false},
		{"requested legacy ID is not authoritative", uuid.MustParse("55555555-5555-5555-5555-555555555555"), false},
	} {
		t.Run(test.name, func(t *testing.T) {
			details, err := evaluator.NewEvaluator().Evaluate(t.Context(), flag, openfeature.EvaluationContext{
				TargetingKey: test.id.String(), Inputs: map[string]any{"organizationId": test.id.String()},
			})
			require.NoError(t, err)
			require.Nil(t, details.ErrorCode)
			require.Equal(t, test.want, details.Value)
		})
	}
}

func TestLocalAIFlagDefinitionIsRepeatableAndDisabledFallsBackFalse(t *testing.T) {
	id := uuid.New()
	first, err := json.Marshal(localAIFlag(id))
	require.NoError(t, err)
	second, err := json.Marshal(localAIFlag(id))
	require.NoError(t, err)
	require.JSONEq(t, string(first), string(second))
	flag := localAIFlag(id)
	flag.Enabled = false
	details, err := evaluator.NewEvaluator().Evaluate(t.Context(), flag, openfeature.EvaluationContext{
		TargetingKey: id.String(), Inputs: map[string]any{"organizationId": id.String()},
	})
	require.NoError(t, err)
	require.Equal(t, false, details.Value)
}
