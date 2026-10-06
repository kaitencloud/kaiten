package updatelicense

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
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type CommandRepository struct {
	uof *uow.UnitOfWork
	// clearedDefaults receives the versions that lose their family's default
	// to the one being updated. Nil unless WithClearedDefaults set it.
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

// UpdateLicense writes the command over the version slugged slug. The
// repository records no event: the use case does, through update, which also
// reports what the family served before the write.
func (r *CommandRepository) UpdateLicense(ctx context.Context, command *Command, slug string, userID uuid.UUID, organizationID uuid.UUID) (*schema.License, error) {
	license, _, err := r.update(ctx, command, slug, userID, organizationID)
	return license, err
}

func (r *CommandRepository) update(ctx context.Context, command *Command, slug string, userID uuid.UUID, organizationID uuid.UUID) (*schema.License, familyevents.Before, error) {
	queries := r.q(ctx)

	licenseType, err := dbmap.NormalizeType(command.Type)
	if err != nil {
		return nil, familyevents.Before{}, kaitenerrors.Validation("UpdateLicense.InvalidType", err.Error())
	}

	// The row's family, version and lifecycle state are read first. Every update
	// depends on the family: is_default is written as sent, so any update can
	// give the family's default up or take it, and with it change the version
	// the family serves. The family is resolved from the row being updated, not
	// from command.Name: since the license-family split the name is a display label the caller is
	// free to change in this very request, so using it to decide which rows lose
	// the default is how the previous version of this code cleared the flag on
	// the wrong set -- or on none at all, when the rename had already moved the
	// row out of the group.
	identity, err := queries.GetLicenseIdentityBySlug(ctx, db.GetLicenseIdentityBySlugParams{
		OrganizationID: organizationID,
		Slug:           slug,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, familyevents.Before{}, kaitenerrors.NotFound("UpdateLicense.NotFound", fmt.Sprintf("License with slug %q not found", slug))
		}
		return nil, familyevents.Before{}, err
	}
	familyID := identity.FamilyID

	// version is readOnly since the license-family split: a version's derived slug is built
	// from its number, so the number cannot move without the two
	// disagreeing. The stored value is accepted so a representation can be
	// written back as it was read; any other value is refused rather than
	// dropped. Nothing writes the column after the INSERT, so the comparison
	// cannot race.
	if command.Version != "" && command.Version != fmt.Sprintf("%d", identity.Version) {
		return nil, familyevents.Before{}, kaitenerrors.UnprocessableEntity("UpdateLicense.VersionNotSettable",
			fmt.Sprintf("License %q is version %d; the version is assigned by the server and cannot be changed", slug, identity.Version))
	}

	// lifecycleState moves only through publish, archive and unarchive
	//, which apply the lifecycle rules and record their events.
	// The stored state is accepted as an echo; any other is refused rather
	// than dropped.
	if command.LifecycleState != "" {
		requested, err := dbmap.NormalizeLifecycleState(command.LifecycleState)
		if err != nil {
			return nil, familyevents.Before{}, kaitenerrors.Validation("UpdateLicense.InvalidLifecycleState", err.Error())
		}
		if requested != identity.LifecycleState {
			return nil, familyevents.Before{}, kaitenerrors.UnprocessableEntity("UpdateLicense.LifecycleStateNotSettable",
				fmt.Sprintf("License %q is %s; its lifecycle state changes through POST /licenses/%s/publish, /archive or /unarchive", slug, identity.LifecycleState, slug))
		}
	}

	// A version never moves between families. familyId is accepted on
	// update only so that a client writing back what it read is not
	// refused; any other value is a reassignment, reported as such rather
	// than silently ignored -- the same rule the endpoint applies to
	// familySlug.
	if command.FamilyID != nil && *command.FamilyID != familyID {
		return nil, familyevents.Before{}, kaitenerrors.UnprocessableEntity("UpdateLicense.FamilyNotReassignable",
			fmt.Sprintf("License %q belongs to family %s; a version cannot move to family %s", slug, familyID, *command.FamilyID))
	}

	// The family row is locked before anything is written, as createlicense
	// and deletelicense lock it: every write that can move a family's
	// default, or what the family serves, then serializes on that row,
	// instead of racing on the partial unique index and leaving one side a
	// failure it could not see coming. What the family serves is read under
	// the lock, before the default moves, for familyevents to compare once
	// the row is written.
	_, err = queries.GetLicenseFamilyByIDForUpdate(ctx, db.GetLicenseFamilyByIDForUpdateParams{
		OrganizationID: organizationID,
		ID:             familyID,
	})
	if err != nil {
		// The family goes with its last version: a delete that committed
		// since the read above took this license with it.
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, familyevents.Before{}, kaitenerrors.NotFound("UpdateLicense.NotFound", fmt.Sprintf("License with slug %q not found", slug))
		}
		return nil, familyevents.Before{}, err
	}
	before, err := familyevents.Read(ctx, queries, organizationID, familyID)
	if err != nil {
		return nil, familyevents.Before{}, err
	}

	// The version being updated keeps the flag if it already has it: an
	// update restating isDefault moves nothing.
	if command.IsDefault {
		err = familydefault.Clear(ctx, queries, organizationID, familyID, &slug, r.clearedDefaults)
		if err != nil {
			return nil, familyevents.Before{}, err
		}
	}

	params := db.EditLicenseParams{
		Name:           command.Name,
		Description:    command.Description,
		Type:           licenseType,
		VersionName:    command.VersionName,
		OrganizationID: organizationID,
		UserID:         userID,
		Slug:           slug,
		IsDefault:      command.IsDefault,
		Features:       nil,

		PricingType:           nil,
		TrialPeriodDays:       nil,
		TrialPeriodDaysClear:  false,
		RequiresPaymentMethod: command.RequiresPaymentMethod,
		SelfServeCtaUrl:       nil,
		SelfServeCtaUrlClear:  false,
	}
	if command.PricingType != "" {
		pricingType := db.PricingType(command.PricingType)
		params.PricingType = &pricingType
	}
	if command.TrialPeriodDays != nil {
		if *command.TrialPeriodDays == 0 {
			params.TrialPeriodDaysClear = true
		} else {
			params.TrialPeriodDays = command.TrialPeriodDays
		}
	}
	if command.SelfServeCtaURL != nil {
		if *command.SelfServeCtaURL == "" {
			params.SelfServeCtaUrlClear = true
		} else {
			params.SelfServeCtaUrl = command.SelfServeCtaURL
		}
	}

	res, err := queries.EditLicense(ctx, params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, familyevents.Before{}, kaitenerrors.NotFound("UpdateLicense.NotFound", fmt.Sprintf("License with slug %q not found", slug))
		}
		if conflict := conflictFromUniqueViolation(err); conflict != nil {
			return nil, familyevents.Before{}, conflict
		}
		// Claiming the default for a version that is not PUBLISHED: a default is
		// what the family resolves to, and an unpublished version is one nothing
		// may serve (license_default_must_be_published_check).
		if kaitenerrors.IsCheckViolationOnConstraint(err, dbmap.DefaultMustBePublishedConstraint) {
			return nil, familyevents.Before{}, kaitenerrors.Conflict("UpdateLicense.DefaultMustBePublished",
				fmt.Sprintf("License %q is not PUBLISHED, and only a published version can be its family's default; publish or unarchive it first", slug))
		}
		return nil, familyevents.Before{}, err
	}

	license, err := dbmap.ToLicense(&res)
	if err != nil {
		return nil, familyevents.Before{}, err
	}
	return license, before, nil
}

// conflictFromUniqueViolation maps the one uniqueness rule an UPDATE here can
// still break, dbmap.FamilyDefaultKeyConstraint: a second default in
// one family. The unset above clears the previous one first under the family
// row lock, which every API write moving a default takes, so reaching it means
// a write outside those paths set a default between that statement and this
// one -- the race the partial unique index exists to lose safely, and the
// reason it is a database guarantee rather than an application convention.
//
// The other keys on license are out of reach: the slug is never written here,
// the version neither since it became readOnly, and the pre-family
// key on (name, version, organization_id) is dropped by
// 20261007000000_license_family.sql, so renaming a version onto a name another
// family holds is simply allowed.
//
// Returns nil for any other error, so the caller falls through to reporting it
// as a fault rather than as a conflict the client could resolve.
func conflictFromUniqueViolation(err error) *kaitenerrors.Error {
	if kaitenerrors.IsUniqueViolationOnConstraint(err, dbmap.FamilyDefaultKeyConstraint) {
		return kaitenerrors.Conflict("UpdateLicense.DefaultConflict",
			"Another version of this license family was set as default concurrently; retry the request")
	}
	return nil
}
