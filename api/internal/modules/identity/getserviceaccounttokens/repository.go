package getserviceaccounttokens

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
)

// ListTokensInput contains parameters for listing tokens.
type ListTokensInput struct {
	ServiceAccountSlug string
	OrganizationID     uuid.UUID
	LimitPlusOne       int32
	Cursor             *pagination.CreatedAtCursor
}

// QueryRepository handles token retrieval operations.
type QueryRepository struct {
	queries *db.Queries
}

// NewQueryRepository creates a new token repository.
func NewQueryRepository(queries *db.Queries) *QueryRepository {
	return &QueryRepository{queries: queries}
}

// ListTokens retrieves a cursor-paginated page of tokens for a service
// account.
func (r *QueryRepository) ListTokens(ctx context.Context, input ListTokensInput) ([]schema.Token, error) {
	var cursorCreatedAt *time.Time
	var cursorID *uuid.UUID
	if input.Cursor != nil {
		cursorCreatedAt = &input.Cursor.CreatedAt
		cursorID = &input.Cursor.ID
	}

	dbTokens, err := r.queries.ListTokensForServiceAccountByCursor(ctx, db.ListTokensForServiceAccountByCursorParams{
		ServiceAccountSlug: &input.ServiceAccountSlug,
		OrganizationID:     input.OrganizationID,
		CursorCreatedAt:    pgtime.TimePtrToPgTimestamp(cursorCreatedAt),
		CursorID:           cursorID,
		LimitPlusOne:       input.LimitPlusOne,
	})
	if err != nil {
		return nil, err
	}

	return toSchemaList(dbTokens), nil
}

func toSchemaList(dbTokens []db.ListTokensForServiceAccountByCursorRow) []schema.Token {
	result := make([]schema.Token, len(dbTokens))
	for i, dbToken := range dbTokens {
		result[i] = toSchema(dbToken)
	}
	return result
}

func toSchema(dbToken db.ListTokensForServiceAccountByCursorRow) schema.Token {
	return schema.Token{
		ID:               dbToken.ID,
		Name:             dbToken.Name,
		Slug:             dbToken.Slug,
		ExpiresAt:        pgtime.PgTimeStampToTimePtr(dbToken.ExpiresAt),
		ServiceAccountID: dbToken.ServiceAccountID,
		Scopes:           dbToken.Scopes,
		CreatedAt:        dbToken.CreatedAt.Time,
		CreatedBy: shared.User{
			ID:   dbToken.CreatedBy,
			Name: dbToken.CreatedByName,
		},
		RevokedAt: pgtime.PgTimeStampToTimePtr(dbToken.RevokedDate),
		RevokedBy: shared.NewUser(
			dbToken.RevokedBy,
			dbToken.RevokedByName,
		),
	}
}
