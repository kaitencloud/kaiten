package events

import "slices"

// Metadata is the identity of one outbox event: the name written to
// outbox_events.event_name and the CloudEvents-style type written to
// outbox_events.event_type. The Type is also the key under which the event's
// webhook contract is declared (see infrastructure/events/webhook), so the
// declaration and the emission are the same string by construction.
type Metadata struct {
	Name string `json:"name" doc:"Event name" example:"CUSTOMER_CREATED"`
	Type string `json:"type" doc:"Event type" example:"com.kaiten.customer.v1.created"`
}

// catalogue collects every Metadata declared through New. It is written only
// during package-level variable initialization -- one goroutine, before main
// -- and read only afterwards, so it needs no synchronization.
var catalogue []Metadata

// New declares an outbox event type and adds it to the process-wide
// catalogue. Modules must build their events.Metadata values with it rather
// than with a struct literal: the webhook-contract test enumerates the
// catalogue and fails for any event type that has no published contract, so
// a new event declared with a literal would slip past it.
func New(name, eventType string) Metadata {
	metadata := Metadata{Name: name, Type: eventType}
	catalogue = append(catalogue, metadata)
	return metadata
}

// Catalogue returns every event declared through New by the packages linked
// into the binary, in declaration order.
func Catalogue() []Metadata {
	return slices.Clone(catalogue)
}
