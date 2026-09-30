// Package putpreferences stores a user's notification choices.
package putpreferences

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/announce"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/getpreferences"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/schema"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type UseCase struct {
	uof     *uow.UnitOfWork
	queries func(uow.DBTX) *db.Queries
}

func NewUseCase(uof *uow.UnitOfWork, queries func(uow.DBTX) *db.Queries) *UseCase {
	return &UseCase{uof: uof, queries: queries}
}

// Execute replaces the caller's preferences for the events named in the update.
//
// A value equal to the catalogue default deletes the row instead of storing it.
// That is not an optimization: storing "the default, again" freezes today's
// default into that user, so a later decision to turn an event on by default
// would reach everybody except the people who had once opened the settings page.
func (uc *UseCase) Execute(
	ctx context.Context, userID uuid.UUID, updates []schema.PreferenceUpdate,
) (schema.PreferenceMatrix, error) {
	type deletion struct {
		channel   string
		eventName string
	}

	var (
		upserts   []db.UpsertNotificationPreferenceParams
		deletions []deletion
	)

	for _, update := range updates {
		entry, known := catalogue.Lookup(update.EventName)
		if !known {
			return schema.PreferenceMatrix{}, kaitenerrors.Validation("Notifications.UnknownEvent",
				"no notifiable event named "+update.EventName)
		}

		for channel, enabled := range update.Channels {
			if !isServedChannel(channel) {
				return schema.PreferenceMatrix{}, kaitenerrors.Validation("Notifications.UnknownChannel",
					"no notification channel named "+channel)
			}

			if entry.DefaultFor(catalogue.Channel(channel)) == enabled {
				deletions = append(deletions, deletion{channel: channel, eventName: update.EventName})

				continue
			}

			upserts = append(upserts, db.UpsertNotificationPreferenceParams{
				UserID:    userID,
				EventName: update.EventName,
				Channel:   channel,
				Enabled:   enabled,
			})
		}
	}

	var matrix schema.PreferenceMatrix

	err := uc.uof.Transact(ctx, func(ctx context.Context) error {
		queries := uc.queries(uc.uof.DBTX(ctx))

		byChannel := map[string][]string{}
		for _, item := range deletions {
			byChannel[item.channel] = append(byChannel[item.channel], item.eventName)
		}
		for channel, eventNames := range byChannel {
			if err := queries.DeleteNotificationPreferences(ctx, db.DeleteNotificationPreferencesParams{
				UserID: userID, EventNames: eventNames, Channel: channel,
			}); err != nil {
				return err
			}
		}

		for _, upsert := range upserts {
			if err := queries.UpsertNotificationPreference(ctx, upsert); err != nil {
				return err
			}
		}

		rows, err := queries.ListNotificationPreferences(ctx, userID)
		if err != nil {
			return err
		}
		matrix = getpreferences.Matrix(rows)

		// In the same transaction as the write, so a replica holding this user's
		// stream is told only if the change actually committed.
		announce.AnnouncePreferences(ctx, uc.uof.DBTX(ctx), userID)

		return nil
	})
	if err != nil {
		return schema.PreferenceMatrix{}, err
	}

	return matrix, nil
}

func isServedChannel(channel string) bool {
	for _, served := range catalogue.Channels {
		if string(served) == channel {
			return true
		}
	}

	return false
}
