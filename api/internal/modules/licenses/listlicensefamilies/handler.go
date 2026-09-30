package listlicensefamilies

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
type Deps struct {
	UserProvider  currentuser.Provider
	Queries       *db.Queries
	UsageReporter services.UsageReporter
}

type UseCase struct {
	deps       Deps
	repository *QueryRepository
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{
		deps:       deps,
		repository: NewQueryRepository(deps.Queries),
	}
}

func (h *UseCase) Execute(ctx context.Context, limit int32, cursor *string) (pagination.Page[*schema.LicenseFamilyView], error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return pagination.Page[*schema.LicenseFamilyView]{}, err
	}

	var cursorKey *pagination.CreatedAtCursor
	if cursor != nil {
		key, err := pagination.Decode[pagination.CreatedAtCursor](*cursor)
		if err != nil {
			// Bad input, not a server fault -- reported under the same code the
			// license list uses for the same mistake.
			return pagination.Page[*schema.LicenseFamilyView]{}, apierrors.Wrap(err, apierrors.KindValidation, "Licenses.InvalidCursor", "invalid cursor")
		}
		cursorKey = &key
	}

	limit = pagination.ClampLimit(limit)

	families, err := h.repository.ListFamilies(ctx, user.OrganizationID, limit+1, cursorKey)
	if err != nil {
		return pagination.Page[*schema.LicenseFamilyView]{}, err
	}

	page, err := pagination.BuildPage(families, limit, func(f *schema.LicenseFamilyView) pagination.CreatedAtCursor {
		return pagination.CreatedAtCursor{CreatedAt: f.CreatedAt, ID: f.ID}
	})
	if err != nil {
		return pagination.Page[*schema.LicenseFamilyView]{}, err
	}

	// Billed as a license read: the families are the licenses, grouped.
	h.deps.UsageReporter.TrackAsync(user.OrganizationID, dogfooding.LicenseReadEntitlementSlug)

	return page, nil
}
