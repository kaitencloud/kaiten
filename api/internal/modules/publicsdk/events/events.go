// Package events names the events the public SDK module records.
package events

import "github.com/kaitencloud/kaiten/api/internal/infrastructure/events"

var (
	PublishableKeyCreated = events.New("PUBLISHABLE_KEY_CREATED", "com.kaiten.publishable_key.v1.created")
	PublishableKeyRevoked = events.New("PUBLISHABLE_KEY_REVOKED", "com.kaiten.publishable_key.v1.revoked")

	// An anonymous checkout's lifecycle (V32-01, §14.8): the only events that
	// carry the visitor's e-mail (§15.2 rule 4).
	CheckoutSessionStarted   = events.New("CHECKOUT_SESSION_STARTED", "com.kaiten.checkout_session.v1.started")
	CheckoutSessionCompleted = events.New("CHECKOUT_SESSION_COMPLETED", "com.kaiten.checkout_session.v1.completed")
	CheckoutSessionAbandoned = events.New("CHECKOUT_SESSION_ABANDONED", "com.kaiten.checkout_session.v1.abandoned")
)
