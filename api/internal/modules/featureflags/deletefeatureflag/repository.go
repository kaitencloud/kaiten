package deletefeatureflag

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/infrastructure/dbmap"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
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

func (r *CommandRepository) DeleteFeatureFlag(ctx context.Context, slug string, organizationID uuid.UUID) (*schema.FeatureFlag, error) {
	params := db.DeleteFeatureFlagParams{
		FeatureFlagSlug: slug,
		OrganizationID:  organizationID,
	}

	res, err := r.q(ctx).DeleteFeatureFlag(ctx, params)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, kaitenerrors.NotFound("DeleteFeatureFlag.NotFound", fmt.Sprintf("Feature flag with slug %s and organization %s not found", slug, organizationID))
		}
		// A voucher grants a variant of the flag (V32-03 c): the grant's
		// RESTRICT keeps the flag. Disabling it stays possible.
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.ConstraintName == "voucher_flag_grant_flag_id_fkey" {
			return nil, kaitenerrors.Conflict("DeleteFeatureFlag.InUseConflict",
				fmt.Sprintf("Feature flag %q is granted by a voucher: disable it instead", slug))
		}
		return nil, err
	}

	return dbmap.ToFeatureFlag(res)
}
