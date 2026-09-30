// Package announce wakes every replica when a notification appears.
//
// Postgres LISTEN/NOTIFY, not a broker and not a shared cache: the process
// already holds a pgnotify listener per replica for token-cache invalidation, so
// the fan-out this needs is one channel more on machinery that is already there
// -- and the deployment stays as it is, which was a constraint on this feature.
//
// WHERE THIS IS CALLED FROM IS LOAD-BEARING. It runs inside the audit trail
// consumer's own transaction, so the NOTIFY is delivered by Postgres at commit
// and never before the row it points at exists. A separate CDC consumer could not
// promise that: the dispatcher runs consumers in parallel, each in its own
// transaction (internal/infrastructure/cdc), so it would sometimes announce a
// notification that no replica can yet read.
package announce

import (
	"context"
	"encoding/json"
	"log/slog"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/pgnotify"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/catalogue"
)

// Channel is the LISTEN/NOTIFY channel notifications travel on.
const Channel = "kaiten_notifications"

// PreferenceChannel announces that one user's preferences changed, so a replica
// holding their stream drops the subscription it resolved at connect time.
const PreferenceChannel = "kaiten_notification_preferences"

// Event is the payload. Ids only, deliberately: a NOTIFY payload is capped at
// 8000 bytes, every replica can read the row itself, and the rendered text
// depends on the reader (§8 of the design doc), so sending it here would render
// once for everybody.
type Event struct {
	OrganizationID uuid.UUID `json:"o"`
	NotificationID uuid.UUID `json:"i"`
	EventName      string    `json:"e"`
}

// Announcer publishes on the notification channel. The audit trail consumer
// depends on this interface rather than on the notifications module, so the
// dependency runs one way: notifications know about the audit trail, and the
// audit trail knows only that somebody may want to be told.
type Announcer interface {
	Announce(ctx context.Context, dbtx pgnotify.DBTX, organizationID, auditTrailID uuid.UUID, eventName string) error
}

// Publisher is the real Announcer.
type Publisher struct{}

func NewPublisher() *Publisher { return &Publisher{} }

// Announce is a no-op for an event nobody can subscribe to, which is most of
// them: the audit trail records every event in the system, including the
// per-evaluation ones, and waking every replica for those would be pure cost.
func (p *Publisher) Announce(
	ctx context.Context, dbtx pgnotify.DBTX, organizationID, auditTrailID uuid.UUID, eventName string,
) error {
	if !catalogue.Notifiable(eventName) {
		return nil
	}

	payload, err := json.Marshal(Event{
		OrganizationID: organizationID,
		NotificationID: auditTrailID,
		EventName:      eventName,
	})
	if err != nil {
		return err
	}

	return pgnotify.Publish(ctx, dbtx, Channel, string(payload))
}

// AnnouncePreferences tells every replica that this user's subscription changed.
// Failure is logged, not returned: the preference itself is already committed,
// and the cost of a missed announcement is one stale stream until it reconnects.
func AnnouncePreferences(ctx context.Context, dbtx pgnotify.DBTX, userID uuid.UUID) {
	if err := pgnotify.Publish(ctx, dbtx, PreferenceChannel, userID.String()); err != nil {
		slog.WarnContext(ctx, "notifications: failed to announce preference change",
			"user_id", userID, "error", err)
	}
}

// ParseEvent reads what Announce wrote.
func ParseEvent(payload string) (Event, bool) {
	var event Event
	if err := json.Unmarshal([]byte(payload), &event); err != nil {
		return Event{}, false
	}

	if event.OrganizationID == uuid.Nil || event.NotificationID == uuid.Nil {
		return Event{}, false
	}

	return event, true
}
