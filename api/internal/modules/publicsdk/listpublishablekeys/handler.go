package listpublishablekeys

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/keys"
)

type UseCase struct{ deps keys.Deps }

func NewUseCase(deps keys.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute lists the organization's keys, newest first; revoked ones on request.
func (u *UseCase) Execute(ctx context.Context, includeRevoked bool) ([]keys.PublishableKey, error) {
	user, err := u.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}
	rows, err := u.deps.Queries(ctx).ListPublishableKeys(ctx, db.ListPublishableKeysParams{
		OrganizationID: user.OrganizationID,
		IncludeRevoked: includeRevoked,
	})
	if err != nil {
		return nil, err
	}
	out := make([]keys.PublishableKey, 0, len(rows))
	for _, row := range rows {
		out = append(out, keys.FromRow(row.ID, row.Label, row.KeyHint, row.AllowedOrigins,
			row.LastUsedAt, row.CreatedAt, row.UpdatedAt, row.RevokedAt))
	}
	return out, nil
}
