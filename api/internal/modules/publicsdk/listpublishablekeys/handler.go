package listpublishablekeys

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/keys"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

type UseCase struct{ deps keys.Deps }

func NewUseCase(deps keys.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute lists the organization's keys, newest first; revoked ones on request.
func (u *UseCase) Execute(ctx context.Context, includeRevoked bool, cursor string, limit int32) (pagination.Page[keys.PublishableKey], error) {
	user, err := u.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return pagination.Page[keys.PublishableKey]{}, err
	}
	page, err := pagination.ParseKeyset(cursor, limit, "PublishableKeys")
	if err != nil {
		return pagination.Page[keys.PublishableKey]{}, err
	}
	rows, err := u.deps.Queries(ctx).ListPublishableKeys(ctx, db.ListPublishableKeysParams{
		OrganizationID: user.OrganizationID, IncludeRevoked: includeRevoked,
		CursorAt: page.CursorAt, CursorID: page.CursorID, RowLimit: page.RowLimit,
	})
	if err != nil {
		return pagination.Page[keys.PublishableKey]{}, err
	}
	out := make([]keys.PublishableKey, 0, len(rows))
	for _, row := range rows {
		out = append(out, keys.FromRow(row.ID, row.Label, row.KeyHint, row.AllowedOrigins,
			row.LastUsedAt, row.CreatedAt, row.UpdatedAt, row.RevokedAt))
	}
	return pagination.KeysetPage(out, page, func(k keys.PublishableKey) (time.Time, uuid.UUID) { return k.CreatedAt, k.ID })
}
