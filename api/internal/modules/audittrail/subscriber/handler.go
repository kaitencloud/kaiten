// Package subscriber is the audit trail's reader of the CDC stream: every outbound
// domain event this deployment emitted, written back as an audit row.
//
// It is a cdc.Consumer and nothing more. The transaction, the inbox mark, the
// organization it acts in and the decision the broker is told are all owned by
// internal/infrastructure/cdc and internal/kaiten above it -- which is what lets a
// second consumer of the same delivery fail without replaying anything here.
package subscriber

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/pgnotify"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/audittrail/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/pkg/debezium"
)

// ConsumerName is this consumer's identity in the inbox_events dedup key.
//
// The literal string is load-bearing and must not change: it is the value
// 20260821000000_add_inbox_consumer.sql backfilled every pre-existing row with, so
// renaming it would make the entire retained window look unprocessed to this
// consumer.
const ConsumerName = "audit-trail"

// Consumer writes every inbound CDC outbox event to the audit_trail table.
// Announcer is told about a stored audit trail entry, inside the transaction
// that stored it.
//
// It exists so notifications can wake the replicas holding an open stream
// without the audit trail knowing what a notification is -- it knows only that
// somebody may want to be told. The implementation is
// modules/notifications/announce; nil means nobody is listening, which is what
// every driver that is not the server passes.
//
// WHY IT IS CALLED FROM HERE rather than from a CDC consumer of its own: the
// dispatcher runs consumers in parallel, each in its own transaction, so a
// separate consumer would race this one and could announce an entry that no
// replica can read yet. Publishing inside this transaction makes that
// impossible -- Postgres delivers a NOTIFY at commit, or not at all.
type Announcer interface {
	Announce(ctx context.Context, dbtx pgnotify.DBTX, organizationID, auditTrailID uuid.UUID, eventName string) error
}

type Consumer struct {
	uof          *uow.UnitOfWork
	userProvider currentuser.Provider
	announcer    Announcer
}

// New creates the audit trail consumer.
//
// It takes the unit of work rather than the raw pool because it writes inside a
// transaction the dispatcher opened, and the user provider because the organization
// it writes to is the one the caller is acting in -- read the same way every other
// use case reads it, rather than off the event, so that what the audit row records
// and what the inbox mark was written against cannot disagree.
func New(uof *uow.UnitOfWork, userProvider currentuser.Provider, announcer Announcer) *Consumer {
	return &Consumer{uof: uof, userProvider: userProvider, announcer: announcer}
}

// Name implements cdc.Consumer.
func (c *Consumer) Name() string { return ConsumerName }

// Wants implements cdc.Consumer: the audit trail records the whole stream.
//
// The only consumer for which answering true unconditionally is right, and it is
// right for the reason the table exists -- an audit trail that filtered would be a
// record of the events someone thought worth keeping, which is not an audit trail.
func (c *Consumer) Wants(debezium.Event) bool { return true }

// Consume writes one CDC outbox event to audit_trail.
func (c *Consumer) Consume(ctx context.Context, event debezium.Event) error {
	user, err := c.userProvider.GetUser(ctx)
	if err != nil {
		return err
	}

	var instanceID *uuid.UUID
	if len(event.Headers) > 0 {
		var headers outbox.AuditHeaders
		if err := debezium.UnmarshalHeaders(event.Headers, &headers); err == nil {
			instanceID = headers.InstanceID
		}
	}

	auditTrailID, err := db.New(c.uof.DBTX(ctx)).CreateAuditTrail(ctx, db.CreateAuditTrailParams{
		OrganizationID: user.OrganizationID,
		InstanceID:     instanceID,
		EventName:      event.EventName,
		EventType:      event.EventType,
		OccurredAt:     pgtype.Timestamptz{Time: event.OccurredAt.UTC(), Valid: true},
		Payload:        []byte(event.Data),
	})
	if err != nil {
		return err
	}

	if c.announcer == nil {
		return nil
	}

	// Same transaction as the insert above, so the announcement is delivered at
	// commit and never points at a row a reader cannot see. A failure here fails
	// the consumption: the CDC delivery is redelivered, the inbox row was never
	// written, and the audit entry is inserted again -- which is the behaviour
	// every other failure in this consumer already has.
	return c.announcer.Announce(ctx, c.uof.DBTX(ctx), user.OrganizationID, auditTrailID, event.EventName)
}
