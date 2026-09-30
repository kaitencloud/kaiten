package getpreferences_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	instanceevents "github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/getpreferences"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/schema"
)

func find(t *testing.T, matrix schema.PreferenceMatrix, eventName string) schema.PreferenceEvent {
	t.Helper()

	for _, event := range matrix.Events {
		if event.EventName == eventName {
			return event
		}
	}

	t.Fatalf("event %q is not in the matrix", eventName)

	return schema.PreferenceEvent{}
}

func TestMatrixCoversEveryNotifiableEvent(t *testing.T) {
	t.Parallel()

	matrix := getpreferences.Matrix(nil)

	assert.Len(t, matrix.Events, len(catalogue.All()))
	assert.Equal(t, []string{string(catalogue.ChannelInApp)}, matrix.Channels)
}

func TestMatrixReportsDefaultsWhenTheUserHasChosenNothing(t *testing.T) {
	t.Parallel()

	matrix := getpreferences.Matrix(nil)

	assert.True(t, find(t, matrix, instanceevents.InstanceDeployed.Name).Channels[string(catalogue.ChannelInApp)])
	assert.False(t, find(t, matrix, instanceevents.InstanceStatusChanged.Name).Channels[string(catalogue.ChannelInApp)])
}

func TestAnOverrideWins(t *testing.T) {
	t.Parallel()

	matrix := getpreferences.Matrix([]db.ListNotificationPreferencesRow{
		{EventName: instanceevents.InstanceDeployed.Name, Channel: string(catalogue.ChannelInApp), Enabled: false},
	})

	assert.False(t, find(t, matrix, instanceevents.InstanceDeployed.Name).Channels[string(catalogue.ChannelInApp)])
}

func TestEveryEventCarriesWhatTheSettingsPageNeedsToGroupIt(t *testing.T) {
	t.Parallel()

	matrix := getpreferences.Matrix(nil)

	for _, event := range matrix.Events {
		require.NotEmpty(t, event.Label, "%s has no label to render", event.EventName)
		require.NotEmpty(t, event.Group, "%s has no group to render under", event.EventName)
	}
}
