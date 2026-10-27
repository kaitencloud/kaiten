package demo

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/seeder"
)

func TestDisabledDemoAISeedDoesNotTouchAnyDependency(t *testing.T) {
	// A zero context has no pool, models, grants or report writers.
	require.NoError(t, (&Profile{}).seedAI(t.Context(), &seeder.SeederContext{}, nil, []seededInstance{{}}))
}
