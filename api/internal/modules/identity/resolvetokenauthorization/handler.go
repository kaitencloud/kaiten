// Package resolvetokenauthorization fetches live machine credential grants, never JWT grants.
package resolvetokenauthorization

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/identity/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type UseCase struct{ queries *db.Queries }

func NewUseCase(queries *db.Queries) *UseCase { return &UseCase{queries: queries} }
func (u *UseCase) Resolve(ctx context.Context, tokenID uuid.UUID, subject, externalOrgID string) (uuid.UUID, uuid.UUID, []string, error) {
	row, err := u.queries.ResolveOrganizationTokenAuthorization(ctx, db.ResolveOrganizationTokenAuthorizationParams{TokenID: tokenID, Subject: subject, ExternalOrganizationID: externalOrgID})
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, uuid.Nil, nil, apierrors.Unauthorized("Auth.InvalidOrganizationToken", "Invalid organization credential")
	}
	return row.UserID, row.OrganizationID, row.Scopes, err
}
