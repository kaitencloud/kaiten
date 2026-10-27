package listmodels

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type Filter struct {
	Status   *schema.Status
	Vendor   *string
	Modality *schema.Modality
}

type Deps struct {
	AIPolicy     aiusage.Policy
	UserProvider currentuser.Provider
	Queries      *db.Queries
}
type UseCase struct{ deps Deps }

func NewUseCase(deps Deps) *UseCase { return &UseCase{deps: deps} }
func (h *UseCase) Execute(ctx context.Context, filter Filter, limit int32, cursor *string) (pagination.Page[*schema.Model], error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return pagination.Page[*schema.Model]{}, err
	}
	if err := h.deps.AIPolicy.RequireEnabled(); err != nil {
		return pagination.Page[*schema.Model]{}, err
	}
	var createdAt *time.Time
	var id *uuid.UUID
	if cursor != nil {
		key, err := pagination.Decode[pagination.CreatedAtCursor](*cursor)
		if err != nil {
			return pagination.Page[*schema.Model]{}, apierrors.Wrap(err, apierrors.KindValidation, "ListModels.InvalidCursor", "invalid cursor")
		}
		createdAt, id = &key.CreatedAt, &key.ID
	}
	limit = pagination.ClampLimit(limit)
	rows, err := h.deps.Queries.ListModels(ctx, db.ListModelsParams{
		OrganizationID: user.OrganizationID, Status: (*db.ModelStatus)(filter.Status), Modality: (*db.ModelModality)(filter.Modality), Vendor: filter.Vendor,
		CursorCreatedAt: pgtime.TimePtrToPgTimestamp(createdAt), CursorID: id, LimitPlusOne: limit + 1,
	})
	if err != nil {
		return pagination.Page[*schema.Model]{}, err
	}
	models, err := catalogue.Present(ctx, h.deps.Queries, user.OrganizationID, rows)
	if err != nil {
		return pagination.Page[*schema.Model]{}, err
	}
	return pagination.BuildPage(models, limit, func(m *schema.Model) pagination.CreatedAtCursor {
		return pagination.CreatedAtCursor{CreatedAt: m.CreatedAt, ID: m.ID}
	})
}
