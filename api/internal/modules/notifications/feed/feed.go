// Package feed is the read model: audit trail rows, narrowed to what one user
// subscribes to, rendered, with their read state resolved.
//
// It exists as its own package because three callers need exactly this and must
// not disagree -- the list endpoint, the mark-read endpoints (which answer with a
// fresh unread count) and the SSE stream (which pushes a rendered row and a fresh
// count down an open connection).
package feed

import (
	"context"
	"encoding/base64"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/schema"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const (
	// DefaultLimit and MaxLimit bound one page of the feed.
	DefaultLimit int32 = 20
	MaxLimit     int32 = 50

	// MaxUnreadCount is where counting stops. The badge renders "99+" beyond 99,
	// so the exact number past the cap changes nothing a user can see, and an
	// organization with a long backlog should not pay to compute it on every
	// request. The cap is one above what the UI distinguishes, so "99+" is only
	// shown when it is true.
	MaxUnreadCount = 100

	// Window is how far back the feed looks. The audit trail is permanent and has
	// no retention policy of its own; a bell that offers to paginate through a
	// year of it is neither useful nor cheap.
	Window = 90 * 24 * time.Hour
)

// Reader is the subset of the generated queries this package uses. Narrow, so a
// test can drive the rendering and paging rules without a database.
type Reader interface {
	ListNotifications(ctx context.Context, arg db.ListNotificationsParams) ([]db.ListNotificationsRow, error)
	CountUnreadNotifications(ctx context.Context, arg db.CountUnreadNotificationsParams) (int64, error)
	GetNotification(ctx context.Context, arg db.GetNotificationParams) (db.GetNotificationRow, error)
	ListNotificationPreferences(ctx context.Context, userID uuid.UUID) ([]db.ListNotificationPreferencesRow, error)

	ResolveInstances(ctx context.Context, arg db.ResolveInstancesParams) ([]db.ResolveInstancesRow, error)
	ResolveDeploymentZones(ctx context.Context, arg db.ResolveDeploymentZonesParams) ([]db.ResolveDeploymentZonesRow, error)
	ResolveReleases(ctx context.Context, arg db.ResolveReleasesParams) ([]db.ResolveReleasesRow, error)
	ResolveLicenses(ctx context.Context, arg db.ResolveLicensesParams) ([]db.ResolveLicensesRow, error)
}

// Subscription is the set of events one user receives on one channel: the
// catalogue's defaults, overlaid with that user's stored overrides.
type Subscription []string

// Subscribed reports whether an event reaches this user at all. The stream asks
// before it renders anything.
func (s Subscription) Subscribed(eventName string) bool {
	for _, name := range s {
		if name == eventName {
			return true
		}
	}

	return false
}

// About narrows a subscription to the events about the given objects -- the
// list's objectType filter. It narrows the event names the query already
// filters on rather than adding a predicate to it, so a filtered page costs the
// same as an unfiltered one. No objects means no narrowing.
func (s Subscription) About(objects []catalogue.Object) Subscription {
	if len(objects) == 0 {
		return s
	}

	narrowed := Subscription{}
	for _, name := range s {
		entry, known := catalogue.Lookup(name)
		if known && slices.Contains(objects, entry.Object) {
			narrowed = append(narrowed, name)
		}
	}

	return narrowed
}

// SubscriptionFor resolves one user's subscription on a channel.
//
// Resolved on every read rather than stored: a stored subscription would freeze
// today's catalogue defaults into every user who ever opened the settings page,
// so changing a default -- or shipping a new event -- would reach nobody.
func SubscriptionFor(ctx context.Context, reader Reader, userID uuid.UUID, channel catalogue.Channel) (Subscription, error) {
	overrides, err := reader.ListNotificationPreferences(ctx, userID)
	if err != nil {
		return nil, err
	}

	enabled := map[string]bool{}
	for _, entry := range catalogue.All() {
		enabled[entry.Event.Name] = entry.DefaultFor(channel)
	}

	for _, override := range overrides {
		if override.Channel != string(channel) {
			continue
		}
		// An override for an event that is no longer in the catalogue is ignored
		// rather than an error: events are removed by deploying code, and the
		// rows outlive the deploy.
		if _, known := catalogue.Lookup(override.EventName); !known {
			continue
		}
		enabled[override.EventName] = override.Enabled
	}

	subscription := make(Subscription, 0, len(enabled))
	for _, name := range catalogue.EventNames() {
		if enabled[name] {
			subscription = append(subscription, name)
		}
	}

	return subscription, nil
}

// Query is one request for a page.
type Query struct {
	UserID         uuid.UUID
	OrganizationID uuid.UUID
	Subscription   Subscription
	UnreadOnly     bool
	Limit          int32
	Cursor         string
}

// List returns one page plus the unread count that goes with it.
func List(ctx context.Context, reader Reader, query Query) (schema.List, error) {
	limit := query.Limit
	if limit <= 0 {
		limit = DefaultLimit
	}
	if limit > MaxLimit {
		limit = MaxLimit
	}

	cursorOccurredAt, cursorID, err := DecodeCursor(query.Cursor)
	if err != nil {
		return schema.List{}, err
	}

	// A user subscribed to nothing has an empty feed, and asking Postgres for
	// `event_name = ANY('{}')` to learn that is a round trip for a known answer.
	if len(query.Subscription) == 0 {
		return schema.List{Data: []schema.Notification{}, NextCursor: nil, UnreadCount: 0}, nil
	}

	windowStart := pgtype.Timestamptz{Time: time.Now().Add(-Window).UTC(), Valid: true}

	rows, err := reader.ListNotifications(ctx, db.ListNotificationsParams{
		UserID:           query.UserID,
		OrganizationID:   query.OrganizationID,
		EventNames:       query.Subscription,
		WindowStart:      windowStart,
		CursorOccurredAt: cursorOccurredAt,
		CursorID:         cursorID,
		UnreadOnly:       query.UnreadOnly,
		LimitPlusOne:     limit + 1,
	})
	if err != nil {
		return schema.List{}, err
	}

	var nextCursor *string
	if len(rows) > int(limit) {
		rows = rows[:limit]
		last := rows[len(rows)-1]
		cursor := EncodeCursor(last.OccurredAt.Time, last.ID)
		nextCursor = &cursor
	}

	names := make([]named, len(rows))
	for i, row := range rows {
		names[i] = namedBy(row)
	}

	objects, err := resolve(ctx, reader, query.OrganizationID, names)
	if err != nil {
		return schema.List{}, err
	}

	data := make([]schema.Notification, 0, len(rows))
	for i, row := range rows {
		data = append(data, render(row, objects.refs(names[i])))
	}

	unread, err := Unread(ctx, reader, query.UserID, query.OrganizationID, query.Subscription)
	if err != nil {
		return schema.List{}, err
	}

	return schema.List{Data: data, NextCursor: nextCursor, UnreadCount: unread}, nil
}

// Unread is the badge.
func Unread(
	ctx context.Context, reader Reader, userID, organizationID uuid.UUID, subscription Subscription,
) (int, error) {
	if len(subscription) == 0 {
		return 0, nil
	}

	count, err := reader.CountUnreadNotifications(ctx, db.CountUnreadNotificationsParams{
		UserID:         userID,
		OrganizationID: organizationID,
		EventNames:     subscription,
		WindowStart:    pgtype.Timestamptz{Time: time.Now().Add(-Window).UTC(), Valid: true},
		MaxCount:       MaxUnreadCount,
	})
	if err != nil {
		return 0, err
	}

	return int(count), nil
}

// One renders a single notification, for the frame pushed down an open stream.
// It returns ok=false when the row is not visible to this reader -- another
// organization's, or outside the window -- rather than an error, because the
// caller is a fan-out loop and "not for you" is an ordinary answer. The user is
// not read: a pushed frame is always unread, and visibility is the
// organization's.
func One(
	ctx context.Context, reader Reader, _, organizationID, notificationID uuid.UUID,
) (schema.Notification, bool, error) {
	row, err := reader.GetNotification(ctx, db.GetNotificationParams{
		ID: notificationID, OrganizationID: organizationID,
	})
	if err != nil {
		return schema.Notification{}, false, err
	}

	if row.ID == uuid.Nil {
		return schema.Notification{}, false, nil
	}

	listRow := db.ListNotificationsRow{
		ID:         row.ID,
		EventName:  row.EventName,
		EventType:  row.EventType,
		OccurredAt: row.OccurredAt,
		Payload:    row.Payload,
		InstanceID: row.InstanceID,
	}

	names := namedBy(listRow)
	objects, err := resolve(ctx, reader, organizationID, []named{names})
	if err != nil {
		return schema.Notification{}, false, err
	}

	return render(listRow, objects.refs(names)), true, nil
}

func render(row db.ListNotificationsRow, refs catalogue.Refs) schema.Notification {
	notification := schema.Notification{
		ID:        row.ID,
		EventName: row.EventName,
		EventType: row.EventType,
		// UTC whatever zone the process runs in: pgx hands a timestamptz back in
		// the local one, and the app's generated schema validates date-time
		// strictly, refusing an offset -- which would drop a stream frame.
		CreatedAt: row.OccurredAt.Time.UTC(),
	}

	// An unregistered event should not be in the feed at all -- the query filters
	// on the catalogue -- but rendering must still answer something rather than
	// panic if one slips through a deploy where the catalogue shrank.
	entry, known := catalogue.Lookup(row.EventName)
	if !known {
		notification.Title = row.EventName

		return notification
	}

	notification.ObjectType = string(entry.Object)
	rendered := entry.Render(row.Payload, refs)
	notification.Title = rendered.Title
	if rendered.Body != "" {
		body := rendered.Body
		notification.Body = &body
	}
	if rendered.ActionURL != "" {
		actionURL := rendered.ActionURL
		notification.ActionURL = &actionURL
	}

	// The feed carries read state as a timestamp the client renders as
	// "unread or not"; the exact instant is the watermark's or the row's, and
	// only the query knows which, so this reports the boolean it was given
	// rather than inventing a time.
	if row.Read != nil && *row.Read {
		readAt := row.OccurredAt.Time.UTC()
		notification.ReadAt = &readAt
	}

	return notification
}

// EncodeCursor makes an opaque cursor out of the keyset the query orders by.
// Opaque because the client passes it back verbatim and must not build one.
func EncodeCursor(occurredAt time.Time, id uuid.UUID) string {
	return base64.RawURLEncoding.EncodeToString(
		[]byte(fmt.Sprintf("%d|%s", occurredAt.UTC().UnixNano(), id)))
}

// DecodeCursor is EncodeCursor's inverse. An unparseable cursor is a client
// error, not a silent first page: paging from the top again would repeat rows the
// client already has and look like duplicates.
func DecodeCursor(cursor string) (pgtype.Timestamptz, *uuid.UUID, error) {
	if cursor == "" {
		return pgtype.Timestamptz{}, nil, nil
	}

	raw, err := base64.RawURLEncoding.DecodeString(cursor)
	if err != nil {
		return pgtype.Timestamptz{}, nil, errInvalidCursor()
	}

	before, after, found := strings.Cut(string(raw), "|")
	if !found {
		return pgtype.Timestamptz{}, nil, errInvalidCursor()
	}

	nanos, err := strconv.ParseInt(before, 10, 64)
	if err != nil {
		return pgtype.Timestamptz{}, nil, errInvalidCursor()
	}

	id, err := uuid.Parse(after)
	if err != nil {
		return pgtype.Timestamptz{}, nil, errInvalidCursor()
	}

	return pgtype.Timestamptz{Time: time.Unix(0, nanos).UTC(), Valid: true}, &id, nil
}

func errInvalidCursor() error {
	return kaitenerrors.Validation("Notifications.InvalidCursor",
		"cursor is not one this API issued")
}
