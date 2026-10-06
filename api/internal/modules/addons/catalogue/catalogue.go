// Package catalogue is what the add-on use cases share: the resource shapes,
// the caller and the billing gate, and reading the rows a write names.
//
// An add-on mirrors a licence: a family carries the identity and the version
// counter, each version has a lifecycle state, prices and grants. Unlike a
// licence, an add-on is attached to an instance with a quantity, and each of
// its grants counts once per unit.
package catalogue

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/gate"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Deps is what every add-on use case needs.
type Deps struct {
	UserProvider currentuser.Provider
	Uof          *uow.UnitOfWork
	// Gate keeps add-ons behind the billing switch.
	Gate gate.Gate
}

// Caller is the user a request acts for, past the billing gate.
func (d Deps) Caller(ctx context.Context) (*currentuser.User, error) {
	user, err := d.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}
	if err := d.Gate.Require(ctx, user.OrganizationID); err != nil {
		return nil, err
	}
	return user, nil
}

// Queries binds to the transaction ctx carries, or the pool.
func (d Deps) Queries(ctx context.Context) *db.Queries {
	return db.New(d.Uof.DBTX(ctx))
}

// Addon is an add-on version as the API returns it.
type Addon struct {
	ID             uuid.UUID `json:"id" readOnly:"true"`
	Slug           string    `json:"slug" doc:"The version's slug, unique in the organization" example:"extra-seats-v1"`
	FamilySlug     string    `json:"familySlug" doc:"The family the version belongs to" example:"extra-seats"`
	Name           string    `json:"name" example:"Extra seats"`
	Description    string    `json:"description"`
	Version        int32     `json:"version" readOnly:"true" doc:"The version number in its family, assigned on create" example:"1"`
	VersionName    string    `json:"versionName" example:"Version - 1"`
	IsDefault      bool      `json:"isDefault" doc:"The version the family resolves to. Only a PUBLISHED version."`
	LifecycleState string    `json:"lifecycleState" enum:"DRAFT,PUBLISHED,ARCHIVED" doc:"A DRAFT can be attached to try it; an ARCHIVED version stays on the instances holding it but cannot be attached again."`
	PricingType    string    `json:"pricingType" enum:"FREE,PAID,CUSTOM"`
	MaxQuantity    *int32    `json:"maxQuantity,omitempty" doc:"The largest quantity an instance can hold; unbounded when absent" example:"10"`
	CreatedAt      time.Time `json:"createdAt" readOnly:"true"`
	UpdatedAt      time.Time `json:"updatedAt" readOnly:"true"`
}

// AddonFamily is an add-on family with its versions.
type AddonFamily struct {
	ID             uuid.UUID `json:"id" readOnly:"true"`
	Slug           string    `json:"slug" example:"extra-seats"`
	IsPublic       bool      `json:"isPublic" doc:"Whether the family is listed in the public catalogue"`
	LastVersion    int32     `json:"lastVersion" doc:"The highest version number the family has assigned"`
	CurrentVersion *Addon    `json:"currentVersion,omitempty" doc:"The default version, else the highest PUBLISHED one; absent when none is published"`
	Versions       []Addon   `json:"versions" doc:"Every version, newest first"`
}

// AddonEntitlement is what an add-on version grants per unit of quantity.
type AddonEntitlement struct {
	ID                             uuid.UUID      `json:"id" readOnly:"true"`
	EntitlementSlug                string         `json:"entitlementSlug" example:"seats"`
	EntitlementType                string         `json:"entitlementType" enum:"BOOLEAN,NUMBER,CONFIG,NUMBER_AI_CREDIT"`
	Value                          map[string]any `json:"value" doc:"{type, value}, shaped like a licence grant. A number counts once per unit of quantity."`
	OverrideBehavior               string         `json:"overrideBehavior" enum:"ADD,OVERRIDE,MAX" doc:"How a number grant combines with the licence's: ADD sums value × quantity, OVERRIDE replaces it with the latest attached add-on's, MAX keeps the larger. A boolean always ORs, a config always overrides."`
	LimitCapExceededOveragePercent *int16         `json:"limitCapExceededOveragePercent,omitempty" doc:"The overage the add-on allows; absent inherits the licence grant's"`
}

// Lifecycle states and pricing types, as the API spells them.
const (
	Draft     = "DRAFT"
	Published = "PUBLISHED"
	Archived  = "ARCHIVED"

	PricingPaid = "PAID"
)

// ToAddon maps a version row.
func ToAddon(row db.Addon, familySlug string) Addon {
	versionName := ""
	if row.VersionName != nil {
		versionName = *row.VersionName
	}
	return Addon{
		ID: row.ID, Slug: row.Slug, FamilySlug: familySlug, Name: row.Name, Description: row.Description,
		Version: row.Version, VersionName: versionName, IsDefault: row.IsDefault,
		LifecycleState: string(row.LifecycleState), PricingType: string(row.PricingType),
		MaxQuantity: row.MaxQuantity, CreatedAt: row.CreatedAt.Time, UpdatedAt: row.UpdatedAt.Time,
	}
}

// Locked is a version a write holds the lock on.
type Locked struct {
	Row        db.Addon
	FamilySlug string
}

// Addon maps the locked version.
func (l Locked) Addon() Addon { return ToAddon(l.Row, l.FamilySlug) }

// Lock reads and locks, after its family, the version a write names;
// <operation>.NotFound (or code, when given) when the organization has none.
func Lock(ctx context.Context, q *db.Queries, organizationID uuid.UUID, slug, code string) (Locked, error) {
	row, err := q.LockAddonBySlug(ctx, db.LockAddonBySlugParams{OrganizationID: organizationID, Slug: slug})
	if errors.Is(err, pgx.ErrNoRows) {
		return Locked{}, kaitenerrors.NotFoundf(code, "add-on %q not found", slug)
	}
	if err != nil {
		return Locked{}, err
	}
	return Locked{Row: db.Addon{
		ID: row.ID, OrganizationID: row.OrganizationID, FamilyID: row.FamilyID, Name: row.Name, Slug: row.Slug,
		Description: row.Description, Version: row.Version, VersionName: row.VersionName, IsDefault: row.IsDefault,
		LifecycleState: row.LifecycleState, PricingType: row.PricingType, MaxQuantity: row.MaxQuantity,
		CreatedAt: row.CreatedAt, CreatedByID: row.CreatedByID, UpdatedAt: row.UpdatedAt, UpdatedByID: row.UpdatedByID,
	}, FamilySlug: row.FamilySlug}, nil
}

// Get reads the version a read names; code when the organization has none.
func Get(ctx context.Context, q *db.Queries, organizationID uuid.UUID, slug, code string) (Addon, error) {
	row, err := q.GetAddonBySlug(ctx, db.GetAddonBySlugParams{OrganizationID: organizationID, Slug: slug})
	if errors.Is(err, pgx.ErrNoRows) {
		return Addon{}, kaitenerrors.NotFoundf(code, "add-on %q not found", slug)
	}
	if err != nil {
		return Addon{}, err
	}
	return ToAddon(db.Addon{
		ID: row.ID, OrganizationID: row.OrganizationID, FamilyID: row.FamilyID, Name: row.Name, Slug: row.Slug,
		Description: row.Description, Version: row.Version, VersionName: row.VersionName, IsDefault: row.IsDefault,
		LifecycleState: row.LifecycleState, PricingType: row.PricingType, MaxQuantity: row.MaxQuantity,
		CreatedAt: row.CreatedAt, CreatedByID: row.CreatedByID, UpdatedAt: row.UpdatedAt, UpdatedByID: row.UpdatedByID,
	}, row.FamilySlug), nil
}

// RefuseBilled refuses to change what an add-on version sells while an
// instance a live subscription bills holds it: a new version is the way.
func RefuseBilled(ctx context.Context, q *db.Queries, operation string, organizationID, addonID uuid.UUID) error {
	billed, err := q.AddonIsBilled(ctx, db.AddonIsBilledParams{OrganizationID: organizationID, AddonID: addonID})
	if err != nil {
		return err
	}
	if billed {
		return kaitenerrors.Conflict(operation+".BillingActive",
			"an instance with a live subscription holds this add-on version: what it sells is frozen; publish a new version instead")
	}
	return nil
}

// ValidateMaxQuantity checks maxQuantity, when set.
func ValidateMaxQuantity(operation string, maxQuantity *int32) error {
	if maxQuantity != nil && *maxQuantity < 1 {
		return kaitenerrors.UnprocessableEntity(operation+".InvalidMaxQuantity", "maxQuantity is at least 1")
	}
	return nil
}

// DefaultMustBePublished is the error a default that is not PUBLISHED gets.
func DefaultMustBePublished(operation string) error {
	return kaitenerrors.UnprocessableEntity(operation+".DefaultMustBePublished",
		"an add-on can only be its family's default while it is PUBLISHED")
}

// DefaultName is the version name a version gets when none is given.
func DefaultName(version int32) string { return fmt.Sprintf("Version - %d", version) }
