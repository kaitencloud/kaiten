// Package debezium provides types and helpers for consuming Debezium CDC events
// from the outbox_events table as delivered via the Dapr pub/sub pipeline.
//
// Debezium serialises the PostgreSQL row as the "after" field of a change event.
// UUIDs and timestamptz columns arrive as strings; JSONB columns arrive as
// double-encoded JSON strings (a JSON string whose value is itself a JSON document).
package debezium

import (
	"encoding/json"
	"fmt"
	"time"
)

// Event is the outbox_events row as it arrives in the Debezium "after" field.
type Event struct {
	ID             string `json:"id"`
	OrganizationID string `json:"organization_id"`
	EventName      string `json:"event_name"`
	EventType      string `json:"event_type"`
	// Data is the JSONB payload serialised by Debezium as a JSON-encoded string.
	// Use ParseData to unmarshal it into a typed value.
	Data string `json:"data"`
	// Headers is the JSONB headers column. Use UnmarshalHeaders to decode it.
	Headers    json.RawMessage `json:"headers"`
	OccurredAt time.Time       `json:"occurred_at"`
}

// ParseData unmarshals the Data field of the event into dst.
// Debezium serialises PostgreSQL JSONB as a JSON-encoded string, so this
// performs one extra level of JSON decoding on top of the raw string value.
func (e Event) ParseData(dst any) error {
	return json.Unmarshal([]byte(e.Data), dst)
}

// cdcEnvelope is the internal Debezium change event structure.
type cdcEnvelope struct {
	Payload struct {
		After Event `json:"after"`
	} `json:"payload"`
}

// cloudEvent is the minimal CloudEvents envelope the Dapr sidecar wraps around
// a pub/sub message when delivering it over HTTP.
type cloudEvent struct {
	Data json.RawMessage `json:"data"`
}

// HeartbeatType is the CloudEvents type of a delivery that carries no change.
//
// Debezium publishes one every heartbeat interval, and has to: it confirms a WAL
// position to Postgres only for a record that reached the sink, so a heartbeat
// dropped before RabbitMQ is a replication slot that never advances on an idle
// database. The body is not Debezium's own -- the cloudevents converter produces
// no value for a heartbeat, and the sink publishes its configured null value in
// its place. That value is set to a CloudEvent of this type in
// charts/kaiten-infra/templates/debezium-server.yaml and in
// docker/rabbitmq/rabbitmq-debezium-application.properties.
const HeartbeatType = "cloud.kaiten.cdc.heartbeat"

// IsHeartbeat reports whether body, a full Dapr pub/sub HTTP delivery, is a
// Debezium heartbeat rather than a change event.
func IsHeartbeat(body []byte) bool {
	var ce struct {
		Type string `json:"type"`
	}
	return json.Unmarshal(body, &ce) == nil && ce.Type == HeartbeatType
}

// Parse extracts the outbox Event from a full Dapr pub/sub HTTP delivery.
// The body is a CloudEvents JSON document; its data field is the Debezium CDC
// change event containing the outbox row in payload.after.
//
// Use this in HTTP handlers that receive events directly from the Dapr sidecar
// without the Dapr Go SDK (i.e. the sidecar calls POST /<route> on the app).
func Parse(body []byte) (Event, error) {
	var ce cloudEvent
	if err := json.Unmarshal(body, &ce); err != nil {
		return Event{}, fmt.Errorf("debezium: unmarshal CloudEvents envelope: %w", err)
	}
	return ParseEnvelope(ce.Data)
}

// ParseEnvelope extracts the outbox Event from a Debezium CDC change event
// payload (without the outer CloudEvents wrapper).
//
// Use this when the Dapr Go SDK has already extracted the data field for you
// (e.g. marshal e.Data to []byte from a *common.TopicEvent, then call this).
func ParseEnvelope(data []byte) (Event, error) {
	var env cdcEnvelope
	if err := json.Unmarshal(data, &env); err != nil {
		return Event{}, fmt.Errorf("debezium: unmarshal CDC envelope: %w", err)
	}
	return env.Payload.After, nil
}

// UnmarshalHeaders decodes the JSONB headers field from a Debezium CDC payload
// into dst. Debezium may serialise JSONB columns as a plain JSON object OR as a
// double-encoded JSON string — this function handles both forms.
func UnmarshalHeaders[T any](raw json.RawMessage, dst *T) error {
	if len(raw) == 0 {
		return nil
	}
	if err := json.Unmarshal(raw, dst); err == nil {
		return nil
	}
	var s string
	if err := json.Unmarshal(raw, &s); err != nil {
		return fmt.Errorf("debezium: unmarshal headers: %w", err)
	}
	return json.Unmarshal([]byte(s), dst)
}
