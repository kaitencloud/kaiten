// Package licenseview is the entitlements module's public read port for
// the licenses module: resolving an entitlement by slug (to validate a
// license<->entitlement association's value against its declared type),
// and listing the entitlement groups a license's entitlements belong to.
// Consumed instead of licenses reaching into this module's own generated
// db package directly.
package licenseview

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/dbmap"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
)

// Entitlement is the subset of entitlement fields licenses needs to
// validate a license<->entitlement association.
type Entitlement struct {
	ID   uuid.UUID
	Slug string
	Type schema.Type
}

// GroupRef names one entitlement group an entitlement (identified by slug)
// belongs to.
type GroupRef struct {
	ID              uuid.UUID
	Name            string
	Slug            string
	EntitlementSlug string
}

type Port interface {
	GetBySlug(ctx context.Context, organizationID uuid.UUID, slug string) (*Entitlement, error)
	GetGroupRefsForLicense(ctx context.Context, organizationID, licenseID uuid.UUID) ([]GroupRef, error)
}

type port struct {
	queries *db.Queries
}

// New builds a Port bound to dbtx. Pass a *pgxpool.Pool for a read that
// never needs to join a caller's transaction, or the caller's own
// uow.UnitOfWork.DBTX(ctx) from inside a Transact call so these reads join
// that transaction (see uow.UnitOfWork.Transact's doc comment) -- required
// whenever this port is used alongside another write on the same
// transaction, since a second, pool-bound connection acquired while the
// first is still held deadlocks the pool under concurrent load.
func New(dbtx uow.DBTX) Port {
	return &port{queries: db.New(dbtx)}
}

func (p *port) GetBySlug(ctx context.Context, organizationID uuid.UUID, slug string) (*Entitlement, error) {
	row, err := p.queries.GetEntitlement(ctx, db.GetEntitlementParams{
		OrganizationID: organizationID,
		Slug:           slug,
	})
	if err != nil {
		return nil, err
	}
	entitlementType, err := dbmap.ToEntitlementType(row.Type)
	if err != nil {
		return nil, err
	}
	return &Entitlement{
		ID:   row.ID,
		Slug: row.Slug,
		Type: entitlementType,
	}, nil
}

func (p *port) GetGroupRefsForLicense(ctx context.Context, organizationID, licenseID uuid.UUID) ([]GroupRef, error) {
	rows, err := p.queries.GetEntitlementGroupsForLicense(ctx, db.GetEntitlementGroupsForLicenseParams{
		OrganizationID: organizationID,
		LicenseID:      licenseID,
	})
	if err != nil {
		return nil, err
	}
	refs := make([]GroupRef, len(rows))
	for i, row := range rows {
		refs[i] = GroupRef{ID: row.ID, Name: row.Name, Slug: row.Slug, EntitlementSlug: row.EntitlementSlug}
	}
	return refs, nil
}
