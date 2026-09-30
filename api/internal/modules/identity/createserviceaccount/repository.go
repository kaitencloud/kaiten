package createserviceaccount

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// The "user" table (which service accounts live in) carries several UNIQUE
// constraints besides its primary key: external_id, email, and this
// partial index on (slug, organization_id) for type='machine' rows -- see
// the initial migration. Only the slug index is a slug conflict --
// discriminating by constraint name keeps the other two from being
// mislabeled (and from being retried with a new slug, which would never
// fix a duplicate external ID).
const serviceAccountSlugConstraint = "idx_unique_machine_slug_per_org"

type CommandRepository struct {
	uof *uow.UnitOfWork
}

func NewCommandRepository(uof *uow.UnitOfWork) *CommandRepository {
	return &CommandRepository{uof: uof}
}

// q resolves the sqlc Queries bound to whatever DBTX is active for
// ctx -- the caller's transaction if Transact opened one, the pool
// otherwise.
func (r *CommandRepository) q(ctx context.Context) *db.Queries {
	return db.New(r.uof.DBTX(ctx))
}

func (r *CommandRepository) CreateServiceAccount(ctx context.Context, name string, slug string, creatorID uuid.UUID, saExternalID string, organizationID uuid.UUID) (*db.CreateServiceAccountRow, error) {
	params := db.CreateServiceAccountParams{
		Name:           name,
		Slug:           &slug,
		CreatorID:      creatorID,
		ExternalID:     saExternalID,
		OrganizationID: &organizationID,
	}

	user, err := r.q(ctx).CreateServiceAccount(ctx, params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.NotFound(
				"CreateServiceAccount.CreatorNotFound",
				fmt.Sprintf("Creator with ID %s was not found", creatorID),
			)
		}
		if kaitenerrors.IsUniqueViolationOnConstraint(err, serviceAccountSlugConstraint) {
			return nil, kaitenerrors.Wrap(
				slugutil.ErrConflict, kaitenerrors.KindConflict,
				"CreateServiceAccount.SlugConflict",
				fmt.Sprintf("Service account with slug %q already exists in this organization", slug),
			)
		}
		if kaitenerrors.IsUniqueViolation(err) {
			return nil, kaitenerrors.Conflict(
				"CreateServiceAccount.Conflict",
				fmt.Sprintf("Service account %q could not be created due to a conflicting record", name),
			)
		}
		return nil, err
	}

	return &user, nil
}
