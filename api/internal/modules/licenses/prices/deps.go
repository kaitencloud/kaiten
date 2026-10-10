package prices

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/gate"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Deps is what every price use case needs.
type Deps struct {
	UserProvider currentuser.Provider
	Uof          *uow.UnitOfWork
	// Gate keeps the priced catalogue behind the billing switch.
	Gate gate.Gate
}

// Caller is the user a price request acts for, past the billing gate.
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

// LockVersion reads, and locks for the rest of the transaction, the version a
// write names; <operation>.LicenseNotFound when the organization has none.
func LockVersion(ctx context.Context, queries *db.Queries, operation string, organizationID uuid.UUID, slug string) (db.GetLicenseForPricingRow, error) {
	version, err := queries.GetLicenseForPricing(ctx, db.GetLicenseForPricingParams{OrganizationID: organizationID, Slug: slug})
	if errors.Is(err, pgx.ErrNoRows) {
		return version, kaitenerrors.NotFoundf(operation+".LicenseNotFound", "license %q not found", slug)
	}
	return version, err
}

// VersionID reads the id of the version a read names; code when the
// organization has none.
func VersionID(ctx context.Context, queries *db.Queries, code string, organizationID uuid.UUID, slug string) (uuid.UUID, error) {
	version, err := queries.GetLicenseIDBySlug(ctx, db.GetLicenseIDBySlugParams{OrganizationID: organizationID, Slug: slug})
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, kaitenerrors.NotFoundf(code, "license %q not found", slug)
	}
	return version.ID, err
}

// Entitlement reads the entitlement a metered price names, with the version's
// grant of it; <operation>.EntitlementNotFound when the organization has none.
func Entitlement(ctx context.Context, queries *db.Queries, operation string, organizationID, licenseID uuid.UUID, slug string) (db.GetPricingEntitlementRow, error) {
	entitlement, err := queries.GetPricingEntitlement(ctx, db.GetPricingEntitlementParams{
		OrganizationID: organizationID, LicenseID: licenseID, Slug: slug,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return entitlement, kaitenerrors.NotFoundf(operation+".EntitlementNotFound", "entitlement %q not found", slug)
	}
	return entitlement, err
}

// RefuseBilled refuses to change what a licence version sells while a live
// subscription bills it: a grant edit, or a new price, would silently change
// a contract already sold. A new version and a plan change are the way.
func RefuseBilled(ctx context.Context, queries *db.Queries, operation string, organizationID uuid.UUID, licenseSlug string) error {
	billed, err := queries.VersionIsBilled(ctx, db.VersionIsBilledParams{OrganizationID: organizationID, LicenseSlug: licenseSlug})
	if err != nil {
		return err
	}
	if billed {
		return kaitenerrors.Conflict(operation+".BillingActive",
			"a live subscription bills this licence version: what it sells is frozen; publish a new version instead")
	}
	return nil
}
