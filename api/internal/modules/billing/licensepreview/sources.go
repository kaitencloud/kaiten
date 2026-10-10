// Package licensepreview is what a licence invoice preview reads of billing
// (§8.9): the add-ons it lists, the instance whose usage it rates, the
// voucher it applies. It implements the licences module's
// previewlicenseinvoice.Sources over billing's own ports.
package licensepreview

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/metering"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/ports"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscriptions"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/effective"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/previewlicenseinvoice"
)

// Sources implements previewlicenseinvoice.Sources.
type Sources struct{ deps access.Deps }

// New returns the preview's sources over billing's ports.
func New(deps access.Deps) *Sources { return &Sources{deps: deps} }

var _ previewlicenseinvoice.Sources = (*Sources)(nil)

// Addon implements previewlicenseinvoice.Sources.
func (s *Sources) Addon(ctx context.Context, organizationID uuid.UUID, slug, billingPeriod, currency string) (*previewlicenseinvoice.Addon, error) {
	if s.deps.Addons == nil {
		return nil, nil
	}
	addon, err := s.deps.Addons.PreviewAddon(ctx, organizationID, slug, billingPeriod)
	if err != nil || addon == nil {
		return nil, err
	}
	out := &previewlicenseinvoice.Addon{ID: addon.AddonID, Name: addon.Name, Grants: nil, Flat: nil, Metered: nil}
	if addon.Flat != nil {
		if charges := metering.Addons([]ports.BillableAddon{*addon.Flat}, currency); len(charges) == 1 {
			out.Flat = &charges[0].Price
		}
	}
	for _, price := range addon.Metered {
		if price.Currency == currency && price.EntitlementID != nil {
			out.Metered = append(out.Metered, metering.Price(price))
		}
	}
	for _, grant := range addon.Grants {
		out.Grants = append(out.Grants, previewlicenseinvoice.AddonGrant{
			EntitlementID: grant.EntitlementID,
			Grant: effective.AddonGrant{
				ID: uuid.New(), AttachedAt: time.Time{}, Quantity: 1, Behavior: grant.Behavior, Value: grant.Value, Pct: grant.Pct,
			},
		})
	}
	return out, nil
}

// Instance implements previewlicenseinvoice.Sources.
func (s *Sources) Instance(ctx context.Context, organizationID uuid.UUID, slug string) (*previewlicenseinvoice.Instance, error) {
	q := s.deps.Queries(ctx)
	instance, err := q.GetInstanceBySlug(ctx, db.GetInstanceBySlugParams{OrganizationID: organizationID, Slug: slug})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	out := &previewlicenseinvoice.Instance{ID: instance.ID, PeriodStart: nil}
	sub, err := q.GetInstanceBilling(ctx, db.GetInstanceBillingParams{OrganizationID: organizationID, InstanceID: &instance.ID})
	if errors.Is(err, pgx.ErrNoRows) {
		return out, nil
	}
	if err != nil {
		return nil, err
	}
	if subscriptions.Live(sub.Status) {
		start := sub.CurrentPeriodStart.Time.UTC()
		if started := sub.StartedAt.Time.UTC(); started.After(start) {
			start = started
		}
		out.PeriodStart = &start
	}
	return out, nil
}

// Measure implements previewlicenseinvoice.Sources.
func (s *Sources) Measure(ctx context.Context, organizationID, instanceID, entitlementID uuid.UUID, from, to time.Time) (rating.Measure, error) {
	summary, err := s.deps.Usage.Summarize(ctx, ports.UsageRef{OrganizationID: organizationID, InstanceID: instanceID, EntitlementID: entitlementID}, from, to)
	if err != nil {
		return rating.Measure{}, err
	}
	return metering.Measure(summary), nil
}

// RetentionStart implements previewlicenseinvoice.Sources.
func (s *Sources) RetentionStart(ctx context.Context, organizationID uuid.UUID, now time.Time) *time.Time {
	return s.deps.Usage.RetentionStart(ctx, organizationID, now)
}

// Discount implements previewlicenseinvoice.Sources.
func (s *Sources) Discount(ctx context.Context, organizationID uuid.UUID, code string) (*rating.Discount, bool, error) {
	if s.deps.Discounts == nil {
		return nil, false, nil
	}
	discount, found, err := s.deps.Discounts.PreviewDiscount(ctx, organizationID, code)
	if err != nil || discount == nil {
		return nil, found, err
	}
	return &metering.Discounts([]ports.Discount{*discount})[0], true, nil
}
