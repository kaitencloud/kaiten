package ports

import (
	"context"
	"encoding/json"
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
	// PeriodMaxQuantity is the highest quantity it held since the last
	// composed boundary, and IncreaseBilling how its family bills an
	// increase, TRUE_UP or NEXT_BOUNDARY (V31-70).
	PeriodMaxQuantity int32
	IncreaseBilling   string
	// Flat is its default ACTIVE FLAT_FEE price for the period; nil when it
	// has none (a FREE add-on, or no price for that period).
	Flat *BillableAddon
	// Metered are its ACTIVE metered prices, each with the entitlement it
	// meters.
	Metered []CataloguePrice
}

// AddonGrantRef is one entitlement an add-on version grants.
type AddonGrantRef struct {
	EntitlementID uuid.UUID
	Behavior      string
	Value         json.RawMessage
	Pct           *int16
}

// PreviewAddon is an add-on version a preview lists (§8.9).
type PreviewAddon struct {
	AddonID uuid.UUID
	Name    string
	Grants  []AddonGrantRef
	// Flat is its default ACTIVE FLAT_FEE price for the period, its Quantity
	// 0; nil when it has none.
	Flat    *BillableAddon
	Metered []CataloguePrice
}

// InvalidHeldAddon is a held add-on a subscription could not bill, and why:
// DRAFT, NO_PRICE_FOR_PERIOD or CURRENCY_MISMATCH.
type InvalidHeldAddon struct {
	Slug   string
	Reason string
}

// AddonSource is the add-ons an instance holds, as billing reads them. Every
// method reads in the transaction ctx carries.
type AddonSource interface {
	// BillableAddons reads the add-ons the instance holds now, each with its
	// default ACTIVE FLAT_FEE price for billingPeriod; an add-on without one
	// bills nothing and is left out.
	BillableAddons(ctx context.Context, organizationID, instanceID uuid.UUID, billingPeriod string) ([]BillableAddon, error)
	// InvalidHeldAddons reads the add-ons the instance already holds that a
	// subscription in currency on billingPeriod could not bill (V31-13):
	// DRAFT, or PAID without a default ACTIVE price for the period or with one
	// in another currency. A held ARCHIVED add-on is never among them.
	InvalidHeldAddons(ctx context.Context, organizationID, instanceID uuid.UUID, billingPeriod, currency string) ([]InvalidHeldAddon, error)
	// BillableAttachments reads the instance's attachments active at any
	// time in [from, to), removed ones included, each with its default ACTIVE
	// FLAT_FEE price for billingPeriod and its ACTIVE metered prices: what an
	// arrears period bills of the add-ons (§10.4).
	BillableAttachments(ctx context.Context, organizationID, instanceID uuid.UUID, billingPeriod string, from, to time.Time) ([]BillableAttachment, error)
	// PreviewAddon reads an add-on version by slug as a preview prices it
	// (§8.9): its grants, its default ACTIVE FLAT_FEE price for
	// billingPeriod and its ACTIVE metered prices; nil when the organization
	// has none of that slug.
	PreviewAddon(ctx context.Context, organizationID uuid.UUID, slug, billingPeriod string) (*PreviewAddon, error)
	// Incompatible lists the slugs of the add-ons the instance holds that a
	// move to the licence version, billed on billingPeriod, would strand: not
	// compatible with its family, or without a price for the period.
	Incompatible(ctx context.Context, organizationID, instanceID, licenseID uuid.UUID, billingPeriod string) ([]string, error)
	// MeteredConflicts lists the entitlements an ACTIVE metered price of the
	// licence version meters that an ACTIVE price of an add-on the instance
	// holds meters already, each with that add-on: one entitlement is billed
	// by one price (§8.2 rule 3).
	MeteredConflicts(ctx context.Context, organizationID, instanceID, licenseID uuid.UUID) ([]MeteredConflict, error)
}

// MeteredConflict is an entitlement two prices would meter: the licence
// version's and the held add-on's.
type MeteredConflict struct {
	EntitlementSlug string
	AddonSlug       string
}
