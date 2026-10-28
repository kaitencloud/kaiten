package demo

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/seeder"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
)

func TestDisabledDemoAISeedDoesNotTouchAnyDependency(t *testing.T) {
	// A zero context has no pool, models, grants or report writers.
	require.NoError(t, (&Profile{}).seedAI(t.Context(), &seeder.SeederContext{}, nil, []seededInstance{{}}))
}

type demoFlagReader struct {
	orgID uuid.UUID
	key   string
	err   error
}

func (f *demoFlagReader) BooleanValue(_ context.Context, orgID uuid.UUID, key string) (bool, error) {
	f.orgID, f.key = orgID, key
	return false, f.err
}

func TestDemoAIReadsTargetEligibilityWithoutWritingAnyFlag(t *testing.T) {
	for _, readErr := range []error{nil, errors.New("source unavailable")} {
		flags := &demoFlagReader{err: readErr}
		orgID := uuid.New()
		// Every writer and the DB are nil: refusal must only read this source.
		sc := &seeder.SeederContext{OrganizationID: orgID, AIPolicy: aiusage.Policy{Flags: flags}}
		require.NoError(t, (&Profile{}).seedAI(t.Context(), sc, nil, []seededInstance{{}}))
		require.Equal(t, orgID, flags.orgID)
		require.Equal(t, "ai-credits", flags.key)
	}
}

func TestOrdinaryDemoFlagsNeverContainPlatformAIRollout(t *testing.T) {
	for _, flag := range featureFlags {
		require.NotEqual(t, "ai-credits", flag.Slug)
	}
}
