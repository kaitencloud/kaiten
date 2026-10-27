// Package catalogue is the single list of events that can become a notification,
// and everything that differs between them.
//
// One registry rather than a list per concern, because the alternatives drift: the
// feed's event filter, the preference matrix the settings page renders, the CDC
// announcer's Wants, and the rendered title of a row are four readings of one
// decision -- "this event is worth telling a person about, in these words".
//
// It is deliberately a subset of internal/infrastructure/events. That catalogue
// holds every event the system emits, including ENTITLEMENT_VALUE_GET, which fires
// on every flag evaluation; an unregistered event reaches no feed and no
// preference row, which is what keeps the bell usable.
package catalogue

import (
	"fmt"
	"slices"
	"sort"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events"
)

// Channel is a way of reaching a person. Only ChannelInApp is served today; the
// type exists because the preference model stores a channel per row, so adding
// email or an IM channel is a catalogue entry and a sender rather than a
// migration.
type Channel string

const ChannelInApp Channel = "in_app"

// Channels is what the preference matrix advertises, in display order.
var Channels = []Channel{ChannelInApp}

// Object is what a notification is about: the kind of page it opens, which is
// also what the feed filters on. It is not the settings page's group -- an
// instance being deployed is in the deployments group, and it is still about
// an instance.
type Object string

const (
	ObjectInstance       Object = "instance"
	ObjectCustomer       Object = "customer"
	ObjectRelease        Object = "release"
	ObjectDeploymentZone Object = "deployment_zone"
	ObjectComponent      Object = "component"
	ObjectLicense        Object = "license"
	ObjectToken          Object = "token"
	// ObjectBilling is the organization's billing as a whole, for what is
	// about no one instance or customer: a voucher used up, a payment
	// provider that cannot be read.
	ObjectBilling Object = "billing"
)

// Objects is every object a notification can be about, in the order a filter
// offers them.
var Objects = []Object{
	ObjectInstance, ObjectCustomer, ObjectRelease, ObjectDeploymentZone,
	ObjectComponent, ObjectLicense, ObjectToken, ObjectBilling,
}

// Rendered is what a person reads. Produced at read time from the audit trail
// payload, never stored: rows are rendered on their way out, so a title can be
// translated, reworded or corrected without a backfill.
type Rendered struct {
	Title     string
	Body      string
	ActionURL string
}

// Ref is one object a notification is about, as the database knows it at read
// time: the slug a link needs and the name a sentence needs. For a release, Name
// is its version.
type Ref struct {
	Slug string
	Name string
}

// Refs is what the feed resolved about the objects a row names, from the audit
// row's own instance_id and from the payload keys that carry only an id. Every
// field is nil when there was nothing to resolve or the object is gone -- a
// deleted object has no page to link to, which is exactly what a renderer needs
// to know.
//
// Resolved rather than read from the payload because a payload is whatever its
// producer wrote: RELEASE_DEPLOYED carries nothing but ids, the usage events do not
// name their instance at all, and a slug can change after the event.
type Refs struct {
	Instance       *Ref
	DeploymentZone *Ref
	Release        *Ref
	License        *Ref
}

// Renderer turns one event's payload into what a person reads. It is given the
// raw audit_trail payload, which may have been written by an older version of the
// producer, so it must degrade rather than fail -- Entry.Render enforces that by
// falling back to the generic title when a renderer returns an empty one.
type Renderer func(payload []byte, refs Refs) Rendered

// Entry is one notifiable event.
type Entry struct {
	Event    events.Metadata
	Group    string
	Object   Object
	Label    string
	Defaults map[Channel]bool
	renderer Renderer
}

// Render is Entry's renderer with the guarantee the renderer itself does not
// have to provide: something readable, always.
func (e Entry) Render(payload []byte, refs Refs) Rendered {
	if e.renderer == nil {
		return Rendered{Title: e.Label}
	}

	rendered := e.renderer(payload, refs)
	if rendered.Title == "" {
		rendered.Title = e.Label
	}

	return rendered
}

// DefaultFor reports whether this event is on for a channel when the user has
// expressed no preference.
func (e Entry) DefaultFor(channel Channel) bool {
	return e.Defaults[channel]
}

var (
	entries  []Entry
	byName   = map[string]Entry{}
	eventSet []string
)

// Register adds an event to the catalogue. It panics on a duplicate or on an
// event that is not in the global event catalogue, because both are wiring
// mistakes with silent consequences -- a duplicate makes the last registration
// win invisibly, and an unknown event name is a notification nothing will ever
// emit. Registration happens at init, so the process fails at start rather than
// on the first request.
func Register(entry Entry) {
	if _, exists := byName[entry.Event.Name]; exists {
		panic(fmt.Sprintf("notifications: event %q is registered twice", entry.Event.Name))
	}

	if !slices.ContainsFunc(events.Catalogue(), func(m events.Metadata) bool {
		return m.Name == entry.Event.Name
	}) {
		panic(fmt.Sprintf("notifications: event %q is not in the event catalogue", entry.Event.Name))
	}

	// An event about nothing the filter offers could never be filtered to.
	if !slices.Contains(Objects, entry.Object) {
		panic(fmt.Sprintf("notifications: event %q is about %q, which is not an Object", entry.Event.Name, entry.Object))
	}

	entries = append(entries, entry)
	byName[entry.Event.Name] = entry
	eventSet = append(eventSet, entry.Event.Name)
	sort.Strings(eventSet)
}

// All is every notifiable event, in registration order, which is the order the
// settings page renders within a group.
func All() []Entry { return slices.Clone(entries) }

// Lookup finds one entry by event name.
func Lookup(eventName string) (Entry, bool) {
	entry, ok := byName[eventName]
	return entry, ok
}

// Notifiable reports whether an event can become a notification at all. It is
// what the CDC announcer asks before it wakes any replica.
func Notifiable(eventName string) bool {
	_, ok := byName[eventName]
	return ok
}

// EventNames is every notifiable event name, sorted. It is passed to the feed
// query as the outer bound of what a user could possibly see, before their own
// preferences narrow it further.
func EventNames() []string { return slices.Clone(eventSet) }
