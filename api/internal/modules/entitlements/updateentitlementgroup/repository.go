package updateentitlementgroup

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

// UpdateEntitlementGroupInput holds the validated input for updating an entitlement group.
type UpdateEntitlementGroupInput struct {
	Name        string
	Description *string
}

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

// UpdateEntitlementGroup updates an entitlement group in the database.
func (r *CommandRepository) UpdateEntitlementGroup(ctx context.Context, input UpdateEntitlementGroupInput, slug string, organizationID uuid.UUID) (*schema.EntitlementGroup, error) {
	params := db.UpdateEntitlementGroupParams{
		Name:           input.Name,
		Description:    input.Description,
		Slug:           slug,
		OrganizationID: organizationID,
	}

	result, err := r.q(ctx).UpdateEntitlementGroup(ctx, params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.NotFound("UpdateEntitlementGroup.NotFound", fmt.Sprintf("Entitlement group with slug %q not found", slug))
		}
		return nil, err
	}

	return dbmap.ToEntitlementGroup(&result), nil
}
