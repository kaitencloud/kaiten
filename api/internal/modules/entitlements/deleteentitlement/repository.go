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

// errInUse is a delete the entitlement's references refused.
var errInUse = errors.New("entitlement is still referenced")

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
	queries := r.q(ctx)

	// A source is refused here, not by a foreign key: the link rows cascade, so
	// that deleting an organization, which cascades row by row, cannot fail on
	// the source of a combined entitlement that is stored after it. The row is
	// locked first, so that a combined entitlement that is storing a link to it
	// is waited for and seen.
	locked, err := queries.LockEntitlementForUpdate(ctx, db.LockEntitlementForUpdateParams{OrganizationID: organizationID, Slug: slug})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.NotFound("DeleteEntitlement.NotFound", fmt.Sprintf("Entitlement with slug %q not found", slug))
		}
		return nil, err
	}
	combinedOf, err := queries.ListCombinedOfSource(ctx, db.ListCombinedOfSourceParams{OrganizationID: organizationID, SourceSlug: slug})
	if err != nil {
		return nil, err
	}
	if len(combinedOf) > 0 {
		return nil, errInUse
	}

	// What a combined entitlement sums goes with it: its event still says.
	var sources []db.ListCombinedSourcesRow
	if locked.UsageSource == db.EntitlementUsageSourceCOMBINEDUSAGE {
		if sources, err = queries.ListCombinedSources(ctx, db.ListCombinedSourcesParams{OrganizationID: organizationID, CombinedSlug: &slug}); err != nil {
			return nil, err
		}
	}

	params := db.DeleteEntitlementParams{
		Slug:           slug,
		OrganizationID: organizationID,
	}

	result, err := queries.DeleteEntitlement(ctx, params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.NotFound("DeleteEntitlement.NotFound", fmt.Sprintf("Entitlement with slug %q not found", slug))
		}
		// A licence or add-on grant, a licence or add-on price -- deprecated or
		// not: a price that may have billed is never deleted, so neither is what
		// it measured -- or a voucher boost still holds it. Its usage does not: that follows the entitlement out
		// (see 20261012000000_entitlement_usage_follows_its_entitlement.sql).
		// The handler counts what holds it once the transaction is gone.
		if kaitenerrors.IsForeignKeyViolation(err) {
			return nil, errInUse
		}
		return nil, err
	}

	deleted := dbmap.ToEntitlement(&result)
	if len(sources) > 0 {
		deleted.Sources = dbmap.ToEntitlementSources(sources)
	}

	return deleted, nil
}
