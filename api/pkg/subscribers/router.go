package subscribers

import "github.com/gofiber/fiber/v3"

// DaprHTTPSubscriber holds the Dapr pub/sub metadata that the sidecar reads from GET /dapr/subscribe.
type DaprHTTPSubscriber struct {
	PubsubName string
	Topic      string
	Route      string // full route exposed to the sidecar, e.g. /dapr/cdc/events
	// DeadLetterTopic is where the sidecar publishes a delivery this subscription
	// never managed to accept: the retry policy ran out, and the alternative to a
	// second topic is discarding the message.
	//
	// It belongs on the subscription rather than on the component because it is a
	// property of who is consuming, not of the broker -- two subscriptions on one
	// pubsub can want different answers to "what happens when I keep failing", and
	// one of them wanting none is the ordinary case. Empty means no dead-letter
	// topic, and the field is omitted from the response entirely; Dapr reads an
	// empty string as a topic named "", which is not the same thing.
	DeadLetterTopic string
}

// Mount registers GET /dapr/subscribe on group using the collected subscription metadata.
// Call this after all modules have registered their handlers on the group.
func Mount(group fiber.Router, subs []DaprHTTPSubscriber) {
	list := make([]fiber.Map, len(subs))
	for i, s := range subs {
		entry := fiber.Map{"pubsubname": s.PubsubName, "topic": s.Topic, "route": s.Route}
		if s.DeadLetterTopic != "" {
			entry["deadLetterTopic"] = s.DeadLetterTopic
		}
		list[i] = entry
	}
	group.Get("/subscribe", func(c fiber.Ctx) error {
		return c.JSON(list)
	})
}
