package validateplatformtoken

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/shared/token"
)

// Repository is the one lookup this use case needs.
type Repository interface {
	ValidatePlatformToken(ctx context.Context, plainToken string) (*Credential, error)
}

// Credential is a verified ksm_ credential.
type Credential struct {
	// TokenID is the credential's own row id, which becomes the principal's
	// PlatformTokenID.
	TokenID uuid.UUID
	Scopes  []string
	// ExpiresAt is nil for a credential that does not expire. It bounds how long a
	// cache entry may be served, and is re-checked on every hit.
	ExpiresAt *time.Time
}

type repository struct {
	queries *db.Queries
}

// NewRepository creates the lookup this use case reads through.
func NewRepository(queries *db.Queries) Repository {
	return &repository{queries: queries}
}

// ValidatePlatformToken resolves a ksm_ credential to its row.
//
// GetActivePlatformTokenByLookupHash, deliberately, and not the organization
// query with a parameter: that one joins organization, and the join is exactly
// what would let a platform credential acquire one. Two queries with a kind filter
// each means no call site can be talked into resolving the wrong family.
func (r *repository) ValidatePlatformToken(ctx context.Context, plainToken string) (*Credential, error) {
	lookupHash := token.LookupHash(plainToken)

	dbToken, err := r.queries.GetActivePlatformTokenByLookupHash(ctx, lookupHash)
	if err != nil {
		return nil, fmt.Errorf("platform token not found or invalid: %w", err)
	}

	// The lookup hash narrows; bcrypt decides. It is the slow half, and the reason
	// this use case caches at all.
	if err := token.Compare(dbToken.Hash, plainToken); err != nil {
		return nil, fmt.Errorf("platform token hash mismatch: %w", err)
	}

	return &Credential{
		TokenID:   dbToken.ID,
		Scopes:    dbToken.Scopes,
		ExpiresAt: pgtime.PgTimeStampToTimePtr(dbToken.ExpiresAt),
	}, nil
}
