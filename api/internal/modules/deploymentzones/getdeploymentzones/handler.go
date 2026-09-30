package getdeploymentzones

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/schema"
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

func (h *UseCase) Execute(ctx context.Context, limit int32, cursor *string) (pagination.Page[*schema.DeploymentZone], error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return pagination.Page[*schema.DeploymentZone]{}, err
	}

	var cursorKey *pagination.CreatedAtCursor
	if cursor != nil {
		key, err := pagination.Decode[pagination.CreatedAtCursor](*cursor)
		if err != nil {
			return pagination.Page[*schema.DeploymentZone]{}, apierrors.Wrap(err, apierrors.KindValidation, "DeploymentZones.InvalidCursor", "invalid cursor")
		}
		cursorKey = &key
	}

	limit = pagination.ClampLimit(limit)

	deploymentZones, err := h.repository.GetDeploymentZones(ctx, user.OrganizationID, limit+1, cursorKey)
	if err != nil {
		return pagination.Page[*schema.DeploymentZone]{}, err
	}

	page, err := pagination.BuildPage(deploymentZones, limit, func(dz *schema.DeploymentZone) pagination.CreatedAtCursor {
		return pagination.CreatedAtCursor{CreatedAt: dz.CreatedAt, ID: dz.ID}
	})
	if err != nil {
		return pagination.Page[*schema.DeploymentZone]{}, err
	}

	h.deps.UsageReporter.TrackAsync(user.OrganizationID, dogfooding.DeploymentZoneReadEntitlementSlug)

	return page, nil
}
