// Package billablecatalogue is the licence catalogue as the billing module
// reads it: the licenses module's implementation of billing's
// ports.CatalogueSource. It reads in the caller's transaction, so a
// subscription and the prices it pins are read in one snapshot.
package billablecatalogue

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/ports"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
)

// Source implements ports.CatalogueSource.
type Source struct {
	uof *uow.UnitOfWork
}

var _ ports.CatalogueSource = (*Source)(nil)

func New(uof *uow.UnitOfWork) *Source { return &Source{uof: uof} }

func (s *Source) queries(ctx context.Context) *db.Queries { return db.New(s.uof.DBTX(ctx)) }

// Price reads one price with its version.
func (s *Source) Price(ctx context.Context, organizationID, priceID uuid.UUID) (*ports.CataloguePrice, error) {
	q := s.queries(ctx)
	version, err := q.GetPriceVersion(ctx, db.GetPriceVersionParams{OrganizationID: organizationID, ID: priceID})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	price, err := prices.Get(ctx, q, organizationID, version.ID, priceID)
	if err != nil || price == nil {
		return nil, err
	}
	out := &ports.CataloguePrice{
		Price: *price, LicenseID: version.ID, LicenseSlug: version.Slug, LicenseName: version.Name,
		LicenseState: string(version.LifecycleState), EntitlementID: nil, EntitlementName: "",
	}
	if price.Metered != nil {
		grants, err := q.ListMeteredGrants(ctx, db.ListMeteredGrantsParams{OrganizationID: organizationID, LicenseID: version.ID})
		if err != nil {
			return nil, err
		}
		for _, g := range grants {
			if g.Slug == price.Metered.EntitlementSlug {
				id := g.ID
				out.EntitlementID, out.EntitlementName = &id, g.Name
			}
		}
	}
	return out, nil
}

// MeteredPrices reads a version's ACTIVE metered prices with the entitlement
// each meters.
func (s *Source) MeteredPrices(ctx context.Context, organizationID, licenseID uuid.UUID) ([]ports.CataloguePrice, error) {
	q := s.queries(ctx)
	active, err := prices.List(ctx, q, organizationID, licenseID, prices.StatusActive, "")
	if err != nil {
		return nil, err
	}
	grants, err := q.ListMeteredGrants(ctx, db.ListMeteredGrantsParams{OrganizationID: organizationID, LicenseID: licenseID})
	if err != nil {
		return nil, err
	}
	bySlug := make(map[string]db.ListMeteredGrantsRow, len(grants))
	for _, g := range grants {
		bySlug[g.Slug] = g
	}
	var out []ports.CataloguePrice
	for _, price := range active {
		if price.Metered == nil {
			continue
		}
		grant, ok := bySlug[price.Metered.EntitlementSlug]
		if !ok {
			continue
		}
		id := grant.ID
		out = append(out, ports.CataloguePrice{
			Price: price, LicenseID: licenseID, LicenseSlug: "", LicenseName: "", LicenseState: "",
			EntitlementID: &id, EntitlementName: grant.Name,
		})
	}
	return out, nil
}
