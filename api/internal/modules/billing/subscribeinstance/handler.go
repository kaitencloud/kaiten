package subscribeinstance

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/money"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/lifecycle"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/metering"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/ports"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/providers"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/pushing"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/settings"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscriptions"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	vouchercatalogue "github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "SubscribeInstance"

const boundaryConstraint = "instance_invoice_boundary_key"

// Command is a subscription to start. A nil member takes its default: the
// organization's terms, and an anchor at the database's current second.
type Command struct {
	BasePriceID uuid.UUID
	// ProviderKind is who issues the invoices; empty is NOOP.
	ProviderKind     string
	CollectionMethod *string
	DaysUntilDue     *int32
	StartAt          *time.Time
	// TrialDays nil takes the licence's trial, unless the customer had one of
	// its family (INV-32); 0 is none.
	TrialDays *int32
	// AddOns are attached, and VoucherCode redeemed, in the subscribe's
	// transaction, after the subscription row and before the ACTIVATION
	// invoice (§9.1 step 2.3): either refused rolls the whole subscribe back.
	AddOns      []SubscriptionAddon
	VoucherCode *string

	// The members below are the self-serve checkout's (§14.4); the vendor's
	// subscribe API sets none of them.

	// MoveToLicenseID pins the instance to that version first, in the same
	// transaction, when it is on another one (§14.4 rule 2).
	MoveToLicenseID *uuid.UUID
	// ReplaceFree accepts an instance whose live subscription is free: it is
	// canceled at once, with no invoice and no fallback move, and subscribed
	// again on the same row (§9.10 rule 6, V31-68). Any other live
	// subscription is still refused.
	ReplaceFree bool
	// Incomplete enters INCOMPLETE (§9.10 rule 1): a public checkout whose
	// due-today total is above 0 subscribes without applying what it bought.
	// The version it moves to becomes pending_license_id, its add-ons and
	// voucher pending_selection, none attached or redeemed; the ACTIVATION
	// bills them, and its payment applies them. Over a free live subscription
	// the row keeps its status and carries the checkout in its pending
	// columns (§9.10 rule 6). Ignored with a trial: nothing is due then.
	Incomplete bool
	// AllowMissingPaymentMethod subscribes CHARGE_AUTOMATICALLY without an
	// ACTIVE payment method: a checkout with nothing due today and no card
	// required (§14.4 rule 4). The first charge then fails and the
	// subscription goes PAST_DUE (§9.2 rule 4) unless a card is added first.
	AllowMissingPaymentMethod bool
	// CallerPushes is a caller whose transaction the subscribe joins and
	// which pushes the ACTIVATION itself once it commits, with PushInline:
	// the invoice is leased to that push from its composition, as when the
	// commit is the subscribe's own (§9.12 rule 5).
	CallerPushes bool
	// DryRun composes the subscription and its ACTIVATION invoice, then rolls
	// everything back: what a checkout preview shows is what it would bill.
	DryRun bool
}

// AddonQuantity is an add-on to attach with a subscription.
type SubscriptionAddon struct {
	AddonSlug string `json:"addonSlug" doc:"The add-on version to attach" example:"extra-seats-v1"`
	Quantity  int32  `json:"quantity,omitempty" minimum:"1" default:"1" example:"3"`
}

// StartedSubscription is what a subscribe answers: the subscription, and the
// invoice of its first period when its base price bills in advance.
type StartedSubscription struct {
	subscriptions.InstanceBilling
	ActivationInvoice *invoices.InvoiceSummary `json:"activationInvoice,omitempty" doc:"The invoice of the first period, when the base price bills in advance; absent otherwise. Charged automatically, it is pushed and charged before this answer when the provider answers within 20 seconds: its status says how it went."`
	// Preview is the ACTIVATION invoice in full, lines included, on a dry run
	// only: the rows it was read from are rolled back.
	Preview *invoices.Invoice `json:"-"`
}

// BillingStarted is the payload of INSTANCE_BILLING_STARTED.
type BillingStarted = subscriptions.BillingStarted

// Pusher pushes, and charges, one invoice right after the subscribe commits
// (§12.4 rule 6).
type Pusher interface {
	Inline(ctx context.Context, invoiceID uuid.UUID, wait time.Duration)
}

type UseCase struct {
	deps   access.Deps
	outbox *outbox.ScopedRepository
	pusher Pusher
	trials *lifecycle.TrialAnnouncer
}

// NewUseCase builds the subscribe; trials announces a trial no longer than
// its reminder lead at once, and may be nil where a test needs none.
func NewUseCase(deps access.Deps, pusher Pusher, trials *lifecycle.TrialAnnouncer) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof), pusher: pusher, trials: trials}
}

// errDryRun rolls a dry run's transaction back once its result is read.
var errDryRun = errors.New("subscribe: dry run")

// inlineWait bounds the inline push of a charged-automatically ACTIVATION.
const inlineWait = 20 * time.Second

// Execute subscribes an instance to a FLAT_FEE price of its licence version.
// With a trial it starts in TRIAL and bills nothing until the trial ends.
// Without one its periods are counted from the anchor, and a base price that
// bills in advance issues the first period's invoice in the same transaction. A CANCELED
// subscription is subscribed again on the same row. From then on the
// instance's customer and licence are frozen.
//
// The add-ons and the voucher it is started with are attached and redeemed in
// the same transaction. An ACTIVATION invoice charged automatically is pushed
// and charged right after the commit -- when the commit is this call's own --
// and the answer carries its status as persisted.
func (u *UseCase) Execute(ctx context.Context, instanceSlug string, cmd Command) (*StartedSubscription, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	ctx = u.deps.AIPolicy.Resolve(ctx, user.OrganizationID)
	return u.ExecuteWithinOperation(ctx, instanceSlug, cmd)
}

// ExecuteWithinOperation composes a parent operation using its already-resolved
// platform decision. It performs no provider evaluation while a transaction is held.
func (u *UseCase) ExecuteWithinOperation(ctx context.Context, instanceSlug string, cmd Command) (*StartedSubscription, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}

	ctx = u.deps.AIPolicy.ForOrganization(ctx, user.OrganizationID)
	if err := u.requireOperationalSelection(ctx, user.OrganizationID, instanceSlug, cmd.BasePriceID, cmd.MoveToLicenseID, cmd.AddOns, cmd.VoucherCode); err != nil {
		return nil, err
	}
	// Whether the commit is this call's own, asked before the transaction
	// begins -- inside it, the context always carries one.
	ownsCommit := !u.deps.Uof.InTransaction(ctx)
	kind, err := u.checkProvider(ctx, user.OrganizationID, instanceSlug, cmd)
	if err != nil {
		return nil, err
	}

	var started *StartedSubscription
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := u.deps.Queries(ctx)
		instance, err := q.LockInstanceForSubscribe(ctx, db.LockInstanceForSubscribeParams{OrganizationID: user.OrganizationID, Slug: instanceSlug})
		if errors.Is(err, pgx.ErrNoRows) {
			return kaitenerrors.NotFoundf(operation+".InstanceNotFound", "instance %q not found", instanceSlug)
		}
		if err != nil {
			return err
		}
		existing, err := q.LockInstanceBilling(ctx, db.LockInstanceBillingParams{OrganizationID: user.OrganizationID, InstanceID: &instance.ID})
		resubscribe := err == nil
		waitingOnFree := false
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		if resubscribe && subscriptions.Live(existing.Status) {
			// A checkout replaces a free subscription with another price,
			// never with the one it already has.
			free := false
			if cmd.ReplaceFree && cmd.BasePriceID != existing.BaseLicensePriceID {
				if free, err = q.IsFreeSubscription(ctx, db.IsFreeSubscriptionParams{
					OrganizationID: user.OrganizationID, LicenseID: instance.LicenseID, InstanceID: instance.ID,
				}); err != nil {
					return err
				}
			}
			if !free || existing.PendingLicenseID != nil {
				// A checkout already waiting on it counts as INCOMPLETE.
				return kaitenerrors.Conflict(operation+".AlreadySubscribed", "this instance already has a live subscription")
			}
			if cmd.Incomplete {
				// With an amount due the free subscription stays live, with its
				// licence and periods, and carries the checkout in its pending
				// columns until the ACTIVATION is paid, whose transaction
				// replaces it (§9.10 rule 6). Decided below, once the trial is
				// known: with one, nothing is due.
				waitingOnFree = true
			} else if existing, err = u.cancelFree(ctx, q, existing, user.ID); err != nil {
				return err
			}
		}
		targetLicenseID := instance.LicenseID
		if cmd.MoveToLicenseID != nil {
			targetLicenseID = *cmd.MoveToLicenseID
		}
		moved := !cmd.Incomplete && targetLicenseID != instance.LicenseID
		if moved {
			if u.deps.Mover == nil {
				return errors.New("subscribe: no instance version mover is wired")
			}
			if err := u.deps.Mover.MoveToVersion(ctx, instanceSlug, *cmd.MoveToLicenseID); err != nil {
				return err
			}
			if instance, err = q.LockInstanceForSubscribe(ctx, db.LockInstanceForSubscribeParams{OrganizationID: user.OrganizationID, Slug: instanceSlug}); err != nil {
				return err
			}
		}

		license, err := q.GetBillingLicense(ctx, db.GetBillingLicenseParams{OrganizationID: user.OrganizationID, ID: targetLicenseID})
		if err != nil {
			return err
		}
		if license.LifecycleState != db.LicenseLifecycleStatePUBLISHED {
			return kaitenerrors.UnprocessableEntity(operation+".LicenseNotPublished",
				"the instance's licence version is not PUBLISHED: only a version on sale can be subscribed to")
		}
		base, err := u.deps.Catalogue.Price(ctx, user.OrganizationID, cmd.BasePriceID)
		if err != nil {
			return err
		}
		switch {
		case base == nil:
			return kaitenerrors.NotFoundf(operation+".PriceNotFound", "price %s not found", cmd.BasePriceID)
		case base.LicenseID != targetLicenseID:
			return kaitenerrors.UnprocessableEntity(operation+".PriceNotOnInstanceLicense",
				"basePriceId is a price of another licence version than the instance's")
		case base.BillingModel != prices.ModelFlatFee:
			return kaitenerrors.UnprocessableEntity(operation+".PriceNotFlatFee", "the base price of a subscription is a FLAT_FEE price")
		case base.Status != prices.StatusActive:
			return kaitenerrors.UnprocessableEntity(operation+".PriceDeprecated", "a deprecated price is no longer offered")
		}
		trialDays := int32(0)
		if license.TrialPeriodDays != nil {
			trialDays = *license.TrialPeriodDays
		}
		if cmd.TrialDays != nil {
			if *cmd.TrialDays < 0 || *cmd.TrialDays > licenseschema.MaxTrialDays {
				return kaitenerrors.UnprocessableEntity(operation+".InvalidTrialDays", "trialDays is 0 (no trial) or between 1 and 365")
			}
			trialDays = *cmd.TrialDays
		}
		if cmd.TrialDays == nil && trialDays > 0 {
			// One trial per customer and family (INV-32): a customer who had
			// one gets no default trial, dryRun included; only an explicit
			// trialDays grants another.
			if err := q.LockCustomerTrials(ctx, instance.CustomerID.String()); err != nil {
				return err
			}
			consumed, err := q.CustomerTrialConsumed(ctx, db.CustomerTrialConsumedParams{
				OrganizationID: user.OrganizationID, CustomerID: instance.CustomerID, LicenseID: targetLicenseID,
			})
			if err != nil {
				return err
			}
			if consumed {
				trialDays = 0
			}
		}
		if cmd.DaysUntilDue != nil && (*cmd.DaysUntilDue < 0 || *cmd.DaysUntilDue > 365) {
			return kaitenerrors.UnprocessableEntity(operation+".InvalidDaysUntilDue", "daysUntilDue is between 0 and 365")
		}
		// The add-ons the instance already holds bill with this subscription:
		// each must be billable in its currency and period (V31-13). The ones
		// in cmd.AddOns are checked by their own attach.
		if u.deps.Addons != nil {
			invalid, err := u.deps.Addons.InvalidHeldAddons(ctx, user.OrganizationID, instance.ID, *base.BillingPeriod, base.Currency)
			if err != nil {
				return err
			}
			if len(invalid) > 0 {
				details := make([]*kaitenerrors.ErrorDetail, len(invalid))
				for i, addon := range invalid {
					details[i] = &kaitenerrors.ErrorDetail{
						Message: "a held add-on this subscription cannot bill", Location: "addons." + addon.Slug,
						Value: map[string]any{"reason": addon.Reason},
					}
				}
				return kaitenerrors.UnprocessableEntityWithErrors(operation+".AddonInvalid",
					"an add-on the instance holds cannot be billed by this subscription: publish it, price it for the period in the subscription's currency, or detach it", details...)
			}
		}

		clock, err := q.BillingClock(ctx)
		if err != nil {
			return err
		}
		now := clock.Time.UTC()
		months := rating.PeriodMonths(*base.BillingPeriod)
		anchor := now
		if cmd.StartAt != nil {
			anchor = cmd.StartAt.UTC()
			if anchor.After(now) {
				return kaitenerrors.UnprocessableEntity(operation+".StartAtInFuture", "startAt is in the future")
			}
			if anchor.Before(rating.AddMonthsClamped(now, -months)) {
				return kaitenerrors.UnprocessableEntity(operation+".StartAtTooEarly", "startAt is at most one billing period ago")
			}
		}
		// A resubscription starts after the life it follows ended: two lives
		// of one instance never overlap (§9.9, V31-19).
		if resubscribe && existing.Status == db.InstanceBillingStatusCANCELED && existing.CanceledAt.Valid &&
			anchor.Before(existing.CanceledAt.Time) {
			return kaitenerrors.UnprocessableEntity(operation+".StartAtBeforeCancellation",
				"startAt is before the instance's previous subscription was canceled; two subscriptions of an instance never overlap")
		}
		anchor = anchor.Truncate(time.Second)
		periodEnd := rating.AddMonthsClamped(anchor, months)
		status := db.InstanceBillingStatusACTIVE
		var trialEndsAt, trialWillEndAt pgtype.Timestamp
		if trialDays > 0 {
			// During the trial the period is the trial; nothing is billed
			// before it ends. Its reminder takes the family's lead as it is
			// now: a later change moves no running trial (V32-07).
			periodEnd = anchor.Add(time.Duration(trialDays) * 24 * time.Hour)
			status, trialEndsAt = db.InstanceBillingStatusTRIAL, invoices.Timestamp(periodEnd)
			trialWillEndAt = invoices.Timestamp(lifecycle.TrialWillEndAt(periodEnd, license.TrialReminderDays))
		}
		// INCOMPLETE: nothing applied, the selection stored with the ids its
		// rows take at payment, the ACTIVATION composed from it (§9.10 rule 1).
		incomplete := cmd.Incomplete && trialDays == 0
		if waitingOnFree && !incomplete {
			// A trial: nothing is due, so the free subscription is replaced now.
			if existing, err = u.cancelFree(ctx, q, existing, user.ID); err != nil {
				return err
			}
			waitingOnFree = false
		}
		var pending *pendingCheckout
		if incomplete {
			status = db.InstanceBillingStatusINCOMPLETE
			if pending, err = u.pendingCheckout(ctx, user.OrganizationID, *base.BillingPeriod, cmd); err != nil {
				return err
			}
		}

		customer, err := q.GetBillingCustomer(ctx, db.GetBillingCustomerParams{OrganizationID: user.OrganizationID, ID: instance.CustomerID})
		if err != nil {
			return err
		}
		var method *db.CollectionMethod
		if cmd.CollectionMethod != nil {
			m := db.CollectionMethod(*cmd.CollectionMethod)
			method = &m
		}
		var pendingLicenseID *uuid.UUID
		var pendingSelection []byte
		var incompleteExpiresAt pgtype.Timestamp
		if pending != nil {
			pendingLicenseID, pendingSelection = &targetLicenseID, pending.stored
			incompleteExpiresAt = invoices.Timestamp(anchor.Add(subscriptions.IncompleteLifetime * time.Second))
		}
		var row db.InstanceBilling
		var shown *db.InstanceBilling // the row as the answer shows it, when not row
		if waitingOnFree {
			// The free row keeps its status and price; the checkout waits in
			// its pending columns, the price the payment makes the base named
			// in the selection.
			if pending, err = u.withPrice(pending, base.ID); err != nil {
				return err
			}
			free, err := q.SetPendingCheckout(ctx, db.SetPendingCheckoutParams{
				PendingLicenseID: &targetLicenseID, PendingSelection: pending.stored, IncompleteExpiresAt: incompleteExpiresAt,
				UserID: user.ID, Now: invoices.Timestamp(now), ID: existing.ID,
			})
			if err != nil {
				return err
			}
			// The ACTIVATION is composed as the checkout's subscription would
			// be: its provider, terms and currency, on the free row.
			row, shown = free, &free
			row.ProviderKind, row.CollectionMethod, row.DaysUntilDue = kind, method, cmd.DaysUntilDue
			row.Currency, row.BaseLicensePriceID = base.Currency, base.ID
		} else if resubscribe {
			row, err = q.ResubscribeInstanceBilling(ctx, db.ResubscribeInstanceBillingParams{
				CustomerID: &customer.ID, InstanceSlug: instance.Slug, InstanceName: instance.Name,
				CustomerSlug: customer.Slug, CustomerName: customer.Name, Status: status,
				ProviderKind: kind, CollectionMethod: method, DaysUntilDue: cmd.DaysUntilDue,
				BaseLicensePriceID: base.ID, BillingPeriod: db.BillingPeriod(*base.BillingPeriod), Currency: base.Currency,
				AnchorAt: invoices.Timestamp(anchor), CurrentPeriodEnd: invoices.Timestamp(periodEnd), TrialEndsAt: trialEndsAt, TrialWillEndAt: trialWillEndAt,
				PendingLicenseID: pendingLicenseID, PendingSelection: pendingSelection, IncompleteExpiresAt: incompleteExpiresAt,
				UserID: user.ID, Now: invoices.Timestamp(now), ID: existing.ID, OrganizationID: user.OrganizationID,
			})
		} else {
			row, err = q.InsertInstanceBilling(ctx, db.InsertInstanceBillingParams{
				OrganizationID: user.OrganizationID, InstanceID: &instance.ID, CustomerID: &customer.ID,
				InstanceSlug: instance.Slug, InstanceName: instance.Name, CustomerSlug: customer.Slug,
				CustomerName: customer.Name, Status: status, ProviderKind: kind,
				CollectionMethod: method, DaysUntilDue: cmd.DaysUntilDue, BaseLicensePriceID: base.ID,
				BillingPeriod: db.BillingPeriod(*base.BillingPeriod), Currency: base.Currency,
				AnchorAt: invoices.Timestamp(anchor), CurrentPeriodEnd: invoices.Timestamp(periodEnd), TrialEndsAt: trialEndsAt, TrialWillEndAt: trialWillEndAt,
				PendingLicenseID: pendingLicenseID, PendingSelection: pendingSelection, IncompleteExpiresAt: incompleteExpiresAt,
				UserID: user.ID,
			})
		}
		if err != nil {
			return err
		}

		shownRow := row
		if shown != nil {
			shownRow = *shown
		}
		billing, err := subscriptions.Build(ctx, q, u.deps.Catalogue, shownRow)
		if err != nil {
			return err
		}
		started = &StartedSubscription{InstanceBilling: *billing, ActivationInvoice: nil, Preview: nil}

		if !incomplete {
			if err := u.attachAndRedeem(ctx, instanceSlug, cmd); err != nil {
				return err
			}
		}
		if moved {
			// The version moved to, with the add-ons bought with it, must
			// accept the usage already made (§14.4 rule 2).
			over, err := u.deps.Mover.OverQuota(ctx, instanceSlug)
			if err != nil {
				return err
			}
			if len(over) > 0 {
				return kaitenerrors.UnprocessableEntityWithErrors(operation+".QuotaExceeded",
					"the instance already uses more than this plan allows",
					&kaitenerrors.ErrorDetail{
						Message: "entitlements over the plan's limit", Location: "body.basePriceId",
						Value: map[string]any{"entitlementSlugs": over},
					})
			}
		}
		// A voucher redeemed just now is dated by the clock, after now: the
		// first invoice applies the vouchers redeemed up to after it.
		appliedAt := now
		if cmd.VoucherCode != nil && !incomplete {
			later, err := q.BillingClock(ctx)
			if err != nil {
				return err
			}
			appliedAt = later.Time.UTC()
		}

		// Nothing before P0 is ever trued up: the first period measures its
		// highest quantities from the ones held now (V31-70, §10.4 rule 4).
		if u.deps.Scheduled != nil {
			if err := u.deps.Scheduled.ResetPeriodMax(ctx, user.OrganizationID, instance.ID); err != nil {
				return err
			}
		}

		// The first period's invoice: the base price in advance, when it bills
		// in advance. An all-arrears subscription has no ACTIVATION invoice.
		if status == db.InstanceBillingStatusTRIAL {
			if cmd.DryRun {
				return errDryRun
			}
			// The trial is consumed, whatever happens next (INV-32): the next
			// anonymous checkout with this e-mail reads it (INV-35).
			if err := q.RecordCustomerTrial(ctx, db.RecordCustomerTrialParams{
				CustomerID: customer.ID, InstanceID: &instance.ID, Now: invoices.Timestamp(now),
				OrganizationID: user.OrganizationID, LicenseID: targetLicenseID,
			}); err != nil {
				return err
			}
			if err := u.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(
				user.OrganizationID, events.InstanceBillingStarted.Name, events.InstanceBillingStarted.Type,
				BillingStarted{InstanceBilling: *billing, Resubscribed: resubscribe}, nil,
			)); err != nil {
				return err
			}
			// A trial no longer than the lead announces its end at once
			// (§9.2 rule 7); the others wait for billing-lifecycle step (e).
			if u.trials != nil && !trialWillEndAt.Time.After(now) {
				if _, err := u.trials.Announce(ctx, q, row, now); err != nil {
					return err
				}
			}
			return nil
		}
		var held []ports.BillableAddon
		if u.deps.Addons != nil {
			held, err = u.deps.Addons.BillableAddons(ctx, user.OrganizationID, instance.ID, *base.BillingPeriod)
			if err != nil {
				return err
			}
		}
		if pending != nil {
			held = append(held, pending.addOns...)
		}
		composition, err := rating.Compose(rating.Input{
			Kind: rating.KindActivation, Currency: money.Currency(base.Currency), LicenseName: license.Name, Base: metering.Price(*base),
			Metered: nil, Measures: nil, Addons: metering.Addons(held, base.Currency),
			Advance: rating.Period{From: anchor, To: periodEnd}, Arrears: rating.Period{From: anchor, To: anchor},
		})
		if err != nil {
			return err
		}
		// The vouchers the instance redeemed up to now apply to its first
		// invoice, even when the subscription starts earlier.
		if u.deps.Discounts != nil {
			redeemed, err := u.deps.Discounts.Discounts(ctx, user.OrganizationID, instance.ID, appliedAt)
			if err != nil {
				return err
			}
			if pending != nil && pending.discount != nil {
				// The voucher as a redemption made at the composition instant
				// (§8.4 rule 2), under the id its row takes at payment.
				redeemed = append(redeemed, *pending.discount)
			}
			composition, err = rating.ApplyDiscounts(composition, metering.Discounts(redeemed), money.Currency(base.Currency))
			if err != nil {
				return err
			}
		}
		if len(composition.Lines) > 0 {
			defaults, err := settings.Read(ctx, q, user.OrganizationID)
			if err != nil {
				return err
			}
			terms := subscriptions.Terms(row, defaults)
			pushes := u.deps.Pushes(row.ProviderKind)
			draft := invoices.Draft{
				Subscription: row, LicenseID: license.ID, LicenseSlug: license.Slug, BillingEmail: customer.BillingEmail,
				Kind: rating.KindActivation, BoundaryAt: anchor, Composition: composition,
				Terms: terms, Hold: nil, ReplacesInvoiceID: nil,
				Pushes: pushes, PushLeasedUntil: nil, Now: now,
			}
			if (ownsCommit || cmd.CallerPushes) && u.pushesInline(cmd, pushes, terms.CollectionMethod, composition.Total) {
				// Leased to the push this call makes once it commits.
				leasedUntil := now.Add(pushing.InlineLease)
				draft.PushLeasedUntil = &leasedUntil
			}
			invoice, err := invoices.Insert(ctx, q, draft)
			if kaitenerrors.IsUniqueViolationOnConstraint(err, boundaryConstraint) {
				return kaitenerrors.Conflict(operation+".BoundaryConflict",
					"an invoice of this subscription already bills a period starting at this instant: start at another one")
			}
			if err != nil {
				return err
			}
			summary := invoices.Summary(invoice)
			started.ActivationInvoice = &summary
			if cmd.DryRun {
				preview, err := invoices.FromRow(invoice)
				if err != nil {
					return err
				}
				started.Preview = &preview
				return errDryRun
			}
			if err := invoices.AnnounceComposed(ctx, u.outbox, invoice); err != nil {
				return err
			}
			consumed := composition
			if pending != nil && pending.discount != nil {
				// The pending voucher has no row before the payment, which
				// consumes its application then (§9.10 rule 3).
				consumed = metering.Without(composition, pending.discount.InstanceVoucherID)
			}
			if err := metering.Consume(ctx, u.deps.Discounts, user.OrganizationID, consumed, appliedAt); err != nil {
				return err
			}
		}
		if cmd.DryRun {
			return errDryRun
		}

		if waitingOnFree {
			return nil // the payment starts the subscription, and announces it
		}
		return u.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(
			user.OrganizationID, events.InstanceBillingStarted.Name, events.InstanceBillingStarted.Type,
			BillingStarted{InstanceBilling: *billing, Resubscribed: resubscribe}, nil,
		))
	})
	if errors.Is(err, errDryRun) {
		return started, nil
	}
	if err != nil {
		return nil, err
	}
	if ownsCommit {
		u.pushInline(ctx, started)
	}
	return started, nil
}

// PushInline is the push a caller that set CallerPushes makes once its
// transaction committed: the ACTIVATION pushed and charged, and the answer
// refreshed from what was persisted.
func (u *UseCase) PushInline(ctx context.Context, started *StartedSubscription) {
	u.pushInline(ctx, started)
}

// pushInline pushes and charges an ACTIVATION charged automatically, right
// after the commit (§12.4 rule 6), and reads it back. Only when the commit was
// this call's own: inside a caller's transaction the invoice is not visible to
// the push yet, and that caller pushes it once it commits.
func (u *UseCase) pushInline(ctx context.Context, started *StartedSubscription) {
	invoice := started.ActivationInvoice
	if invoice == nil || u.pusher == nil ||
		invoice.ProviderKind == invoices.ProviderNoop || invoice.CollectionMethod != settings.ChargeAutomatically ||
		invoice.Total <= 0 || invoice.Status != "DRAFT" {
		return
	}
	u.pusher.Inline(ctx, invoice.ID, inlineWait)
	q := u.deps.Queries(ctx)
	row, err := q.GetInvoiceByID(ctx, invoice.ID)
	if err != nil {
		return // the answer keeps the invoice as composed; the queue has it
	}
	summary := invoices.Summary(row)
	started.ActivationInvoice = &summary
	// A payment may have settled the checkout meanwhile (§9.10 rules 3 and
	// 6): the answer shows the subscription as it now is.
	sub, err := q.GetSubscriptionByID(ctx, row.InstanceBillingID)
	if err != nil {
		return
	}
	if billing, err := subscriptions.Build(ctx, q, u.deps.Catalogue, sub); err == nil {
		started.InstanceBilling = *billing
	}
}

// pushesInline reports whether the ACTIVATION this call composes is pushed
// inline once it commits: charged automatically through a provider that pushes
// invoices, and something to charge. The caller also checks the commit is its
// own -- inside a caller's transaction the push could not see the invoice yet.
func (u *UseCase) pushesInline(cmd Command, pushes bool, method string, total int64) bool {
	return !cmd.DryRun && u.pusher != nil && pushes && method == settings.ChargeAutomatically && total > 0
}

// attachAndRedeem attaches the add-ons, then redeems the voucher, the
// subscription row being written (§9.1 step 2.3). A refusal is answered as
// the subscribe's, with the refused member's own code in errors[0].
func (u *UseCase) attachAndRedeem(ctx context.Context, instanceSlug string, cmd Command) error {
	for i, addon := range cmd.AddOns {
		if u.deps.Attacher == nil {
			return errors.New("subscribe: no add-on attacher is wired")
		}
		quantity := addon.Quantity
		if quantity == 0 {
			quantity = 1
		}
		if err := u.deps.Attacher.AttachForSubscription(ctx, instanceSlug, addon.AddonSlug, quantity); err != nil {
			return refused(err, operation+".AddonInvalid", "an add-on cannot be attached", fmt.Sprintf("body.addOns[%d]", i))
		}
	}
	if cmd.VoucherCode != nil {
		if u.deps.Redeemer == nil {
			return errors.New("subscribe: no voucher redeemer is wired")
		}
		if err := u.deps.Redeemer.RedeemForSubscription(ctx, instanceSlug, *cmd.VoucherCode); err != nil {
			return refused(err, operation+".VoucherInvalid", "the voucher cannot be redeemed", "body.voucherCode")
		}
	}
	return nil
}

// refused answers a refusal of the attach or redeem a subscribe makes as a 422
// of the subscribe, carrying the original code and message in errors[0]. A
// failure that is not a refusal -- the database, a dependency -- passes
// through as it is.
func refused(err error, code, message, location string) error {
	var refusal *kaitenerrors.Error
	if !errors.As(err, &refusal) {
		return err
	}
	switch refusal.Kind {
	case kaitenerrors.KindNotFound, kaitenerrors.KindConflict, kaitenerrors.KindValidation, kaitenerrors.KindUnprocessable:
	default:
		return err
	}
	return kaitenerrors.UnprocessableEntityWithErrors(code, message, &kaitenerrors.ErrorDetail{
		Message: refusal.Message, Location: location, Value: map[string]any{"code": refusal.Code},
	})
}

// checkProvider checks the provider the subscription bills through, and for
// one that pushes invoices, makes sure it knows the customer: synchronously,
// before the subscription is written.
func (u *UseCase) checkProvider(ctx context.Context, organizationID uuid.UUID, instanceSlug string, cmd Command) (db.BillingProviderKind, error) {
	kind := db.BillingProviderKindNOOP
	if cmd.ProviderKind != "" {
		kind = db.BillingProviderKind(cmd.ProviderKind)
	}
	q := u.deps.Queries(ctx)
	defaults, err := settings.Read(ctx, q, organizationID)
	if err != nil {
		return "", err
	}
	method := defaults.DefaultCollectionMethod
	if kind == db.BillingProviderKindNOOP {
		// NOOP sends its invoices whatever the default; only an explicit
		// CHARGE_AUTOMATICALLY is refused (§9.1, §12.5).
		method = settings.SendInvoice
	}
	if cmd.CollectionMethod != nil {
		method = *cmd.CollectionMethod
	}
	if kind == db.BillingProviderKindNOOP && method == settings.SendInvoice {
		return kind, nil
	}
	conn, err := providers.ConnectNew(ctx, u.deps.Providers, organizationID, kind)
	if err != nil {
		return "", providers.APIError(operation, err)
	}
	capabilities := conn.Adapter.Capabilities()
	if method != settings.SendInvoice && !capabilities.ChargeAutomatically {
		return "", kaitenerrors.UnprocessableEntity(operation+".CollectionMethodUnsupported",
			"only SEND_INVOICE is available: the payment provider cannot charge automatically")
	}
	if !capabilities.PushesInvoices {
		return kind, nil
	}
	instance, err := q.LockInstanceForSubscribe(ctx, db.LockInstanceForSubscribeParams{OrganizationID: organizationID, Slug: instanceSlug})
	if errors.Is(err, pgx.ErrNoRows) {
		return "", kaitenerrors.NotFoundf(operation+".InstanceNotFound", "instance %q not found", instanceSlug)
	}
	if err != nil {
		return "", err
	}
	if base, err := u.deps.Catalogue.Price(ctx, organizationID, cmd.BasePriceID); err != nil {
		return "", err
	} else if base != nil && !capabilities.AcceptsCurrency(base.Currency) {
		return "", kaitenerrors.UnprocessableEntityf(operation+".UnsupportedCurrency", "the payment provider does not accept %s", base.Currency)
	}
	customer, err := q.GetBillingCustomer(ctx, db.GetBillingCustomerParams{OrganizationID: organizationID, ID: instance.CustomerID})
	if err != nil {
		return "", err
	}
	if method == settings.SendInvoice && (customer.BillingEmail == nil || *customer.BillingEmail == "") {
		return "", kaitenerrors.UnprocessableEntity(operation+".BillingEmailMissing",
			"the customer has no billing e-mail: the payment provider sends the invoices there")
	}
	if method == settings.ChargeAutomatically && !cmd.AllowMissingPaymentMethod {
		if err := providers.RequirePaymentMethod(ctx, q, organizationID, customer.ID, kind, operation); err != nil {
			return "", err
		}
	}
	// A subscribe that joins its caller's transaction makes no provider call
	// in it (INV-03, §9.12 rule 9): the caller links the provider customer
	// itself, in its transaction after a setup or with
	// EnsureProviderCustomer after its commit.
	if u.deps.Uof.InTransaction(ctx) {
		return kind, nil
	}
	if err := ensureCustomer(ctx, q, conn, organizationID, customer, u.deps.ProviderTimeout); err != nil {
		return "", err
	}
	return kind, nil
}

// EnsureProviderCustomer creates the provider customer of the instance's
// customer, and links it, when the provider pushes invoices and has none
// yet: what a subscribe that joined its caller's transaction skipped (§9.12
// rule 5). Idempotent; outside any transaction.
func (u *UseCase) EnsureProviderCustomer(ctx context.Context, organizationID uuid.UUID, instanceSlug, providerKind string) error {
	q := u.deps.Queries(ctx)
	conn, err := providers.Connect(ctx, u.deps.Providers, organizationID, db.BillingProviderKind(providerKind))
	if err != nil {
		return providers.APIError(operation, err)
	}
	if !conn.Adapter.Capabilities().PushesInvoices {
		return nil
	}
	instance, err := q.GetInstanceBySlug(ctx, db.GetInstanceBySlugParams{OrganizationID: organizationID, Slug: instanceSlug})
	if err != nil {
		return err
	}
	customer, err := q.GetBillingCustomer(ctx, db.GetBillingCustomerParams{OrganizationID: organizationID, ID: instance.CustomerID})
	if err != nil {
		return err
	}
	return ensureCustomer(ctx, q, conn, organizationID, customer, u.deps.ProviderTimeout)
}

func ensureCustomer(ctx context.Context, q *db.Queries, conn *provider.Connection, organizationID uuid.UUID,
	customer db.GetBillingCustomerRow, timeout time.Duration,
) error {
	clock, err := q.BillingClock(ctx)
	if err != nil {
		return err
	}
	email := ""
	if customer.BillingEmail != nil {
		email = *customer.BillingEmail
	}
	if _, err := providers.EnsureCustomer(ctx, q, conn, organizationID,
		providers.Customer{ID: customer.ID, Name: customer.Name, Email: email}, timeout, clock.Time.UTC()); err != nil {
		return providers.APIError(operation, err)
	}
	return nil
}

func (u *UseCase) requireOperationalSelection(ctx context.Context, organizationID uuid.UUID, instanceSlug string, priceID uuid.UUID, licenseID *uuid.UUID, addons []SubscriptionAddon, voucherCode *string) error {
	if u.deps.AIPolicy.Enabled(ctx) {
		return nil
	}
	slugs := make([]string, 0, len(addons))
	for _, addon := range addons {
		slugs = append(slugs, addon.AddonSlug)
	}
	var code *string
	if voucherCode != nil {
		normalized := vouchercatalogue.NormalizeCode(*voucherCode)
		code = &normalized
	}
	hasAI, err := u.deps.Queries(ctx).SubscriptionSelectionHasAI(ctx, db.SubscriptionSelectionHasAIParams{OrganizationID: organizationID, InstanceSlug: instanceSlug, BasePriceID: priceID, MoveToLicenseID: licenseID, AddonSlugs: slugs, VoucherCode: code})
	if err != nil {
		return err
	}
	if hasAI {
		return u.deps.AIPolicy.RequireEnabled(ctx)
	}
	return nil
}
