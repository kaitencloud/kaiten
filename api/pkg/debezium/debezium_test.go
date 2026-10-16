package debezium

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The body below is the one the RabbitMQ sink publishes and the Dapr sidecar
// delivers, byte for byte, captured from Debezium Server 3.6.0 behind daprd 1.16.9.
func TestIsHeartbeat(t *testing.T) {
	for name, tc := range map[string]struct {
		body []byte
		want bool
	}{
		"a heartbeat": {
			body: []byte(`{"specversion":"1.0","type":"cloud.kaiten.cdc.heartbeat","source":"/debezium/heartbeat",` +
				`"id":"heartbeat","datacontenttype":"application/json","data":{}}`),
			want: true,
		},
		"a change event": {
			body: []byte(`{"id":"name:kaiten;lsn:600599280","source":"/debezium/postgresql/kaiten","specversion":"1.0",` +
				`"type":"io.debezium.connector.postgresql.DataChangeEvent","data":{"payload":{"after":{"id":"e1"}}}}`),
			want: false,
		},
		"the sink's own default null value": {body: []byte(`default`), want: false},
		"empty":                             {body: []byte{}, want: false},
	} {
		t.Run(name, func(t *testing.T) {
			assert.Equal(t, tc.want, IsHeartbeat(tc.body))
		})
	}
}

// HeartbeatType is one fact written in three places, and a disagreement fails
// quietly: heartbeats stop being recognised, fall through to the change-event path
// and are dropped -- one warning per subscriber per minute, forever. This holds the
// two configuration files to the constant.
func TestHeartbeatTypeMatchesDebeziumConfiguration(t *testing.T) {
	root := filepath.Join("..", "..", "..")
	for _, path := range []string{
		filepath.Join(root, "charts", "kaiten-infra", "templates", "debezium-server.yaml"),
		filepath.Join(root, "docker", "rabbitmq", "rabbitmq-debezium-application.properties"),
	} {
		t.Run(filepath.Base(path), func(t *testing.T) {
			content, err := os.ReadFile(path)
			require.NoError(t, err)
			assert.True(t, strings.Contains(string(content), `"type":"`+HeartbeatType+`"`),
				"%s must publish heartbeats as CloudEvents of type %q", path, HeartbeatType)
		})
	}
}

// TestParseReadsBothShapes holds the two shapes Debezium can deliver the outbox
// row in to one Event: the Outbox EventRouter's, which the charts and the local
// stack configure, and the raw change event a Debezium without it emits. Both
// must parse while a deployment moves from one to the other.
func TestParseReadsBothShapes(t *testing.T) {
	want := Event{
		ID:             "6e023c56-2678-438c-9169-4ec267c69b73",
		OrganizationID: "55555555-5555-5555-5555-555555555555",
		EventName:      "CUSTOMER_CREATED",
		EventType:      "com.kaiten.customer.v1.created",
		Data:           `{"name":"Probe"}`,
		Headers:        json.RawMessage(`"{\"traceparent\": \"00-9ed26f736f5cecde43e4ab55109cd63d-2f919e36866576b4-01\"}"`),
		OccurredAt:     time.Date(2026, 10, 16, 16, 28, 24, 328000000, time.UTC),
	}
	row := `"id":"6e023c56-2678-438c-9169-4ec267c69b73","organization_id":"55555555-5555-5555-5555-555555555555",` +
		`"event_name":"CUSTOMER_CREATED","event_type":"com.kaiten.customer.v1.created",` +
		`"occurred_at":"2026-10-16T16:28:24.328Z",` +
		`"headers":"{\"traceparent\": \"00-9ed26f736f5cecde43e4ab55109cd63d-2f919e36866576b4-01\"}"`

	for name, body := range map[string]string{
		"routed by the Outbox EventRouter": `{"id":"6e023c56-2678-438c-9169-4ec267c69b73","type":"com.kaiten.customer.v1.created",` +
			`"traceparent":"00-9ed26f736f5cecde43e4ab55109cd63d-2f919e36866576b4-01",` +
			`"data":{"schema":{},"payload":{"payload":"{\"name\":\"Probe\"}",` + row + `}}}`,
		"a raw change event": `{"id":"name:kaiten;lsn:600599280","type":"io.debezium.connector.postgresql.DataChangeEvent",` +
			`"data":{"schema":{},"payload":{"before":null,"after":{"data":"{\"name\":\"Probe\"}",` + row + `},"op":"c"}}}`,
	} {
		t.Run(name, func(t *testing.T) {
			got, err := Parse([]byte(body))
			require.NoError(t, err)
			assert.Equal(t, want, got)

			var data map[string]string
			require.NoError(t, got.ParseData(&data))
			assert.Equal(t, "Probe", data["name"])
		})
	}
}

// TestParseEnvelopeWithoutARow keeps the zero Event for an envelope that
// carries no row, which the caller drops on its empty ID.
func TestParseEnvelopeWithoutARow(t *testing.T) {
	for name, data := range map[string]string{
		"no payload":                 `{}`,
		"a null payload":             `{"payload":null}`,
		"a change event with no row": `{"payload":{"before":null,"after":null,"op":"c"}}`,
	} {
		t.Run(name, func(t *testing.T) {
			got, err := ParseEnvelope([]byte(data))
			require.NoError(t, err)
			assert.Empty(t, got.ID)
		})
	}
}
