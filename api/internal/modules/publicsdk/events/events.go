// Package events names the events the public SDK module records.
package events

import "github.com/kaitencloud/kaiten/api/internal/infrastructure/events"

var (
	PublishableKeyCreated = events.New("PUBLISHABLE_KEY_CREATED", "com.kaiten.publishable_key.v1.created")
	PublishableKeyRevoked = events.New("PUBLISHABLE_KEY_REVOKED", "com.kaiten.publishable_key.v1.revoked")
)
