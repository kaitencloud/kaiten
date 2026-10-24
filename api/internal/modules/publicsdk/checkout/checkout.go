// Package checkout is what the anonymous checkout use cases share (Tier 2,
// V32-01, §14.8): the shape of their events and its webhook contracts.
//
// A visitor whom the vendor's backend does not know yet starts a checkout
// with a publishable key and a Turnstile token; only a checkout_session row
// exists until a payment method is set up, and the completion creates the
// customer, the instance and the subscription in one transaction (§9.12).
package checkout

import (
	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/events"
)

// Statuses of a checkout session (checkout_session_status).
const (
	StatusOpen            = "OPEN"
	StatusAwaitingPayment = "AWAITING_PAYMENT"
	StatusCompleted       = "COMPLETED"
	StatusAbandoned       = "ABANDONED"
	StatusExpired         = "EXPIRED"
)

// SessionEvent is the payload of the three checkout_session events (§15.1).
// With the trial reminder, the only payloads that carry an e-mail (§15.2
// rule 4): for a buyer with no account, the vendor's one link besides
// clientReferenceId.
type SessionEvent struct {
	SessionID         uuid.UUID `json:"sessionId"`
	Email             string    `json:"email" doc:"The address the visitor gave at the start"`
	ClientReferenceID *string   `json:"clientReferenceId" nullable:"true" doc:"The vendor's opaque reference, as given at the start"`
	LicenseSlug       string    `json:"licenseSlug"`
	BillingPeriod     string    `json:"billingPeriod" enum:"MONTHLY,QUARTERLY,SEMI_ANNUAL,ANNUAL"`
	CustomerSlug      *string   `json:"customerSlug" nullable:"true" doc:"The customer the completion created; null before"`
	InstanceSlug      *string   `json:"instanceSlug" nullable:"true" doc:"The instance the completion created; null before"`
	Status            string    `json:"status" enum:"OPEN,COMPLETED,ABANDONED,EXPIRED" doc:"OPEN on started, COMPLETED on completed; on abandoned, ABANDONED (never completed, slugs null) or EXPIRED (its INCOMPLETE subscription expired or was canceled unpaid, slugs set)"`
}

// RegisterWebhooks declares the checkout_session events' webhook contracts.
func RegisterWebhooks(api huma.API) {
	tags := []string{"webhooks", "checkout-sessions"}
	webhook.Declare(api,
		webhook.Declaration{
			Event: events.CheckoutSessionStarted, Data: (*SessionEvent)(nil), OperationID: "onCheckoutSessionStarted",
			Summary:     "Checkout Session Started Webhook",
			Description: "Triggered when an anonymous checkout starts (POST /public/checkout-sessions). A dryRun emits nothing.",
			Tags:        tags,
		},
		webhook.Declaration{
			Event: events.CheckoutSessionCompleted, Data: (*SessionEvent)(nil), OperationID: "onCheckoutSessionCompleted",
			Summary:     "Checkout Session Completed Webhook",
			Description: "Triggered when an anonymous checkout completes: its ACTIVATION invoice is paid, or nothing was due. Carries the customer and instance it created; provision on this event, never on instance.v1.created.",
			Tags:        tags,
		},
		webhook.Declaration{
			Event: events.CheckoutSessionAbandoned, Data: (*SessionEvent)(nil), OperationID: "onCheckoutSessionAbandoned",
			Summary:     "Checkout Session Abandoned Webhook",
			Description: "Triggered when an anonymous checkout ends unpaid: still OPEN 24 h after its start (status ABANDONED), or its INCOMPLETE subscription expired or was canceled (status EXPIRED, with the customer and instance to clean up).",
			Tags:        tags,
		},
	)
}
