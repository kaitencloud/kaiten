package previewlicenseinvoice

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/effective"
)

// Sources are what a preview reads of the other modules (§8.9): the add-ons
// it lists, the instance whose usage it rates, the voucher it applies. The
// composition root wires the billing module's implementation; without one, a
// preview takes a sample only.
type Sources interface {
	// Addon reads an add-on version by slug: its grants, its default ACTIVE
	// FLAT_FEE price for the period in currency, and its ACTIVE metered prices
	// in currency. nil when the organization has none of that slug.
	Addon(ctx context.Context, organizationID uuid.UUID, slug, billingPeriod, currency string) (*Addon, error)
	// Instance reads an instance by slug; nil when the organization has none.
	Instance(ctx context.Context, organizationID uuid.UUID, slug string) (*Instance, error)
	// Measure measures a pair of the instance's usage journal over [from, to).
	Measure(ctx context.Context, organizationID, instanceID, entitlementID uuid.UUID, from, to time.Time) (rating.Measure, error)
	// RetentionStart is where the organization's usage history starts; nil
	// when it keeps everything.
	RetentionStart(ctx context.Context, organizationID uuid.UUID, now time.Time) *time.Time
	// Discount is the discount a redemption of the code would apply. found is
	// false when no voucher has the code; the discount is nil when its
	// voucher is not an ACTIVE PRICE voucher.
	Discount(ctx context.Context, organizationID uuid.UUID, code string) (discount *rating.Discount, found bool, err error)
}

// Addon is an add-on version a preview lists.
type Addon struct {
	ID     uuid.UUID
	Name   string
	Grants []AddonGrant
	// Flat is its fee for the period; nil when it has none.
	Flat    *rating.Price
	Metered []rating.Price
}

// AddonGrant is one entitlement an add-on grants, by entitlement id.
type AddonGrant struct {
	EntitlementID uuid.UUID
	Grant         effective.AddonGrant
}

// Instance is the instance whose usage a preview rates, and P0 of its live
// subscription's period; nil without one.
type Instance struct {
	ID          uuid.UUID
	PeriodStart *time.Time
}
