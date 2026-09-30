// Package getpreferences renders the settings matrix: every notifiable event,
// with this user's effective value per channel.
package getpreferences

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/schema"
)

// Reader is the one query this needs.
type Reader interface {
	ListNotificationPreferences(ctx context.Context, userID uuid.UUID) ([]db.ListNotificationPreferencesRow, error)
}

type UseCase struct {
	reader Reader
}

func NewUseCase(reader Reader) *UseCase {
	return &UseCase{reader: reader}
}

func (uc *UseCase) Execute(ctx context.Context, userID uuid.UUID) (schema.PreferenceMatrix, error) {
	overrides, err := uc.reader.ListNotificationPreferences(ctx, userID)
	if err != nil {
		return schema.PreferenceMatrix{}, err
	}

	return Matrix(overrides), nil
}

// Matrix overlays stored overrides on the catalogue defaults. Exported because
// the PUT answers with the same shape, from the same rules -- two renderings of
// the matrix that could disagree is exactly the bug this avoids.
func Matrix(overrides []db.ListNotificationPreferencesRow) schema.PreferenceMatrix {
	stored := map[string]map[string]bool{}
	for _, override := range overrides {
		if stored[override.EventName] == nil {
			stored[override.EventName] = map[string]bool{}
		}
		stored[override.EventName][override.Channel] = override.Enabled
	}

	channels := make([]string, 0, len(catalogue.Channels))
	for _, channel := range catalogue.Channels {
		channels = append(channels, string(channel))
	}

	events := make([]schema.PreferenceEvent, 0, len(catalogue.All()))
	for _, entry := range catalogue.All() {
		values := make(map[string]bool, len(catalogue.Channels))
		for _, channel := range catalogue.Channels {
			value := entry.DefaultFor(channel)
			if override, ok := stored[entry.Event.Name][string(channel)]; ok {
				value = override
			}
			values[string(channel)] = value
		}

		events = append(events, schema.PreferenceEvent{
			EventName: entry.Event.Name,
			EventType: entry.Event.Type,
			Label:     entry.Label,
			Group:     entry.Group,
			Channels:  values,
		})
	}

	return schema.PreferenceMatrix{Channels: channels, Events: events}
}
