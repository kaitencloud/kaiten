package subscribeinstance

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/money"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/metering"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/ports"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// PreviewCommand is a subscription to price with no instance yet: what an
// anonymous checkout's start prices (V32-01, §14.8 rule 5).
type PreviewCommand struct {
	BasePriceID uuid.UUID
	AddOns      []SubscriptionAddon
	// TrialDays nil takes the licence's trial; 0 is none.
	TrialDays *int32
}

// ActivationPreview is what the subscription would bill today: its
// ACTIVATION, composed as Execute composes it, or nothing during a trial.
type ActivationPreview struct {
	Currency    string
	Composition rating.Composition
	// TrialEndsAt is set when the subscription would start in a trial.
	TrialEndsAt *time.Time
}

// PreviewActivation composes the ACTIVATION a subscribe to cmd would issue
// now, for no instance: the base price in advance and the add-ons' flat fees,
// none attached and none written. During a trial nothing is due (§14.8 rule 4).
// It answers the subscribe's own refusals for the base price; the caller has
// checked what the public catalogue offers.
func (u *UseCase) PreviewActivation(ctx context.Context, organizationID uuid.UUID, cmd PreviewCommand) (*ActivationPreview, error) {
	q := u.deps.Queries(ctx)
	base, err := u.deps.Catalogue.Price(ctx, organizationID, cmd.BasePriceID)
	if err != nil {
		return nil, err
	}
	switch {
	case base == nil:
		return nil, kaitenerrors.NotFoundf(operation+".PriceNotFound", "price %s not found", cmd.BasePriceID)
	case base.BillingModel != prices.ModelFlatFee || base.BillingPeriod == nil:
		return nil, kaitenerrors.UnprocessableEntity(operation+".PriceNotFlatFee", "the base price of a subscription is a FLAT_FEE price")
	case base.Status != prices.StatusActive:
		return nil, kaitenerrors.UnprocessableEntity(operation+".PriceDeprecated", "a deprecated price is no longer offered")
	}
	license, err := q.GetBillingLicense(ctx, db.GetBillingLicenseParams{OrganizationID: organizationID, ID: base.LicenseID})
	if err != nil {
		return nil, err
	}
	trialDays := int32(0)
	if license.TrialPeriodDays != nil {
		trialDays = *license.TrialPeriodDays
	}
	if cmd.TrialDays != nil {
		if *cmd.TrialDays < 0 || *cmd.TrialDays > licenseschema.MaxTrialDays {
			return nil, kaitenerrors.UnprocessableEntity(operation+".InvalidTrialDays", "trialDays is 0 (no trial) or between 1 and 365")
		}
		trialDays = *cmd.TrialDays
	}
	clock, err := q.BillingClock(ctx)
	if err != nil {
		return nil, err
	}
	now := clock.Time.UTC().Truncate(time.Second)
	out := &ActivationPreview{Currency: base.Currency, Composition: rating.Composition{Lines: nil}, TrialEndsAt: nil}
	if trialDays > 0 {
		ends := now.Add(time.Duration(trialDays) * 24 * time.Hour)
		out.TrialEndsAt = &ends
		return out, nil
	}

	var held []ports.BillableAddon
	for _, addon := range cmd.AddOns {
		if u.deps.Addons == nil {
			break
		}
		preview, err := u.deps.Addons.PreviewAddon(ctx, organizationID, addon.AddonSlug, *base.BillingPeriod)
		if err != nil {
			return nil, err
		}
		if preview == nil || preview.Flat == nil {
			continue // a free add-on bills nothing
		}
		charge := *preview.Flat
		charge.Quantity = addon.Quantity
		if charge.Quantity == 0 {
			charge.Quantity = 1
		}
		held = append(held, charge)
	}
	months := rating.PeriodMonths(*base.BillingPeriod)
	composition, err := rating.Compose(rating.Input{
		Kind: rating.KindActivation, Currency: money.Currency(base.Currency), LicenseName: license.Name, Base: metering.Price(*base),
		Metered: nil, Measures: nil, Addons: metering.Addons(held, base.Currency),
		Advance: rating.Period{From: now, To: rating.AddMonthsClamped(now, months)}, Arrears: rating.Period{From: now, To: now},
	})
	if err != nil {
		return nil, err
	}
	out.Composition = composition
	return out, nil
}
