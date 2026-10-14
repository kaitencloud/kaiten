package webhook_test

import (
	"encoding/json"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/humatest"
	"github.com/google/uuid"
	"go.opentelemetry.io/otel/propagation"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
)

type somethingHappened struct {
	Slug string `json:"slug"`
}

// TestDeclareAddsOptionalHeadersToEveryEnvelope pins the envelope: name, type and
// data are required, and headers is declared beside them, optional, through one
// shared schema.
func TestDeclareAddsOptionalHeadersToEveryEnvelope(t *testing.T) {
	_, api := humatest.New(t)
	// The server initialises the webhooks map before any module declares into it.
	api.OpenAPI().Webhooks = map[string]*huma.PathItem{}

	first := events.New("SOMETHING_HAPPENED", "com.kaiten.something.v1.happened")
	second := events.New("SOMETHING_ELSE_HAPPENED", "com.kaiten.something.v1.else_happened")
	webhook.Declare(api,
		webhook.Declaration{Event: first, Data: (*somethingHappened)(nil), OperationID: "onSomethingHappened"},
		webhook.Declaration{Event: second, Data: (*somethingHappened)(nil), OperationID: "onSomethingElseHappened"},
	)

	for _, event := range []events.Metadata{first, second} {
		envelope := envelopeOf(t, api, event.Type)

		headers, ok := envelope.Properties["headers"]
		if !ok {
			t.Fatalf("%s: envelope has no headers property", event.Type)
		}
		if headers.Ref != "#/components/schemas/EventHeaders" {
			t.Fatalf("%s: headers = %q, want a reference to the shared EventHeaders schema", event.Type, headers.Ref)
		}
		if !slices.Equal(envelope.Required, []string{"name", "type", "data"}) {
			t.Fatalf("%s: required = %v, want name, type and data only", event.Type, envelope.Required)
		}
	}

	schema := api.OpenAPI().Components.Schemas.Map()["EventHeaders"]
	if schema == nil {
		t.Fatal("no EventHeaders component schema")
	}
	if schema.AdditionalProperties != true {
		t.Fatalf("EventHeaders additionalProperties = %v, want true", schema.AdditionalProperties)
	}
	if len(schema.Required) != 0 {
		t.Fatalf("EventHeaders required = %v, want every key optional", schema.Required)
	}
}

// TestEventHeadersDeclareEveryKeyTheOutboxWrites keeps the declaration complete: a
// key the outbox writes into an event's headers -- a field of the producers'
// outbox.AuditHeaders, or a field of the trace propagators otelcommon installs --
// must be declared on EventHeaders.
func TestEventHeadersDeclareEveryKeyTheOutboxWrites(t *testing.T) {
	declared := jsonKeys(t, webhook.EventHeaders{
		InstanceID: "x", Traceparent: "x", Tracestate: "x", Baggage: "x",
	})

	instanceID := uuid.New()
	written := jsonKeys(t, outbox.AuditHeaders{InstanceID: &instanceID})
	written = append(written, propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	).Fields()...)

	for _, key := range written {
		if !slices.Contains(declared, key) {
			t.Errorf("the outbox writes header %q, which EventHeaders does not declare", key)
		}
	}
}

func envelopeOf(t *testing.T, api huma.API, eventType string) *huma.Schema {
	t.Helper()

	item, ok := api.OpenAPI().Webhooks[eventType]
	if !ok {
		t.Fatalf("no webhook declared for %s", eventType)
	}
	return item.Post.RequestBody.Content["application/json"].Schema
}

// jsonKeys returns the keys value marshals to, every field set.
func jsonKeys(t *testing.T, value any) []string {
	t.Helper()

	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	var object map[string]any
	if err := json.Unmarshal(raw, &object); err != nil {
		t.Fatal(err)
	}
	keys := make([]string, 0, len(object))
	for key := range object {
		keys = append(keys, strings.ToLower(key))
	}
	slices.Sort(keys)
	if reflect.ValueOf(value).Kind() == reflect.Struct && len(keys) == 0 {
		t.Fatalf("%T marshals to no key", value)
	}
	return keys
}
