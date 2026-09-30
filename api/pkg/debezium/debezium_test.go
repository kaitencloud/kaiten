package debezium

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

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
