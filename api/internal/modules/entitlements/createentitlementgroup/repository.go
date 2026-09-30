package createentitlementgroup

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/dbmap"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// CreateEntitlementGroupInput holds the validated input for creating an entitlement group.
type CreateEntitlementGroupInput struct {
	Name        string
	Slug        string
	Description *string
}

// CommandRepository is bound to a *uow.UnitOfWork instead of a fixed
// *db.Queries: build it once (e.g. in NewUseCase) and call its methods
// directly, inside or outside a Transact closure.
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

// CreateEntitlementGroup creates a new entitlement group in the database.
func (r *CommandRepository) CreateEntitlementGroup(ctx context.Context, input CreateEntitlementGroupInput, organizationID uuid.UUID) (*schema.EntitlementGroup, error) {
	params := db.CreateEntitlementGroupParams{
		Name:           input.Name,
		Slug:           input.Slug,
		Description:    input.Description,
		OrganizationID: organizationID,
	}

	group, err := r.q(ctx).CreateEntitlementGroup(ctx, params)
	if err != nil {
		if kaitenerrors.IsUniqueViolation(err) {
			// entitlement_group's only UNIQUE constraint besides the
			// primary key is (organization_id, slug), so any unique
			// violation here is a slug conflict. Wrapping
			// slugutil.ErrConflict lets slugutil.Retry recognize this as
			// retryable when the slug was auto-generated.
			return nil, kaitenerrors.Wrap(slugutil.ErrConflict, kaitenerrors.KindConflict,
				"CreateEntitlementGroup.SlugConflict", fmt.Sprintf("Entitlement group with slug %q already exists in this organization", input.Slug))
		}
		return nil, err
	}

	return dbmap.ToEntitlementGroup(&group), nil
}
