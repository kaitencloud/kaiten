package subscribers_test

import (
	"encoding/json"
	"io"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/pkg/subscribers"
)

// What GET /dapr/subscribe answers is a contract with the sidecar, and the sidecar
// reads it once at startup: a key spelled wrong here is a subscription that looks
// registered and silently has no dead letter, which is the failure this field was
// added to fix.
func TestMountAdvertisesTheDeadLetterTopicOnlyWhenThereIsOne(t *testing.T) {
	app := fiber.New()
	subscribers.Mount(app.Group("/dapr"), []subscribers.DaprHTTPSubscriber{
		{PubsubName: "p", Topic: "t", Route: "/dapr/t", DeadLetterTopic: "t.dlq"},
		{PubsubName: "p", Topic: "t.dlq", Route: "/dapr/t/dead-letter"},
	})

	resp, err := app.Test(httptest.NewRequest("GET", "/dapr/subscribe", nil))
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)

	var got []map[string]any
	require.NoError(t, json.Unmarshal(body, &got))
	require.Len(t, got, 2)

	// The exact key Dapr reads, camelCase among three lowercase ones. It is
	// spelled here so a rename has to change two places rather than one.
	assert.Equal(t, "t.dlq", got[0]["deadLetterTopic"])
	assert.Equal(t, "p", got[0]["pubsubname"])
	assert.Equal(t, "/dapr/t", got[0]["route"])

	// Absent, not empty. Dapr reads "" as a topic named "", so an unconditional
	// key would give every subscription a dead letter nobody subscribes to.
	assert.NotContains(t, got[1], "deadLetterTopic")
}
