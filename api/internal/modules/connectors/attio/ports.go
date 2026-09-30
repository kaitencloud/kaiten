package attio

import (
	"context"
	"errors"
)

// The ports this connector needs from the rest of the tree.

// ErrRecordNotFound means the Kaiten record the event named is not there any more.
//
// Terminal for this connector: a customer deleted between the event being written and
// the event being consumed has nothing left to sync, and no redelivery brings it back.
var ErrRecordNotFound = errors.New("attio: the kaiten record no longer exists")

// ErrLinkNotFound means the Kaiten record exists but carries no Attio link yet.
//
// The ordinary state of everything the connector has not synced, so callers branch on
// it rather than propagate it -- it is how a create path tells "already done" from
// "still to do".
var ErrLinkNotFound = errors.New("attio: the kaiten record has no attio link")

// CustomerReader reads the customer facts a company record is built from.
type CustomerReader interface {
	Customer(ctx context.Context, slug string) (Customer, error)
}

// InstanceReader reads the two facts an instance's mapped fields refer to but the
// event payload does not carry.
//
// The instance itself is not here: everything a workspace record is built from is in
// the payload, and re-reading the row would trade a consistent snapshot of the moment
// the event was written for whatever the row says now.
type InstanceReader interface {
	License(ctx context.Context, slug string) (License, error)

	// DeploymentZoneName resolves a zone by SLUG, not by id, because the payload
	// carries both and every read path in the tree is slug-keyed -- resolving by id
	// would mean either a second module port or paging the zone list per event.
	DeploymentZoneName(ctx context.Context, slug string) (string, error)
}

// LinkStore reads and writes the record's link to its Attio counterpart.
//
// Set is an upsert: the connector does not know, and should not have to find out,
// whether a link row already exists -- the create path reaches it after establishing
// there is none, and the update path after establishing there is.
//
// There is no separate "record the sync error" method, because writing the link and
// writing why the last sync failed are the same write: the link IS where the console
// reads the error from. The service this replaced had two operations for it, keyed
// differently (slug for one, Attio record id for the other) and reaching two
// endpoints, only because it was doing them over HTTP from another process and the
// error path could not always name a slug. In-process every caller has the slug in
// the payload it is syncing, so the second key buys nothing and the second method
// buys a way for the two to disagree.
type LinkStore interface {
	CustomerLink(ctx context.Context, slug string) (Link, error)
	SetCustomerLink(ctx context.Context, slug string, link Link) error
	InstanceLink(ctx context.Context, slug string) (Link, error)
	SetInstanceLink(ctx context.Context, slug string, link Link) error
}

// KaitenStore is everything this connector needs from Kaiten.
type KaitenStore interface {
	CustomerReader
	InstanceReader
	LinkStore
}

// Customer is the subset of a Kaiten customer a company record is built from.
type Customer struct {
	Name   string
	Domain string
}

// License is the subset of a Kaiten licence a workspace record's fields refer to.
type License struct {
	Name string
	Type string
}

// Link is a Kaiten record's link to its Attio counterpart.
//
// LastError is empty on a successful sync, which is how a Set clears a previously
// recorded failure: the console shows the error next to the linked record until a
// sync succeeds, and an empty string is that sync saying so.
type Link struct {
	ExternalID string
	WebURL     string
	LastError  string
}
