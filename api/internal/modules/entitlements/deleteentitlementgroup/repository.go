package deleteentitlementgroup

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/dbmap"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// CommandRepository is bound to a *uow.UnitOfWork instead of a fixed
// *db.Queries.
type CommandRepository struct {
	uof *uow.UnitOfWork
}

// NewCommandRepository creates a new CommandRepository.
func NewCommandRepository(uof *uow.UnitOfWork) *CommandRepository {
	return &CommandRepository{uof: uof}
}

// q resolves the sqlc Queries bound to whatever DBTX is active for
// ctx -- the caller's transaction if Transact opened one, the pool
// otherwise.
func (r *CommandRepository) q(ctx context.Context) *db.Queries {
	return db.New(r.uof.DBTX(ctx))
}

// DeleteEntitlementGroup deletes an entitlement group from the database.
func (r *CommandRepository) DeleteEntitlementGroup(ctx context.Context, organizationID uuid.UUID, slug string) (*schema.EntitlementGroup, error) {
	params := db.DeleteEntitlementGroupParams{
		Slug:           slug,
		OrganizationID: organizationID,
	}

	result, err := r.q(ctx).DeleteEntitlementGroup(ctx, params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.NotFound("DeleteEntitlementGroup.NotFound", fmt.Sprintf("Entitlement group with slug %q not found", slug))
		}
		return nil, err
	}

	return dbmap.ToEntitlementGroup(&result), nil
}
