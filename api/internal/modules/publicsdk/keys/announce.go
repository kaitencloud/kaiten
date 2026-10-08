package keys

import (
	"context"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenevents "github.com/kaitencloud/kaiten/api/internal/infrastructure/events"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/events"
)

// PublishableKeyEvent is the payload of the key events (§15.1): never the key,
// only its hint.
type PublishableKeyEvent struct {
	ID             uuid.UUID  `json:"id"`
	Label          string     `json:"label"`
	KeyHint        string     `json:"keyHint" doc:"The last four characters of the key"`
	AllowedOrigins []string   `json:"allowedOrigins" nullable:"false"`
	RevokedAt      *time.Time `json:"revokedAt,omitempty"`
}

// Announce records a key event in the transaction ctx carries.
func Announce(ctx context.Context, box *outbox.ScopedRepository, organizationID uuid.UUID, event kaitenevents.Metadata, key PublishableKey) error {
	return box.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(organizationID, event.Name, event.Type, PublishableKeyEvent{
		ID: key.ID, Label: key.Label, KeyHint: key.KeyHint, AllowedOrigins: key.AllowedOrigins, RevokedAt: key.RevokedAt,
	}, nil))
}

// RegisterWebhooks declares the key events' webhook contracts.
func RegisterWebhooks(api huma.API) {
	webhook.Declare(api,
		webhook.Declaration{
			Event: events.PublishableKeyCreated, Data: (*PublishableKeyEvent)(nil), OperationID: "onPublishableKeyCreated",
			Summary:     "Publishable Key Created Webhook",
			Description: "Triggered when a publishable key is issued. The key is never in the payload, only its hint.",
			Tags:        []string{"webhooks", "publishable-keys"},
		},
		webhook.Declaration{
			Event: events.PublishableKeyRevoked, Data: (*PublishableKeyEvent)(nil), OperationID: "onPublishableKeyRevoked",
			Summary:     "Publishable Key Revoked Webhook",
			Description: "Triggered once, when a publishable key is revoked.",
			Tags:        []string{"webhooks", "publishable-keys"},
		},
	)
}
