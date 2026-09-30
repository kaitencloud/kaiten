package getmetadatafields

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/listcursor"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/schema"
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

func (h *UseCase) Execute(ctx context.Context, command *Command, limit int32, cursor *string) (pagination.Page[*schema.MetadataField], error) {
	u, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return pagination.Page[*schema.MetadataField]{}, err
	}

	var cursorKey *listcursor.Key
	if cursor != nil {
		key, err := pagination.Decode[listcursor.Key](*cursor)
		if err != nil {
			return pagination.Page[*schema.MetadataField]{}, apierrors.Wrap(err, apierrors.KindValidation, "MetadataFields.InvalidCursor", "invalid cursor")
		}
		cursorKey = &key
	}

	limit = pagination.ClampLimit(limit)

	fields, err := h.repository.ListMetadataFields(ctx, command.ResourceType, u.OrganizationID, limit+1, cursorKey)
	if err != nil {
		return pagination.Page[*schema.MetadataField]{}, err
	}

	page, err := pagination.BuildPage(fields, limit, func(f *schema.MetadataField) listcursor.Key {
		return listcursor.Key{DisplayOrder: f.DisplayOrder, CreatedAt: f.CreatedAt, ID: f.ID}
	})
	if err != nil {
		return pagination.Page[*schema.MetadataField]{}, err
	}

	h.deps.UsageReporter.TrackAsync(u.OrganizationID, dogfooding.MetadataFieldReadEntitlementSlug)

	return page, nil
}
