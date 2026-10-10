package ports

import (
	"context"
	"time"

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

// BillableAttachment is one attachment of an add-on to an instance, active
// during a period: its window, its flat fee, its metered prices.
type BillableAttachment struct {
	InstanceAddonID uuid.UUID
	AddonID         uuid.UUID
	FamilyID        uuid.UUID
	Name            string
	// Quantity is the quantity held, or the last one held before removal.
	Quantity   int32
	AttachedAt time.Time
	RemovedAt  *time.Time
	// Flat is its default ACTIVE FLAT_FEE price for the period; nil when it
	// has none (a FREE add-on, or no price for that period).
	Flat *BillableAddon
	// Metered are its ACTIVE metered prices, each with the entitlement it
	// meters.
	Metered []CataloguePrice
}

// AddonSource is the add-ons an instance holds, as billing reads them. Every
// method reads in the transaction ctx carries.
type AddonSource interface {
	// BillableAddons reads the add-ons the instance holds now, each with its
	// default ACTIVE FLAT_FEE price for billingPeriod; an add-on without one
	// bills nothing and is left out.
	BillableAddons(ctx context.Context, organizationID, instanceID uuid.UUID, billingPeriod string) ([]BillableAddon, error)
	// BillableAttachments reads the instance's attachments active at any
	// time in [from, to), removed ones included, each with its default ACTIVE
	// FLAT_FEE price for billingPeriod and its ACTIVE metered prices: what an
	// arrears period bills of the add-ons (§10.4).
	BillableAttachments(ctx context.Context, organizationID, instanceID uuid.UUID, billingPeriod string, from, to time.Time) ([]BillableAttachment, error)
	// Incompatible lists the slugs of the add-ons the instance holds that a
	// move to the licence version, billed on billingPeriod, would strand: not
	// compatible with its family, or without a price for the period.
	Incompatible(ctx context.Context, organizationID, instanceID, licenseID uuid.UUID, billingPeriod string) ([]string, error)
}
