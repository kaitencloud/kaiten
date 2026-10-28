package getlicenseprice

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/licenseview"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type UseCase struct{ deps prices.Deps }

func NewUseCase(deps prices.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute reads one price of a version.
func (u *UseCase) Execute(ctx context.Context, licenseSlug string, priceID uuid.UUID) (*prices.Price, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	ctx = u.deps.AIPolicy.Resolve(ctx, user.OrganizationID)
	queries := u.deps.Queries(ctx)
	licenseID, err := prices.VersionID(ctx, queries, "GetLicensePrice.NotFound", user.OrganizationID, licenseSlug)
	if err != nil {
		return nil, err
	}
	price, err := prices.Get(ctx, queries, user.OrganizationID, licenseID, priceID)
	if err != nil {
		return nil, err
	}
	if price == nil {
		return nil, kaitenerrors.NotFoundf("GetLicensePrice.NotFound", "price %s not found on license %q", priceID, licenseSlug)
	}
	if price.Metered != nil {
		if err := licenseview.RequireOperational(ctx, u.deps.Uof.DBTX(ctx), u.deps.AIPolicy, user.OrganizationID, price.Metered.EntitlementSlug); err != nil {
			return nil, err
		}
	}
	return price, nil
}
