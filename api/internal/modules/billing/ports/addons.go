package ports

import (
	"context"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// BillableAddon is an add-on an instance holds, with the FLAT_FEE price a
// subscription of the given period bills it at.
type BillableAddon struct {
	InstanceAddonID   uuid.UUID
	AddonID           uuid.UUID
	Name              string
	Quantity          int32
	PriceID           uuid.UUID
	BillingTiming     string
	UnitAmountDecimal decimal.Decimal
	Currency          string
	DisplayLabel      string
}

// AddonSource is the add-ons an instance holds, as billing reads them. Every
// method reads in the transaction ctx carries.
type AddonSource interface {
	// BillableAddons reads the add-ons the instance holds now, each with its
	// default ACTIVE FLAT_FEE price for billingPeriod; an add-on without one
	// bills nothing and is left out.
	BillableAddons(ctx context.Context, organizationID, instanceID uuid.UUID, billingPeriod string) ([]BillableAddon, error)
	// Incompatible lists the slugs of the add-ons the instance holds that a
	// move to the licence version, billed on billingPeriod, would strand: not
	// compatible with its family, or without a price for the period.
	Incompatible(ctx context.Context, organizationID, instanceID, licenseID uuid.UUID, billingPeriod string) ([]string, error)
}
