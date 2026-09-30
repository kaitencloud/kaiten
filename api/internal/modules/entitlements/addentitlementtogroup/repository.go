package addentitlementtogroup

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// CommandRepository is bound to a *uow.UnitOfWork instead of a fixed
// *db.Queries: build it once (e.g. in NewUseCase) and call its methods
// directly, inside or outside a Transact closure. Each call resolves the
// DBTX active for ctx, so it joins whatever transaction Transact opened for
// that ctx, with no db.New(...) at the call site.
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

// AddEntitlementToGroup adds an entitlement to a group.
func (r *CommandRepository) AddEntitlementToGroup(ctx context.Context, groupSlug string, entitlementSlug string, organizationID uuid.UUID) (*db.EntitlementGroupMembership, error) {
	params := db.AddEntitlementToGroupParams{
		GroupSlug:       groupSlug,
		EntitlementSlug: entitlementSlug,
		OrganizationID:  organizationID,
	}

	membership, err := r.q(ctx).AddEntitlementToGroup(ctx, params)
	if err != nil {
		if kaitenerrors.IsUniqueViolation(err) {
			return nil, kaitenerrors.Conflict("AddEntitlementToGroup.AlreadyMember", fmt.Sprintf("Entitlement %q is already a member of group %q", entitlementSlug, groupSlug))
		}
		return nil, err
	}

	return &membership, nil
}
