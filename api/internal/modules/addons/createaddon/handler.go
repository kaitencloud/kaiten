package createaddon

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "CreateAddon"

// NewAddon is a version to create.
type NewAddon struct {
	Name           string     `json:"name" minLength:"1" example:"Extra seats"`
	Slug           *string    `json:"slug,omitempty" doc:"The version's slug. Default: {familySlug}-v{n} for a new version of a family, a slug generated from the name for a new family." example:"extra-seats-v1"`
	Description    string     `json:"description" example:"Five more seats per unit"`
	FamilyID       *uuid.UUID `json:"familyId,omitempty" doc:"Make this a new version of this family"`
	FamilySlug     *string    `json:"familySlug,omitempty" doc:"Make this a new version of this family" example:"extra-seats"`
	VersionName    *string    `json:"versionName,omitempty" doc:"Default: Version - {n}"`
	LifecycleState string     `json:"lifecycleState,omitempty" enum:"DRAFT,PUBLISHED" default:"PUBLISHED"`
	IsDefault      bool       `json:"isDefault,omitempty" doc:"Make this version its family's default; the previous default loses it"`
	PricingType    string     `json:"pricingType" enum:"FREE,PAID,CUSTOM"`
	MaxQuantity    *int32     `json:"maxQuantity,omitempty" doc:"The largest quantity an instance can hold" example:"10"`
}

type UseCase struct {
	deps   catalogue.Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps catalogue.Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Execute creates the version, opening its family when it names none.
func (u *UseCase) Execute(ctx context.Context, command NewAddon) (*catalogue.Addon, error) {
	if command.Slug != nil {
		if _, err := slugutil.New(*command.Slug); err != nil {
			return nil, kaitenerrors.UnprocessableEntity(operation+".InvalidSlug", slugutil.InvalidReason(*command.Slug))
		}
	}
	if err := catalogue.ValidateMaxQuantity(operation, command.MaxQuantity); err != nil {
		return nil, err
	}
	state := command.LifecycleState
	if state == "" {
		state = catalogue.Published
	}
	if command.IsDefault && state != catalogue.Published {
		return nil, catalogue.DefaultMustBePublished(operation)
	}
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	var created catalogue.Addon
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := u.deps.Queries(ctx)
		family, slug, err := u.family(ctx, q, user.OrganizationID, command)
		if err != nil {
			return err
		}
		if command.IsDefault {
			if err := q.ClearAddonFamilyDefault(ctx, db.ClearAddonFamilyDefaultParams{
				UserID: user.ID, OrganizationID: user.OrganizationID, FamilyID: family.ID, ExceptID: uuid.Nil,
			}); err != nil {
				return err
			}
		}
		row, err := q.InsertAddon(ctx, db.InsertAddonParams{
			OrganizationID: user.OrganizationID, FamilyID: family.ID, Name: command.Name, Slug: slug,
			Description: command.Description, VersionName: command.VersionName, IsDefault: command.IsDefault,
			LifecycleState: db.LicenseLifecycleState(state), PricingType: db.PricingType(command.PricingType),
			MaxQuantity: command.MaxQuantity, UserID: user.ID,
		})
		if kaitenerrors.IsUniqueViolationOnConstraint(err, "addon_organization_id_slug_key") {
			return kaitenerrors.Conflict(operation+".SlugConflict", fmt.Sprintf("an add-on version with slug %q already exists", slug))
		}
		if kaitenerrors.IsUniqueViolationOnConstraint(err, "addon_family_id_is_default_key") {
			return kaitenerrors.Conflict(operation+".DefaultConflict", "another version of this family was made the default concurrently; retry")
		}
		if err != nil {
			return err
		}
		created = catalogue.ToAddon(row, family.Slug)
		return u.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(user.OrganizationID,
			events.AddonCreated.Name, events.AddonCreated.Type, created, nil))
	})
	if err != nil {
		return nil, err
	}
	return &created, nil
}

// family locks the family the command names, or opens one, and decides the
// version's slug.
func (u *UseCase) family(ctx context.Context, q *db.Queries, organizationID uuid.UUID, command NewAddon) (db.AddonFamily, string, error) {
	if command.FamilyID == nil && command.FamilySlug == nil {
		slug := ""
		if command.Slug != nil {
			slug = *command.Slug
		} else {
			generated, err := slugutil.GenerateUnique(command.Name)
			if err != nil {
				return db.AddonFamily{}, "", err
			}
			slug = generated
		}
		family, err := q.CreateAddonFamily(ctx, db.CreateAddonFamilyParams{OrganizationID: organizationID, Slug: slug})
		if kaitenerrors.IsUniqueViolationOnConstraint(err, "addon_family_organization_id_slug_key") {
			return db.AddonFamily{}, "", kaitenerrors.Conflict(operation+".SlugConflict",
				fmt.Sprintf("an add-on family with slug %q already exists", slug))
		}
		return family, slug, err
	}
	var (
		family db.AddonFamily
		err    error
	)
	if command.FamilyID != nil {
		family, err = q.LockAddonFamilyByID(ctx, db.LockAddonFamilyByIDParams{OrganizationID: organizationID, ID: *command.FamilyID})
	} else {
		family, err = q.LockAddonFamilyBySlug(ctx, db.LockAddonFamilyBySlugParams{OrganizationID: organizationID, Slug: *command.FamilySlug})
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return db.AddonFamily{}, "", kaitenerrors.NotFound(operation+".FamilyNotFound", "add-on family not found")
	}
	if err != nil {
		return db.AddonFamily{}, "", err
	}
	if command.FamilyID != nil && command.FamilySlug != nil && *command.FamilySlug != family.Slug {
		return db.AddonFamily{}, "", kaitenerrors.UnprocessableEntity(operation+".FamilyMismatch",
			fmt.Sprintf("familyId %s is the family %q, not %q", family.ID, family.Slug, *command.FamilySlug))
	}
	if command.Slug != nil {
		return family, *command.Slug, nil
	}
	return family, slugutil.WithSuffix(family.Slug, fmt.Sprintf("v%d", family.LastVersion+1)), nil
}
