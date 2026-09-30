package createtokenonserviceaccount

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// token carries three UNIQUE constraints besides its primary key: hash,
// this slug constraint, and a separate one on
// (service_account_id, name, organization_id) -- see the initial
// migration. Only tokenSlugConstraint is a slug conflict --
// discriminating by constraint name keeps the other two from being
// mislabeled (and from being retried with a new slug, which would never
// fix a hash or name collision).
const tokenSlugConstraint = "token_slug"

// CreateTokenInput contains parameters for token creation.
type CreateTokenInput struct {
	ServiceAccountSlug string
	CreatedByID        uuid.UUID
	OrganizationID     uuid.UUID
	Scopes             []string
	Name               string
	Slug               string
	Hash               string
	LookupHash         string
	ExpiresAt          *time.Time
}

// CommandRepository handles token persistence operations.
type CommandRepository struct {
	queries *db.Queries
}

// NewCommandRepository creates a new token repository.
func NewCommandRepository(queries *db.Queries) *CommandRepository {
	return &CommandRepository{queries: queries}
}

// CreateToken creates a new token in the database.
func (r *CommandRepository) CreateToken(ctx context.Context, input CreateTokenInput) (*schema.Token, error) {
	params := db.CreateTokenParams{
		Hash:               input.Hash,
		LookupHash:         input.LookupHash,
		ServiceAccountSlug: &input.ServiceAccountSlug,
		CreatorID:          input.CreatedByID,
		OrganizationID:     input.OrganizationID,
		Scopes:             input.Scopes,
		ExpiresAt:          pgtime.TimePtrToPgTimestamp(input.ExpiresAt),
		Name:               input.Name,
		Slug:               input.Slug,
	}

	dbToken, err := r.queries.CreateToken(ctx, params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.NotFound(
				"CreateToken.ServiceAccountNotFound",
				fmt.Sprintf("Service account with slug %q not found in organization %s", input.ServiceAccountSlug, input.OrganizationID),
			)
		}
		if kaitenerrors.IsUniqueViolationOnConstraint(err, tokenSlugConstraint) {
			return nil, kaitenerrors.Wrap(
				slugutil.ErrConflict, kaitenerrors.KindConflict,
				"CreateToken.SlugConflict",
				fmt.Sprintf("Token with slug %q already exists for this service account", input.Slug),
			)
		}
		if kaitenerrors.IsUniqueViolation(err) {
			return nil, kaitenerrors.Conflict(
				"CreateToken.Conflict",
				fmt.Sprintf("Token %q could not be created due to a conflicting record", input.Name),
			)
		}
		return nil, err
	}

	return toSchema(dbToken), nil
}

func toSchema(dbToken db.CreateTokenRow) *schema.Token {
	return &schema.Token{
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
	}
}
