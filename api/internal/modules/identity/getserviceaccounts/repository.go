package getserviceaccounts

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
)

type QueryRepository struct {
	repository *db.Queries
}

func NewQueryRepository(repository *db.Queries) *QueryRepository {
	return &QueryRepository{
		repository: repository,
	}
}

func (r *QueryRepository) GetServiceAccounts(ctx context.Context, organizationID uuid.UUID, limitPlusOne int32, cursor *pagination.CreatedAtCursor) ([]*schema.ServiceAccount, error) {
	var cursorCreatedAt *time.Time
	var cursorID *uuid.UUID
	if cursor != nil {
		cursorCreatedAt = &cursor.CreatedAt
		cursorID = &cursor.ID
	}

	sas, err := r.repository.GetServiceAccounts(ctx, db.GetServiceAccountsParams{
		OrganizationID:  organizationID,
		CursorCreatedAt: pgtime.TimePtrToPgTimestamp(cursorCreatedAt),
		CursorID:        cursorID,
		LimitPlusOne:    limitPlusOne,
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return []*schema.ServiceAccount{}, nil
		}
		return nil, err
	}

	if len(sas) == 0 {
		return []*schema.ServiceAccount{}, nil
	}

	// Extract service account slugs for token query
	serviceAccountSlugs := make([]string, len(sas))
	for i, sa := range sas {
		serviceAccountSlugs[i] = *sa.Slug
	}

	// Fetch all tokens for all service accounts
	tokens, err := r.repository.ListTokensForServiceAccounts(ctx, db.ListTokensForServiceAccountsParams{
		ServiceAccountSlugs: serviceAccountSlugs,
		OrganizationID:      organizationID,
	})

	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}

	// Group tokens by service account ID
	tokensByServiceAccount := make(map[uuid.UUID][]schema.Token)
	for _, token := range tokens {
		saID := token.ServiceAccountID

		// Convert TokenScope[] to string[]
		scopes := make([]string, len(token.Scopes))
		for i, scope := range token.Scopes {
			scopes[i] = string(scope)
		}

		tokensByServiceAccount[saID] = append(tokensByServiceAccount[saID], schema.Token{
			ID:               token.ID,
			Name:             token.Name,
			Slug:             token.Slug,
			Scopes:           scopes,
			ServiceAccountID: token.ServiceAccountID,
			ExpiresAt:        pgtime.PgTimeStampToTimePtr(token.ExpiresAt),
			CreatedAt:        token.CreatedAt.Time,
			CreatedBy: shared.User{
				ID:   token.CreatedBy,
				Name: token.CreatedByName,
			},
			RevokedAt: pgtime.PgTimeStampToTimePtr(token.RevokedDate),
			RevokedBy: shared.NewUser(
				token.RevokedBy,
				token.RevokedByName,
			),
		})
	}

	// Build service accounts with their tokens
	serviceAccounts := make([]*schema.ServiceAccount, 0, len(sas))
	for _, sa := range sas {
		tokens := tokensByServiceAccount[sa.ID]
		if tokens == nil {
			tokens = []schema.Token{}
		}

		var saSlug string
		if sa.Slug != nil {
			saSlug = *sa.Slug
		}
		serviceAccounts = append(serviceAccounts, &schema.ServiceAccount{
			ID:         sa.ID,
			Name:       sa.Name,
			Slug:       saSlug,
			ExternalID: sa.ExternalID,
			CreatedBy:  shared.NewUser(sa.CreatedByID, sa.CreatedByName),
			CreatedAt:  *pgtime.PgTimeStampToTimePtr(sa.CreatedAt),
			Tokens:     tokens,
		})
	}

	return serviceAccounts, nil
}
