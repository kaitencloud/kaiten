package announce_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	instanceevents "github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/announce"
)

type recordingDBTX struct {
	calls int
	args  []any
}

func (r *recordingDBTX) Exec(_ context.Context, _ string, args ...any) (pgconn.CommandTag, error) {
	r.calls++
	r.args = args

	return pgconn.CommandTag{}, nil
}

func (r *recordingDBTX) Query(context.Context, string, ...any) (pgx.Rows, error) { return nil, nil }
func (r *recordingDBTX) QueryRow(context.Context, string, ...any) pgx.Row        { return nil }

func TestANotifiableEventIsAnnounced(t *testing.T) {
	t.Parallel()

	dbtx := &recordingDBTX{}
	organizationID, auditTrailID := uuid.New(), uuid.New()

	require.NoError(t, announce.NewPublisher().Announce(
		context.Background(), dbtx, organizationID, auditTrailID, instanceevents.InstanceDeployed.Name))

	require.Equal(t, 1, dbtx.calls)
	require.Len(t, dbtx.args, 2)
	assert.Equal(t, announce.Channel, dbtx.args[0])

	event, ok := announce.ParseEvent(dbtx.args[1].(string))
	require.True(t, ok)
	assert.Equal(t, organizationID, event.OrganizationID)
	assert.Equal(t, auditTrailID, event.NotificationID)
	assert.Equal(t, instanceevents.InstanceDeployed.Name, event.EventName)
}

func TestAnEventNobodyCanSubscribeToWakesNothing(t *testing.T) {
	t.Parallel()

	// The audit trail records every event in the system, including the ones that
	// fire on every flag evaluation. Waking every replica for those would be pure
	// cost, so notifiability is decided before the NOTIFY, not after.
	dbtx := &recordingDBTX{}

	require.NoError(t, announce.NewPublisher().Announce(
		context.Background(), dbtx, uuid.New(), uuid.New(), instanceevents.EntitlementValueGet.Name))

	assert.Zero(t, dbtx.calls)
}

func TestAnUnreadablePayloadIsRejected(t *testing.T) {
	t.Parallel()

	_, ok := announce.ParseEvent("not json")
	assert.False(t, ok)

	_, ok = announce.ParseEvent(`{"o":"00000000-0000-0000-0000-000000000000","i":"00000000-0000-0000-0000-000000000000"}`)
	assert.False(t, ok, "a payload naming no organization or notification is not actionable")
}
