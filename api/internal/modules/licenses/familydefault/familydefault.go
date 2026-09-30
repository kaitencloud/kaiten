// Package familydefault takes a license family's default away from the
// versions holding it, when another version claims it.
//
// A version losing the default changes as much as the one gaining it -- a
// catalogue keyed on isDefault has to hear about both -- so the versions that
// lost it are handed back to the caller, and the use cases announce each one
// as LICENSE_UPDATED, in the same transaction as the write that moved the
// default.
package familydefault

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/dbmap"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
)

// Cleared receives, inside the write's transaction, the versions of one
// organization that just lost their family's default.
type Cleared func(ctx context.Context, organizationID uuid.UUID, versions []schema.License) error

// Clear switches the family's default off on every version but the one slugged
// keep -- on all of them when keep is nil -- and hands the versions it changed
// to cleared, unless cleared is nil.
func Clear(
	ctx context.Context, queries *db.Queries, organizationID, familyID uuid.UUID, keep *string, cleared Cleared,
) error {
	rows, err := queries.UnsetFamilyDefault(ctx, db.UnsetFamilyDefaultParams{
		OrganizationID:  organizationID,
		FamilyID:        familyID,
		KeptLicenseSlug: keep,
	})
	if err != nil {
		return err
	}
	if cleared == nil || len(rows) == 0 {
		return nil
	}

	versions := make([]schema.License, 0, len(rows))
	for i := range rows {
		license, err := dbmap.ToLicense(&rows[i])
		if err != nil {
			return err
		}
		versions = append(versions, *license)
	}
	return cleared(ctx, organizationID, versions)
}

// Announce returns the Cleared the use cases install: one LICENSE_UPDATED per
// version, written to the outbox of the caller's transaction.
func Announce(outboxRepository *outbox.ScopedRepository) Cleared {
	return func(ctx context.Context, organizationID uuid.UUID, versions []schema.License) error {
		for i := range versions {
			err := outboxRepository.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(
				organizationID,
				events.LicenseUpdated.Name,
				events.LicenseUpdated.Type,
				&versions[i],
				nil,
			))
			if err != nil {
				return err
			}
		}
		return nil
	}
}
