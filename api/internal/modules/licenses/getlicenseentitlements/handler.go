package getlicenseentitlements

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/licenseview"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container. EntitlementReader is the entitlements module's own
// public read port -- this module never imports entitlements' generated
// db package directly.
type Deps struct {
	UserProvider      currentuser.Provider
	Queries           *db.Queries
	EntitlementReader licenseview.Port
	UsageReporter     services.UsageReporter
}

type UseCase struct {
	deps       Deps
	repository *QueryRepository
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{
		deps:       deps,
		repository: NewQueryRepository(deps.Queries, deps.EntitlementReader),
	}
}

func (h *UseCase) Execute(ctx context.Context, licenseSlug string, limit int32, cursor *string) (pagination.Page[schema.LicenseEntitlement], error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return pagination.Page[schema.LicenseEntitlement]{}, err
	}

	var cursorKey *pagination.CreatedAtCursor
	if cursor != nil {
		key, err := pagination.Decode[pagination.CreatedAtCursor](*cursor)
		if err != nil {
			return pagination.Page[schema.LicenseEntitlement]{}, apierrors.Wrap(err, apierrors.KindValidation, "LicenseEntitlements.InvalidCursor", "invalid cursor")
		}
		cursorKey = &key
	}

	limit = pagination.ClampLimit(limit)

	page, err := h.repository.GetLicenseEntitlements(ctx, licenseSlug, user.OrganizationID, limit, cursorKey)
	if err != nil {
		return pagination.Page[schema.LicenseEntitlement]{}, err
	}

	h.deps.UsageReporter.TrackAsync(user.OrganizationID, dogfooding.LicenseEntitlementReadEntitlementSlug)

	return page, nil
}
