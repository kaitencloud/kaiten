package kaiten

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/cdc"
)

// A heartbeat arrives every minute from every Debezium and is acknowledged before
// anything else runs. Success rather than Drop, because Dapr warns on every Drop.
func TestHandleAcknowledgesHeartbeat(t *testing.T) {
	// A zero Events on purpose: a heartbeat must reach neither the dispatcher nor the
	// organization use cases, and their nil fields would panic if it did.
	var events Events

	heartbeat := []byte(`{"specversion":"1.0","type":"cloud.kaiten.cdc.heartbeat","source":"/debezium/heartbeat",` +
		`"id":"heartbeat","datacontenttype":"application/json","data":{}}`)
	assert.Equal(t, cdc.Success, events.Handle(context.Background(), heartbeat))
}
