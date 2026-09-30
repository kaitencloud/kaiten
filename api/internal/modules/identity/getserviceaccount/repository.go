package getserviceaccount

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/schema"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type QueryRepository struct {
	repository *db.Queries
}

func NewQueryRepository(repository *db.Queries) *QueryRepository {
	return &QueryRepository{
		repository: repository,
	}
}

func (r *QueryRepository) GetServiceAccount(ctx context.Context, saSlug string, organizationID uuid.UUID) (*schema.ServiceAccount, error) {
	args := db.GetServiceAccountParams{
		OrganizationID:     organizationID,
		ServiceAccountSlug: &saSlug,
	}

	sa, err := r.repository.GetServiceAccount(ctx, args)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, kaitenerrors.NotFound("ServiceAccount.NotFound", fmt.Sprintf("ServiceAccount with slug %s not found in organization %s", saSlug, organizationID))
		}
		return nil, err
	}

	tokens, err := r.repository.ListTokensForServiceAccount(ctx, db.ListTokensForServiceAccountParams{
		ServiceAccountSlug: sa.Slug,
		OrganizationID:     organizationID,
	})

	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}

	tokenList := make([]schema.Token, 0, len(tokens))
	for _, token := range tokens {
		tokenList = append(tokenList, schema.Token{
			ID:               token.ID,
			Name:             token.Name,
			Slug:             token.Slug,
			Scopes:           token.Scopes,
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

	return &schema.ServiceAccount{
		ID:         sa.ID,
		Name:       sa.Name,
		Slug:       *sa.Slug,
		ExternalID: sa.ExternalID,
		CreatedBy:  shared.NewUser(sa.CreatedByID, sa.CreatedByName),
		CreatedAt:  *pgtime.PgTimeStampToTimePtr(sa.CreatedAt),
		Tokens:     tokenList,
	}, nil
}
