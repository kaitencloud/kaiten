package deletelicense

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/familyevents"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/dbmap"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type CommandRepository struct {
	uof *uow.UnitOfWork
}

func NewCommandRepository(uof *uow.UnitOfWork) *CommandRepository {
	return &CommandRepository{uof: uof}
}

// q resolves the sqlc Queries bound to whatever DBTX is active for
// ctx -- the caller's transaction if Transact opened one, the pool
// otherwise.
func (r *CommandRepository) q(ctx context.Context) *db.Queries {
	return db.New(r.uof.DBTX(ctx))
}

// familyDelete is what a delete did to the version's family, read under the
// family's row lock before the version went: it took the family away -- view is
// the family as it stood then -- or left it, serving what before says until the
// delete is compared against it.
type familyDelete struct {
	deleted bool
	view    *schema.LicenseFamilyView
	before  familyevents.Before
}

// DeleteLicense deletes the version slugged slug and, when it was the last one,
// its family. familyDeleted reports the latter. The repository records no
// event: the use case does, through deleteVersion, which also reports what the
// delete did to the family.
func (r *CommandRepository) DeleteLicense(
	ctx context.Context, organizationID uuid.UUID, slug string,
) (deleted *schema.License, familyDeleted bool, err error) {
	deleted, family, err := r.deleteVersion(ctx, organizationID, slug)
	return deleted, family.deleted, err
}

func (r *CommandRepository) deleteVersion(
	ctx context.Context, organizationID uuid.UUID, slug string,
) (deleted *schema.License, family familyDelete, err error) {
	queries := r.q(ctx)

	// The family row is locked first, before the version row goes, for two
	// reasons that are both about createlicense.joinExistingFamily, which
	// takes the same lock before adding a version. Taken in the same order --
	// family, then license rows -- the two cannot deadlock: a create that
	// puts a default on the version being deleted here locks the family, then
	// the license rows, and so does this. And held across the delete, the
	// lock is what makes the "last version" test below sound: a version being
	// added concurrently either committed before this ran, and is counted, or
	// is waiting on this lock and finds no family once it gets it
	// (CreateLicense.FamilyNotFound). Read under the row lock, not in the
	// DELETE's own WHERE: a NOT EXISTS evaluated before blocking on the lock
	// keeps its stale answer once the lock is granted.
	familyID, err := queries.LockLicenseFamilyOfLicense(ctx, db.LockLicenseFamilyOfLicenseParams{
		OrganizationID: organizationID,
		Slug:           slug,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, familyDelete{}, kaitenerrors.NotFound("DeleteLicense.NotFound", fmt.Sprintf("License with slug %q not found", slug))
		}
		return nil, familyDelete{}, err
	}

	// Under the lock, before the version goes: what the family serves, to
	// compare once the version is gone, and the family itself, which is what
	// LICENSE_FAMILY_DELETED carries if this was its last version -- afterwards
	// there is no family left to read.
	family.before, err = familyevents.Read(ctx, queries, organizationID, familyID)
	if err != nil {
		return nil, familyDelete{}, err
	}
	family.view, err = familyevents.View(ctx, queries, organizationID, familyID)
	if err != nil {
		return nil, familyDelete{}, err
	}

	params := db.DeleteLicenseParams{
		Slug:           slug,
		OrganizationID: organizationID,
	}

	result, err := queries.DeleteLicense(ctx, params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, familyDelete{}, kaitenerrors.NotFound("DeleteLicense.NotFound", fmt.Sprintf("License with slug %q not found", slug))
		}
		// license_entitlement and instance both reference license with
		// ON DELETE RESTRICT, so a license still in use fails here.
		if kaitenerrors.IsForeignKeyViolation(err) {
			return nil, familyDelete{}, kaitenerrors.Conflict(
				"DeleteLicense.InUseConflict",
				fmt.Sprintf("License with slug %q is still referenced by an instance or an entitlement and cannot be deleted", slug),
			)
		}
		return nil, familyDelete{}, err
	}

	// A family is the product; a product with no versions left is not a state
	// the API can represent -- its family endpoint has nothing to resolve to,
	// the family list would show it with nothing in it, and its slug would
	// stay reserved with no way to release it. So the last version takes the
	// family with it, and the slug can open a new product again. A family
	// that still has versions is untouched: the delete is conditional on the
	// count, read under the lock taken above.
	familiesDeleted, err := queries.DeleteLicenseFamilyIfEmpty(ctx, db.DeleteLicenseFamilyIfEmptyParams{
		OrganizationID: organizationID,
		FamilyID:       familyID,
	})
	if err != nil {
		return nil, familyDelete{}, err
	}
	family.deleted = familiesDeleted > 0

	deleted, err = dbmap.ToLicense(&result)
	if err != nil {
		return nil, familyDelete{}, err
	}
	return deleted, family, nil
}
