package ports

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
)

// CataloguePrice is a licence price with the version it belongs to and, for a
// metered price, the entitlement it meters.
type CataloguePrice struct {
	prices.Price
	LicenseID       uuid.UUID
	LicenseSlug     string
	LicenseName     string
	LicenseState    string
	EntitlementID   *uuid.UUID
	EntitlementName string
}

// CatalogueSource is the licence catalogue as billing reads it. Every method
// reads in the transaction ctx carries.
type CatalogueSource interface {
	// Price reads one price of the organization, or nil when it has none of
	// that id.
	Price(ctx context.Context, organizationID, priceID uuid.UUID) (*CataloguePrice, error)
	// MeteredPrices reads the ACTIVE metered prices of a licence version, in
	// display order.
	MeteredPrices(ctx context.Context, organizationID, licenseID uuid.UUID) ([]CataloguePrice, error)
}
