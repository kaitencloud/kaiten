package deleteentitlement

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

func (r *CommandRepository) DeleteEntitlement(ctx context.Context, organizationID uuid.UUID, slug string) (*schema.Entitlement, error) {
	params := db.DeleteEntitlementParams{
		Slug:           slug,
		OrganizationID: organizationID,
	}

	result, err := r.q(ctx).DeleteEntitlement(ctx, params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.NotFound("DeleteEntitlement.NotFound", fmt.Sprintf("Entitlement with slug %q not found", slug))
		}
		// license_entitlement references entitlement with ON DELETE RESTRICT,
		// so an entitlement a licence still grants fails here. Its usage does
		// not: that follows the entitlement out (see
		// 20261012000000_entitlement_usage_follows_its_entitlement.sql).
		if kaitenerrors.IsForeignKeyViolation(err) {
			return nil, kaitenerrors.Conflict(
				"DeleteEntitlement.InUseConflict",
				fmt.Sprintf("Entitlement with slug %q is still granted by a license and cannot be deleted", slug),
			)
		}
		return nil, err
	}

	return dbmap.ToEntitlement(&result), nil
}
