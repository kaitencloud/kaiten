package createlicense

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/familydefault"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/familyevents"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/dbmap"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// license carries three unique keys a create can meet (see the initial
// migration and 20260902000000_license_family.sql): licenseSlugConstraint on
// (organization_id, slug), license_family_id_version_key on
// (family_id, version), and the partial dbmap.FamilyDefaultKeyConstraint on
// family_id where is_default. Only the first is a slug conflict --
// discriminating by constraint name keeps a violation of the others from being
// retried with a new slug, which would never fix them.
//
// The version constraint is unreachable on INSERT since version became
// server-assigned: update_license_version() advances the family's counter on
// the family row, which serializes the family to commit, so two concurrent
// creates cannot land on the same version. A violation there would mean the
// trigger is gone, which is a 500, not a 409 the caller can act on. Nothing
// writes the version after the INSERT either: the version is read-only.
//
// The default key is reachable: a create claiming the default clears the
// previous one first, but a claim that commits in between -- another create, or
// an update -- leaves the INSERT a second default to collide with. That is a
// 409 the caller can retry, as it is on update.
//
// The pre-family key on (name, version, organization_id) is dropped by
// 20260902000000_license_family.sql: a name is a display label two families may
// share, so there is no name-keyed conflict left to map here.
const licenseSlugConstraint = "license_organization_id_slug_key"

// licenseFamilySlugConstraint is the family's own (organization_id, slug)
// uniqueness. Reachable from here even though the family slug is copied from a
// license slug that was just checked for uniqueness: the license that opened a
// family can be deleted, freeing its slug for a later create, while the family
// named after it survives through its other versions -- the slug a pricing URL
// points at stays reserved for as long as the product exists. (Deleting a
// family's last version deletes the family too, and frees the slug.) Reported
// as a slug conflict so the create flow's retry regenerates and moves on,
// exactly as it does for the license row itself.
const licenseFamilySlugConstraint = "license_family_organization_id_slug_key"

type CommandRepository struct {
	uof *uow.UnitOfWork
	// clearedDefaults receives the versions that lose their family's default
	// to the one being created. Nil unless WithClearedDefaults set it.
	clearedDefaults familydefault.Cleared
}

func NewCommandRepository(uof *uow.UnitOfWork) *CommandRepository {
	return &CommandRepository{uof: uof}
}

// WithClearedDefaults returns a copy of the repository that hands the versions
// losing their family's default to cleared. The use case installs one that
// announces them; a caller seeding data directly can leave it unset.
func (r *CommandRepository) WithClearedDefaults(cleared familydefault.Cleared) *CommandRepository {
	copied := *r
	copied.clearedDefaults = cleared
	return &copied
}

// q resolves the sqlc Queries bound to whatever DBTX is active for
// ctx -- the caller's transaction if Transact opened one, the pool
// otherwise.
func (r *CommandRepository) q(ctx context.Context) *db.Queries {
	return db.New(r.uof.DBTX(ctx))
}

// familyWrite is what a create did to the family its version joined: it
// opened the family, or it found the family serving before -- read under the
// family's row lock, ahead of the default this create may take.
type familyWrite struct {
	opened bool
	before familyevents.Before
}

// CreateLicense creates the version the command describes. The repository
// records no event: the use case does, through create, which also reports what
// the write did to the family.
func (r *CommandRepository) CreateLicense(ctx context.Context, command *Command, organizationID uuid.UUID) (*schema.License, error) {
	license, _, err := r.create(ctx, command, organizationID)
	return license, err
}

func (r *CommandRepository) create(ctx context.Context, command *Command, organizationID uuid.UUID) (*schema.License, familyWrite, error) {
	queries := r.q(ctx)

	licenseType, err := dbmap.NormalizeType(command.Type)
	if err != nil {
		return nil, familyWrite{}, kaitenerrors.Validation("CreateLicense.InvalidType", err.Error())
	}

	// An unset state means the caller did not ask for one, and a license created
	// through this path has always been servable immediately -- so it publishes.
	// A vendor preparing a version says DRAFT explicitly.
	lifecycleState := command.LifecycleState
	if lifecycleState == "" {
		lifecycleState = schema.Published
	}
	state, err := dbmap.NormalizeLifecycleState(lifecycleState)
	if err != nil {
		return nil, familyWrite{}, kaitenerrors.Validation("CreateLicense.InvalidLifecycleState", err.Error())
	}

	familyID, slug, family, err := r.resolveFamilyAndSlug(ctx, queries, command, organizationID)
	if err != nil {
		return nil, familyWrite{}, err
	}

	params := db.CreateLicenseParams{
		Name:           command.Name,
		Slug:           slug,
		Description:    command.Description,
		Type:           licenseType,
		VersionName:    command.VersionName,
		OrganizationID: organizationID,
		FamilyID:       familyID,
		IsDefault:      command.IsDefault,
		LifecycleState: state,
		Features:       nil,
	}

	result, err := queries.CreateLicense(ctx, params)
	if err != nil {
		if kaitenerrors.IsUniqueViolationOnConstraint(err, licenseSlugConstraint) {
			return nil, familyWrite{}, kaitenerrors.Wrap(slugutil.ErrConflict, kaitenerrors.KindConflict,
				"CreateLicense.SlugConflict", fmt.Sprintf("License with slug %q already exists in this organization", slug))
		}
		if kaitenerrors.IsUniqueViolationOnConstraint(err, dbmap.FamilyDefaultKeyConstraint) {
			return nil, familyWrite{}, kaitenerrors.Conflict("CreateLicense.DefaultConflict",
				"Another version of this license family was set as default concurrently; retry the request")
		}
		// Creating an unpublished version and marking it the family's default in
		// the same request: the two are mutually exclusive by construction, since
		// a default is what the family resolves to and an unpublished version is
		// one nothing may serve.
		if kaitenerrors.IsCheckViolationOnConstraint(err, dbmap.DefaultMustBePublishedConstraint) {
			return nil, familyWrite{}, kaitenerrors.Conflict("CreateLicense.DefaultMustBePublished",
				"a license can only be the family's default while it is PUBLISHED")
		}
		return nil, familyWrite{}, err
	}

	license, err := dbmap.ToLicense(&result)
	if err != nil {
		return nil, familyWrite{}, err
	}
	return license, family, nil
}

// resolveFamilyAndSlug settles the two things that depend on whether this
// create names a family: which family the row joins, and what slug it takes.
//
// It also performs the one write that has to happen before the INSERT -- the
// previous default of the family being switched off -- because that is only
// meaningful once the family is known.
func (r *CommandRepository) resolveFamilyAndSlug(
	ctx context.Context, queries *db.Queries, command *Command, organizationID uuid.UUID,
) (uuid.UUID, string, familyWrite, error) {
	if command.FamilySlug != nil || command.FamilyID != nil {
		familyID, slug, before, err := r.joinExistingFamily(ctx, queries, command, organizationID)
		return familyID, slug, familyWrite{before: before}, err
	}

	// No family named: this is the first version of a new product, so it brings
	// its family into existence. The family takes the license's own slug -- at
	// version 1 they address the same thing, and it is the slug any catalogue
	// link already points at.
	//
	// Nothing to unset: a family that did not exist a statement ago has no
	// other version to hold the default.
	slug := *command.Slug
	family, err := queries.CreateLicenseFamily(ctx, db.CreateLicenseFamilyParams{
		OrganizationID: organizationID,
		Slug:           slug,
	})
	if err != nil {
		if kaitenerrors.IsUniqueViolationOnConstraint(err, licenseFamilySlugConstraint) {
			return uuid.Nil, "", familyWrite{}, kaitenerrors.Wrap(slugutil.ErrConflict, kaitenerrors.KindConflict,
				"CreateLicense.SlugConflict", fmt.Sprintf("License family with slug %q already exists in this organization", slug))
		}
		return uuid.Nil, "", familyWrite{}, err
	}

	return family.ID, slug, familyWrite{opened: true, before: familyevents.Before{FamilyID: family.ID}}, nil
}

// joinExistingFamily adds a version to the family the command names.
//
// The family row is locked FOR UPDATE first, which is what makes the version
// number knowable before the INSERT rather than only after it: the slug is
// derived from that number, and update_license_version() -- which remains the
// authority on the stored value -- assigns last_version + 1 by advancing the
// counter on this same locked row. Held to commit, the lock keeps the counter
// where it was read, so the derived slug and the stored version cannot
// disagree. The counter never goes back, so neither the number nor the slug
// built from it is handed out twice, even after a version is deleted.
//
// It is also why a version slug needs no random suffix: {familySlug}-v{n} is
// unique by construction within a family that is serialized.
func (r *CommandRepository) joinExistingFamily(
	ctx context.Context, queries *db.Queries, command *Command, organizationID uuid.UUID,
) (uuid.UUID, string, familyevents.Before, error) {
	family, err := r.lockTargetFamily(ctx, queries, command, organizationID)
	if err != nil {
		return uuid.Nil, "", familyevents.Before{}, err
	}
	// What the family serves before this version joins it, read under the lock
	// and before the default is cleared below: taking the default, or being a
	// newer published version, is how this create changes it.
	before, err := familyevents.Read(ctx, queries, organizationID, family.ID)
	if err != nil {
		return uuid.Nil, "", familyevents.Before{}, err
	}
	// The derived slug comes from the family's own slug, whichever handle
	// named the family.
	familySlug := family.Slug

	slug := ""
	if command.Slug != nil {
		// An explicitly supplied slug wins over the derived one: the caller is
		// bringing its own identifier, which is the override the derivation is
		// a default for.
		slug = *command.Slug
	} else {
		nextVersion := family.LastVersion + 1
		slug = slugutil.WithSuffix(familySlug, fmt.Sprintf("v%d", nextVersion))
	}

	// Nothing to keep: the version taking the default is not written yet.
	if command.IsDefault {
		err = familydefault.Clear(ctx, queries, organizationID, family.ID, nil, r.clearedDefaults)
		if err != nil {
			return uuid.Nil, "", familyevents.Before{}, err
		}
	}

	return family.ID, slug, before, nil
}

// lockTargetFamily resolves the family a version-creating command names, by
// identifier or by slug, and takes the row lock joinExistingFamily relies on.
//
// Both forms exist because the two kinds of caller hold different handles: an
// integrator addresses a product by the slug it published, while the console
// holds the familyId every license carries and nothing else -- the family's
// slug is served by the family endpoints, not on the version. Sent together
// they have to agree: silently preferring one would let a caller add a version
// to a product it did not mean.
func (r *CommandRepository) lockTargetFamily(
	ctx context.Context, queries *db.Queries, command *Command, organizationID uuid.UUID,
) (db.LicenseFamily, error) {
	if command.FamilyID != nil {
		family, err := queries.GetLicenseFamilyByIDForUpdate(ctx, db.GetLicenseFamilyByIDForUpdateParams{
			OrganizationID: organizationID,
			ID:             *command.FamilyID,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return db.LicenseFamily{}, kaitenerrors.NotFound("CreateLicense.FamilyNotFound",
					fmt.Sprintf("License family with id %s not found", *command.FamilyID))
			}
			return db.LicenseFamily{}, err
		}
		if command.FamilySlug != nil && *command.FamilySlug != family.Slug {
			return db.LicenseFamily{}, kaitenerrors.UnprocessableEntity("CreateLicense.FamilyMismatch",
				fmt.Sprintf("familyId %s is the family %q, not %q; send one of the two, or two that agree",
					family.ID, family.Slug, *command.FamilySlug))
		}
		return family, nil
	}

	familySlug := *command.FamilySlug
	family, err := queries.GetLicenseFamilyForUpdate(ctx, db.GetLicenseFamilyForUpdateParams{
		OrganizationID: organizationID,
		Slug:           familySlug,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return db.LicenseFamily{}, kaitenerrors.NotFound("CreateLicense.FamilyNotFound",
				fmt.Sprintf("License family with slug %q not found", familySlug))
		}
		return db.LicenseFamily{}, err
	}
	return family, nil
}
