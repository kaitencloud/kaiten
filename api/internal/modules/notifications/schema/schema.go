// Package schema is the notifications wire contract.
//
// camelCase, like every other operation this API publishes. The frontend was
// written first, against a hand-kept notifications-api.yaml that used snake_case,
// and this module deliberately does not follow it: one API with two naming
// conventions is a trap for every future reader, and the contract test in
// internal/infrastructure/http/server enforces that. The frontend's zod schemas
// were moved to match -- nothing was shipped against the old shape, since this
// module is what gives those paths a server at all.
package schema

import (
	"time"

	"github.com/google/uuid"
)

// Notification is one audit trail row, as one person sees it. There is no
// notification table: id is the audit_trail id, and title/body/action_url are
// rendered on the way out by the catalogue.
type Notification struct {
	ID        uuid.UUID `json:"id" doc:"Identifier of the underlying audit trail entry"`
	EventName string    `json:"eventName" doc:"Event this notification reports" example:"INSTANCE_DEPLOYED"`
	EventType string    `json:"eventType" doc:"CloudEvents type of the same event -- the key it is published under in this document's webhooks section, so a client can line a notification up with the payload schema and the description already published there" example:"com.kaiten.instance.v1.deployed"`
	// ObjectType is the catalogue's Object for the event: what the list's
	// objectType filter matches.
	ObjectType string     `json:"objectType" doc:"What the notification is about -- the kind of page actionUrl opens, and what the list's objectType filter matches" example:"instance"`
	Title      string     `json:"title" doc:"Rendered headline"`
	Body       *string    `json:"body,omitempty" doc:"Rendered detail line, when the event has one"`
	ActionURL  *string    `json:"actionUrl,omitempty" doc:"Where clicking the notification goes"`
	ReadAt     *time.Time `json:"readAt,omitempty" doc:"When this user read it; absent means unread"`
	CreatedAt  time.Time  `json:"createdAt" doc:"When the event occurred"`
}

// List is one page of the feed. unread_count travels with every page so the badge
// and the list can never disagree.
//
// Data is nullable:"false" like pagination.Page's Items: the feed always builds a
// non-nil slice, so the contract promises an array, possibly empty, rather than a
// null no client would ever see.
type List struct {
	Data        []Notification `json:"data" nullable:"false" doc:"The page, newest first"`
	NextCursor  *string        `json:"nextCursor" doc:"Opaque cursor for the next page; null on the last page"`
	UnreadCount int            `json:"unreadCount" doc:"Unread notifications, capped (see MaxUnreadCount)"`
}

// MarkReadResult answers how much changed, so a client can reconcile without
// refetching.
type MarkReadResult struct {
	Updated     int `json:"updated" doc:"Notifications newly marked read"`
	UnreadCount int `json:"unreadCount" doc:"Unread notifications after the change"`
}

// PreferenceEvent is one row of the settings matrix: an event, and whether each
// channel is on for this user -- their override if they have one, the catalogue
// default otherwise.
type PreferenceEvent struct {
	EventName string          `json:"eventName" example:"INSTANCE_DEPLOYED"`
	EventType string          `json:"eventType" doc:"CloudEvents type of the same event; see Notification.eventType" example:"com.kaiten.instance.v1.deployed"`
	Label     string          `json:"label" doc:"Human-readable event name"`
	Group     string          `json:"group" doc:"Catalogue group the client renders this under" example:"deployments"`
	Channels  map[string]bool `json:"channels" doc:"Effective value per channel"`
}

// PreferenceMatrix is the whole settings page. Both slices are built non-nil
// (getpreferences.Matrix), hence nullable:"false", as on List.Data.
type PreferenceMatrix struct {
	Channels []string          `json:"channels" nullable:"false" doc:"Channels this deployment serves, in display order"`
	Events   []PreferenceEvent `json:"events" nullable:"false" doc:"Every notifiable event"`
}

// PreferenceUpdate is one event's requested channel values.
type PreferenceUpdate struct {
	EventName string          `json:"eventName" required:"true"`
	Channels  map[string]bool `json:"channels" required:"true"`
}
