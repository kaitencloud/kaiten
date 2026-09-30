package featureflag

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/openfeature"
)

/*
TestTheEnginesOwnDeadlineIsReportedAsSuch: when the engine's deadline, not the
caller's, stops a rule, the author is told the rule ran too long.

The deadline is shortened here because no rule known to stay under the cost
limit runs for a second — that is what the limit is for. This loop would take
tens of milliseconds to reach the limit, so a deadline of two fires first.
*/
func TestTheEnginesOwnDeadlineIsReportedAsSuch(t *testing.T) {
	items := make([]any, 50_000)
	for i := range items {
		items[i] = 0.0
	}
	engine, err := NewEngine(openfeature.EvaluationContext{TargetingKey: "user-1", Inputs: map[string]any{"items": items}})
	require.NoError(t, err)

	matched, err := engine.evaluateWithin(t.Context(), "items.all(a, true)", 2*time.Millisecond)

	var evalErr *EvalError
	require.ErrorAs(t, err, &evalErr)
	assert.ErrorIs(t, err, ErrRuleTimedOut)
	assert.NotErrorIs(t, err, ErrRuleTooCostly)
	assert.False(t, matched)
}
