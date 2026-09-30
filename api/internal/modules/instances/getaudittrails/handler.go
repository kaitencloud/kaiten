package getaudittrails

import (
	"context"
	"time"

	"github.com/kaitencloud/kaiten/api/internal/modules/audittrail/listforinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
type Deps struct {
	UserProvider   currentuser.Provider
	AuditTrailPort *listforinstance.UseCase
}

type UseCase struct {
	deps       Deps
	repository Repository
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{
		deps:       deps,
		repository: NewQueryRepository(deps.AuditTrailPort),
	}
}

func (h *UseCase) Execute(ctx context.Context, instanceSlug string, eventName *string, after, before *string, limit int32, cursor *string) (pagination.Page[*schema.AuditTrail], error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return pagination.Page[*schema.AuditTrail]{}, err
	}

	var afterTime, beforeTime *time.Time
	if after != nil {
		t, err := time.Parse(time.RFC3339, *after)
		if err != nil {
			return pagination.Page[*schema.AuditTrail]{}, err
		}
		afterTime = &t
	}
	if before != nil {
		t, err := time.Parse(time.RFC3339, *before)
		if err != nil {
			return pagination.Page[*schema.AuditTrail]{}, err
		}
		beforeTime = &t
	}

	var cursorKey *pagination.CreatedAtCursor
	if cursor != nil {
		key, err := pagination.Decode[pagination.CreatedAtCursor](*cursor)
		if err != nil {
			return pagination.Page[*schema.AuditTrail]{}, apierrors.Wrap(err, apierrors.KindValidation, "AuditTrails.InvalidCursor", "invalid cursor")
		}
		cursorKey = &key
	}

	limit = pagination.ClampLimit(limit)

	trails, err := h.repository.List(ctx, instanceSlug, user.OrganizationID, eventName, afterTime, beforeTime, limit+1, cursorKey)
	if err != nil {
		return pagination.Page[*schema.AuditTrail]{}, err
	}

	return pagination.BuildPage(trails, limit, func(t *schema.AuditTrail) pagination.CreatedAtCursor {
		return pagination.CreatedAtCursor{CreatedAt: t.Timestamp, ID: t.ID}
	})
}
