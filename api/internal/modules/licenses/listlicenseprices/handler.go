package listlicenseprices

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
)

type UseCase struct{ deps prices.Deps }

func NewUseCase(deps prices.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute lists a version's prices in display order, optionally one status or
// billing model.
func (u *UseCase) Execute(ctx context.Context, licenseSlug, status, billingModel string) ([]prices.Price, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	queries := u.deps.Queries(ctx)
	licenseID, err := prices.VersionID(ctx, queries, "ListLicensePrices.LicenseNotFound", user.OrganizationID, licenseSlug)
	if err != nil {
		return nil, err
	}
	return prices.List(ctx, queries, user.OrganizationID, licenseID, status, billingModel)
}
