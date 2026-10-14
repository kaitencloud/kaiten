// Package webhook describes outbox events in the OpenAPI contract.
//
// Everything here is documentation. This package writes the `webhooks:`
// section of the generated OpenAPI document and has no runtime behaviour of
// any kind: it sends nothing, subscribes to nothing, and registers no
// endpoint, callback or delivery target. An event reaches a subscriber
// because a handler wrote an outbox row and the delivery pipeline picked it
// up; nothing in this package takes part in that.
//
// Every contract is declared through Declare, which takes the same
// events.Metadata the handler passes to outbox.NewOutboxMessage and the same
// Go type the handler passes as the payload. Both halves of the contract --
// the event-type key and the payload schema -- therefore come from the
// emitting code, and cannot drift from it the way hand-written declarations
// did. The envelope also declares the headers every event may carry
// (EventHeaders), which come from the outbox itself rather than from the
// handler.
package webhook

import (
	"reflect"

	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events"
)

// EventHeaders is the metadata an event carries beside its payload: the
// headers column of its outbox row, as outbox.marshalHeaders writes it, which
// a consumer of the event stream reads with the row. Every key is optional:
//
//   - instance_id comes from outbox.AuditHeaders, which the events of one
//     instance set. It is how a consumer learns which instance an event
//     concerns when the payload does not name it, as the usage payloads do
//     not.
//   - traceparent, tracestate and baggage are the W3C trace context of the
//     request that produced the event, injected by the TraceContext and
//     Baggage propagators otelcommon installs; tracestate and baggage only
//     when that request carried them.
//
// The object accepts further keys: a producer may add metadata later, and a
// consumer ignores the keys it does not read.
type EventHeaders struct {
	InstanceID  string `json:"instance_id,omitempty" format:"uuid" doc:"The instance the event concerns, set on the events of one instance. The usage events' payloads do not name it."`
	Traceparent string `json:"traceparent,omitempty" doc:"W3C trace context of the request that produced the event"`
	Tracestate  string `json:"tracestate,omitempty" doc:"W3C trace state of that request, when it carried one"`
	Baggage     string `json:"baggage,omitempty" doc:"W3C baggage of that request, when it carried any"`

	_ struct{} `additionalProperties:"true"`
}

// Declaration describes one webhook contract to write into the OpenAPI
// document. It is a documentation value: it configures no delivery and
// causes nothing to be sent.
type Declaration struct {
	// Event is the outbox event this contract describes. Its Type is the
	// oapi.Webhooks key; its Name and Type are pinned as single-value enums
	// on the envelope's name/type properties.
	Event events.Metadata

	// Data is a zero value -- typically a typed nil pointer -- of the exact
	// Go type the handler passes to outbox.NewOutboxMessage as the payload.
	// The published data schema is generated from it.
	Data any

	// OperationID is the webhook operation identifier, by convention
	// "on" + the event in UpperCamelCase (e.g. "onCustomerCreated").
	OperationID string

	// Summary and Description document the event for subscribers.
	Summary     string
	Description string

	// Tags always start with "webhooks", followed by the owning module.
	Tags []string
}

// Declare writes one entry per declaration into oapi.Webhooks -- the
// `webhooks:` section of the generated OpenAPI document -- keyed by event
// type.
//
// That is the whole effect. This is documentation and nothing else: it
// sends nothing, subscribes to nothing, and registers no endpoint, callback
// or delivery target. Nothing it writes is consulted when an event is
// actually emitted -- the only thing a call here changes is what SDK and
// subscriber authors read.
func Declare(api huma.API, declarations ...Declaration) {
	oapi := api.OpenAPI()
	registry := oapi.Components.Schemas

	// One schema for every envelope: the headers do not depend on the event.
	headersSchema := registry.Schema(reflect.TypeFor[EventHeaders](), true, "EventHeaders")

	for _, d := range declarations {
		dataSchema := registry.Schema(reflect.TypeOf(d.Data), true, d.OperationID+"Data")

		envelope := &huma.Schema{
			Type: huma.TypeObject,
			Properties: map[string]*huma.Schema{
				"name":    enumProperty("Event name", d.Event.Name),
				"type":    enumProperty("Event type", d.Event.Type),
				"data":    dataSchema,
				"headers": headersSchema,
			},
			// headers is optional: an event published outside a request
			// and without producer headers has none.
			Required:             []string{"name", "type", "data"},
			AdditionalProperties: false,
		}
		envelope.PrecomputeMessages()

		oapi.Webhooks[d.Event.Type] = &huma.PathItem{
			Post: &huma.Operation{
				OperationID: d.OperationID,
				Summary:     d.Summary,
				Description: d.Description,
				Tags:        d.Tags,
				RequestBody: &huma.RequestBody{
					Required: true,
					Content: map[string]*huma.MediaType{
						"application/json": {Schema: envelope},
					},
				},
				Responses: map[string]*huma.Response{
					"200": {Description: "Webhook processed successfully"},
				},
			},
		}
	}
}

// enumProperty builds a string property whose only permitted value is the
// constant the handler emits.
func enumProperty(description, value string) *huma.Schema {
	s := &huma.Schema{
		Type:        huma.TypeString,
		Description: description,
		Enum:        []any{value},
		Examples:    []any{value},
	}
	s.PrecomputeMessages()
	return s
}
