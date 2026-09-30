// Package familyevents records what happens to a license family as a whole:
// its first version opens it, it comes to serve another version,
// and its last version takes it away. A family has no write operation of its
// own, so these events are written by the version writes that change it, in
// their transaction.
//
// Every other object an organization owns announces its own creation, change
// and deletion, and the audit trail and the webhooks are built on those
// announcements. Without these, a product appearing or disappearing, or
// starting to serve another version, would only show as version events a
// reader has to reinterpret -- by re-applying a resolution rule the API is
// meant to be the only owner of.
//
// What a family serves is its resolution: its default version, otherwise its
// highest-numbered PUBLISHED version, as GetCurrentLicenseVersionsByFamilyIDs
// answers it. LICENSE_FAMILY_UPDATED is recorded when that answer changes, and
// only then: a version published, archived or unarchived, a default taken or
// given up, the served version deleted, or a newer version published. A write
// that leaves the answer where it was -- a draft added, a rename, a default
// restated -- records none.
//
// Both reads of that comparison happen under the family's row lock, which
// every version write takes before anything else. Two writes to one family
// therefore cannot both find the old version and both announce the move, and a
// move cannot fall between them unannounced.
package familyevents

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	licenseevents "github.com/kaitencloud/kaiten/api/internal/modules/licenses/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/familyview"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
)

// Before is what a family served when a write found it, read under the
// family's row lock before the write changes anything.
type Before struct {
	FamilyID uuid.UUID
	served   *uuid.UUID
}

// Read returns what the family serves now. The caller holds the family's row
// lock, and keeps it until its transaction commits.
func Read(ctx context.Context, queries *db.Queries, organizationID, familyID uuid.UUID) (Before, error) {
	served, err := servedVersion(ctx, queries, organizationID, familyID)
	if err != nil {
		return Before{}, err
	}
	return Before{FamilyID: familyID, served: served}, nil
}

// View reads the family as the family endpoints serve it, without its history.
// A delete reads it before its last version goes: afterwards there is no
// family left to read.
func View(ctx context.Context, queries *db.Queries, organizationID, familyID uuid.UUID) (*schema.LicenseFamilyView, error) {
	view, found, err := familyview.NewReader(queries).GetByID(ctx, organizationID, familyID, familyview.Options{})
	if err != nil {
		return nil, err
	}
	if !found {
		// Unreachable while the caller holds the family's row lock: nothing can
		// delete the family under it.
		return nil, fmt.Errorf("license family %s not found in organization %s", familyID, organizationID)
	}
	return view, nil
}

// Recorder writes the family events to the outbox of the caller's
// transaction, reading the family through that same transaction.
type Recorder struct {
	uof    *uow.UnitOfWork
	outbox *outbox.ScopedRepository
}

func NewRecorder(uof *uow.UnitOfWork, outbox *outbox.ScopedRepository) *Recorder {
	return &Recorder{uof: uof, outbox: outbox}
}

func (r *Recorder) queries(ctx context.Context) *db.Queries {
	return db.New(r.uof.DBTX(ctx))
}

// Created records LICENSE_FAMILY_CREATED for a family its first version has
// just opened. The caller writes it ahead of that version's LICENSE_CREATED:
// the product exists before the version that names it.
func (r *Recorder) Created(ctx context.Context, organizationID, familyID uuid.UUID) error {
	view, err := View(ctx, r.queries(ctx), organizationID, familyID)
	if err != nil {
		return err
	}
	return r.record(ctx, organizationID, licenseevents.LicenseFamilyCreated, view)
}

// Moved records LICENSE_FAMILY_UPDATED if the family no longer serves the
// version it served before the write -- it serves another, or none. The
// caller writes it after its own version event, which is the cause of it.
func (r *Recorder) Moved(ctx context.Context, organizationID uuid.UUID, before Before) error {
	queries := r.queries(ctx)
	after, err := servedVersion(ctx, queries, organizationID, before.FamilyID)
	if err != nil {
		return err
	}
	if sameVersion(before.served, after) {
		return nil
	}

	view, err := View(ctx, queries, organizationID, before.FamilyID)
	if err != nil {
		return err
	}
	return r.record(ctx, organizationID, licenseevents.LicenseFamilyUpdated, view)
}

// Deleted records LICENSE_FAMILY_DELETED for a family its last version has
// taken away, with the family as it stood before that version went -- as
// LICENSE_DELETED carries the version as it stood.
func (r *Recorder) Deleted(ctx context.Context, organizationID uuid.UUID, view *schema.LicenseFamilyView) error {
	return r.record(ctx, organizationID, licenseevents.LicenseFamilyDeleted, view)
}

func (r *Recorder) record(
	ctx context.Context, organizationID uuid.UUID, event events.Metadata, view *schema.LicenseFamilyView,
) error {
	return r.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(
		organizationID,
		event.Name,
		event.Type,
		view,
		nil,
	))
}

// servedVersion is the version the family resolves to, nil when it resolves
// to none: every version is a draft, or archived.
func servedVersion(ctx context.Context, queries *db.Queries, organizationID, familyID uuid.UUID) (*uuid.UUID, error) {
	rows, err := queries.GetCurrentLicenseVersionsByFamilyIDs(ctx, db.GetCurrentLicenseVersionsByFamilyIDsParams{
		OrganizationID: organizationID,
		FamilyIds:      []uuid.UUID{familyID},
	})
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}
	served := rows[0].ID
	return &served, nil
}

func sameVersion(a, b *uuid.UUID) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}
