package validatetoken

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/shared/token"
)

type Repository interface {
	ValidateToken(ctx context.Context, plainToken string) (*TokenData, error)
}

// TokenData represents validated token information.
type TokenData struct {
	SubjectID      uuid.UUID
	OrganizationID uuid.UUID
	Scopes         []string
	// ExpiresAt is the credential's own expiry, nil for a credential that does
	// not expire. It bounds the internal JWT minted from it and is re-checked on
	// a cache hit -- without it a TTL shorter than the JWT lifetime would be
	// decorative.
	ExpiresAt              *time.Time
	SubjectExternalID      string
	OrganizationExternalID string
}

type repository struct {
	queries *db.Queries
}

// NewRepository creates a new validation repository.
func NewRepository(queries *db.Queries) Repository {
	return &repository{queries: queries}
}

// ValidateToken validates a token and returns its data.
func (r *repository) ValidateToken(ctx context.Context, plainToken string) (*TokenData, error) {
	// Generate lookup hash for database query
	lookupHash := token.LookupHash(plainToken)

	// Query for active token
	dbToken, err := r.queries.GetActiveTokenByLookupHash(ctx, lookupHash)
	if err != nil {
		return nil, fmt.Errorf("token not found or invalid: %w", err)
	}

	// Verify the full token hash
	if err := token.Compare(dbToken.Hash, plainToken); err != nil {
		return nil, fmt.Errorf("token hash mismatch: %w", err)
	}

	return &TokenData{
		SubjectID:              dbToken.ServiceAccountID,
		OrganizationID:         dbToken.OrganizationID,
		Scopes:                 dbToken.Scopes,
		ExpiresAt:              pgtime.PgTimeStampToTimePtr(dbToken.ExpiresAt),
		SubjectExternalID:      dbToken.ServiceAccountExternalID,
		OrganizationExternalID: dbToken.OrganizationExternalID,
	}, nil
}
