package deletetokenonserviceaccount

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/identity/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// CommandRepository handles token revocation operations.
type CommandRepository struct {
	queries *db.Queries
}

// NewCommandRepository creates a new token repository.
func NewCommandRepository(queries *db.Queries) *CommandRepository {
	return &CommandRepository{queries: queries}
}

// RevokeToken revokes a token in the database and returns its lookup hash for cache invalidation.
func (r *CommandRepository) RevokeToken(ctx context.Context, serviceAccountSlug, tokenSlug string, revokerID, organizationID uuid.UUID) (string, error) {
	row, err := r.queries.RevokeToken(ctx, db.RevokeTokenParams{
		ServiceAccountSlug: &serviceAccountSlug,
		TokenSlug:          tokenSlug,
		RevokerID:          revokerID,
		OrganizationID:     organizationID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", kaitenerrors.NotFound("Token.NotFound", fmt.Sprintf("Token with slug %s not found for service account %s or already revoked", tokenSlug, serviceAccountSlug))
		}
		return "", fmt.Errorf("revoke token: %w", err)
	}

	return row.LookupHash, nil
}
