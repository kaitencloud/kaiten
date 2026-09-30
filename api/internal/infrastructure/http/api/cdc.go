package api

import (
	"github.com/gofiber/fiber/v3"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/cdc"
	"github.com/kaitencloud/kaiten/api/internal/kaiten"
	"github.com/kaitencloud/kaiten/api/pkg/subscribers"
)

// registerCDC wires the CDC subscriptions on the /dapr group and returns the
// subscription metadata the sidecar discovery endpoint publishes.
//
// One route for the whole stream, not one per consumer. Dapr delivers to an app-id
// once, so a second route would be a second subscription and a second copy of every
// message -- the fan-out to the audit trail, the connectors and whatever comes next
// happens behind this handler, in internal/infrastructure/cdc, where each consumer
// has its own inbox row and its own transaction.
//
// The dead-letter route is the exception, and it is a second subscription rather
// than a second consumer for the same reason: it is fed by a different topic. The
// sidecar publishes there once the retry policy is spent, so a message reaching it
// has already been through this handler as many times as it is going to be.
//
// These reach HTTP through subscriptions rather than operations, so they appear in
// neither document: Dapr delivers to the route, and the returned metadata is what
// tells Dapr the route exists. Both halves have to agree, which is why the routes
// are prefixed here and not in cdc.Route -- the group's mount point is the
// transport's fact.
func registerCDC(daprGroup fiber.Router, app kaiten.Events) []subscribers.DaprHTTPSubscriber {
	// Dapr reads the decision out of a 200 body, and treats a non-2xx as RETRY
	// whatever the body says. So the decision is always spelled with a 200 --
	// including Drop, which is a deliberate discard and not an error the broker
	// should second-guess.
	daprGroup.Post(cdc.Route, func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": string(app.Handle(c.Context(), c.Body()))})
	})

	daprGroup.Post(cdc.DeadLetterRoute, func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": string(app.HandleDeadLetter(c.Context(), c.Body()))})
	})

	return []subscribers.DaprHTTPSubscriber{
		{
			PubsubName: cdc.PubsubName,
			Topic:      cdc.Topic,
			Route:      "/dapr" + cdc.Route,
			// Named here, so the sidecar knows where to put a delivery this route
			// kept refusing. The retry policy that decides WHEN it gives up is the
			// sidecar's own resource, not this subscription's -- see cdc.DeadLetterTopic.
			DeadLetterTopic: cdc.DeadLetterTopic,
		},
		{
			PubsubName: cdc.PubsubName,
			Topic:      cdc.DeadLetterTopic,
			Route:      "/dapr" + cdc.DeadLetterRoute,
			// No dead letter for the dead letter. The handler acknowledges
			// unconditionally, so there is nothing for one to catch, and a topic
			// pointing at itself is how a permanently failing message becomes a loop.
		},
	}
}
