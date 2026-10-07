package subscribeinstance

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/money"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/metering"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/ports"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/providers"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/settings"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscriptions"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
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
	// TrialDays nil takes the licence's trial; 0 is none.
	TrialDays *int32
}

// StartedSubscription is what a subscribe answers: the subscription, and the
// invoice of its first period when its base price bills in advance.
type StartedSubscription struct {
	subscriptions.InstanceBilling
	ActivationInvoice *invoices.InvoiceSummary `json:"activationInvoice,omitempty" doc:"The invoice of the first period, when the base price bills in advance; absent otherwise"`
}

// BillingStarted is the payload of INSTANCE_BILLING_STARTED.
type BillingStarted struct {
	subscriptions.InstanceBilling
	Resubscribed bool `json:"resubscribed" doc:"Set when a CANCELED subscription was subscribed again"`
}

type UseCase struct {
	deps   access.Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps access.Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Execute subscribes an instance to a FLAT_FEE price of its licence version.
// With a trial it starts in TRIAL and bills nothing until the trial ends.
// Without one its periods are counted from the anchor, and a base price that
// bills in advance issues the first period's invoice in the same transaction. A CANCELED
// subscription is subscribed again on the same row. From then on the
// instance's customer and licence are frozen.
func (u *UseCase) Execute(ctx context.Context, instanceSlug string, cmd Command) (*StartedSubscription, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
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
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		if resubscribe && subscriptions.Live(existing.Status) {
			return kaitenerrors.Conflict(operation+".AlreadySubscribed", "this instance already has a live subscription")
		}

		license, err := q.GetBillingLicense(ctx, db.GetBillingLicenseParams{OrganizationID: user.OrganizationID, ID: instance.LicenseID})
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
		case base.LicenseID != instance.LicenseID:
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
			if *cmd.TrialDays < 0 {
				return kaitenerrors.UnprocessableEntity(operation+".InvalidTrialDays", "trialDays is 0 (no trial) or more")
			}
			trialDays = *cmd.TrialDays
		}
		if cmd.DaysUntilDue != nil && (*cmd.DaysUntilDue < 0 || *cmd.DaysUntilDue > 365) {
			return kaitenerrors.UnprocessableEntity(operation+".InvalidDaysUntilDue", "daysUntilDue is between 0 and 365")
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
		anchor = anchor.Truncate(time.Second)
		periodEnd := rating.AddMonthsClamped(anchor, months)
		status := db.InstanceBillingStatusACTIVE
		var trialEndsAt pgtype.Timestamp
		if trialDays > 0 {
			// During the trial the period is the trial; nothing is billed
			// before it ends.
			periodEnd = anchor.Add(time.Duration(trialDays) * 24 * time.Hour)
			status, trialEndsAt = db.InstanceBillingStatusTRIAL, invoices.Timestamp(periodEnd)
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
		var row db.InstanceBilling
		if resubscribe {
			row, err = q.ResubscribeInstanceBilling(ctx, db.ResubscribeInstanceBillingParams{
				CustomerID: &customer.ID, InstanceSlug: instance.Slug, InstanceName: instance.Name,
				CustomerSlug: customer.Slug, CustomerName: customer.Name, Status: status,
				ProviderKind: kind, CollectionMethod: method, DaysUntilDue: cmd.DaysUntilDue,
				BaseLicensePriceID: base.ID, BillingPeriod: db.BillingPeriod(*base.BillingPeriod), Currency: base.Currency,
				AnchorAt: invoices.Timestamp(anchor), CurrentPeriodEnd: invoices.Timestamp(periodEnd), TrialEndsAt: trialEndsAt,
				UserID: user.ID, Now: invoices.Timestamp(now), ID: existing.ID, OrganizationID: user.OrganizationID,
			})
		} else {
			row, err = q.InsertInstanceBilling(ctx, db.InsertInstanceBillingParams{
				OrganizationID: user.OrganizationID, InstanceID: &instance.ID, CustomerID: &customer.ID,
				InstanceSlug: instance.Slug, InstanceName: instance.Name, CustomerSlug: customer.Slug,
				CustomerName: customer.Name, Status: status, ProviderKind: kind,
				CollectionMethod: method, DaysUntilDue: cmd.DaysUntilDue, BaseLicensePriceID: base.ID,
				BillingPeriod: db.BillingPeriod(*base.BillingPeriod), Currency: base.Currency,
				AnchorAt: invoices.Timestamp(anchor), CurrentPeriodEnd: invoices.Timestamp(periodEnd), TrialEndsAt: trialEndsAt,
				UserID: user.ID,
			})
		}
		if err != nil {
			return err
		}

		billing, err := subscriptions.Build(ctx, q, u.deps.Catalogue, row)
		if err != nil {
			return err
		}
		started = &StartedSubscription{InstanceBilling: *billing, ActivationInvoice: nil}

		// The first period's invoice: the base price in advance, when it bills
		// in advance. An all-arrears subscription has no ACTIVATION invoice.
		if status == db.InstanceBillingStatusTRIAL {
			return u.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(
				user.OrganizationID, events.InstanceBillingStarted.Name, events.InstanceBillingStarted.Type,
				BillingStarted{InstanceBilling: *billing, Resubscribed: resubscribe}, nil))
		}
		var held []ports.BillableAddon
		if u.deps.Addons != nil {
			held, err = u.deps.Addons.BillableAddons(ctx, user.OrganizationID, instance.ID, *base.BillingPeriod)
			if err != nil {
				return err
			}
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
			redeemed, err := u.deps.Discounts.Discounts(ctx, user.OrganizationID, instance.ID, now)
			if err != nil {
				return err
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
			invoice, err := invoices.Insert(ctx, q, invoices.Draft{
				Subscription: row, LicenseID: license.ID, LicenseSlug: license.Slug, BillingEmail: customer.BillingEmail,
				Kind: rating.KindActivation, BoundaryAt: anchor, Composition: composition,
				Terms: subscriptions.Terms(row, defaults), Hold: nil, ReplacesInvoiceID: nil,
				Pushes: u.deps.Pushes(row.ProviderKind), Now: now,
			})
			if kaitenerrors.IsUniqueViolationOnConstraint(err, boundaryConstraint) {
				return kaitenerrors.Conflict(operation+".BoundaryConflict",
					"an invoice of this subscription already bills a period starting at this instant: start at another one")
			}
			if err != nil {
				return err
			}
			summary := invoices.Summary(invoice)
			started.ActivationInvoice = &summary
			if err := invoices.AnnounceComposed(ctx, u.outbox, invoice); err != nil {
				return err
			}
			if err := metering.Consume(ctx, u.deps.Discounts, user.OrganizationID, composition, now); err != nil {
				return err
			}
		}

		return u.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(
			user.OrganizationID, events.InstanceBillingStarted.Name, events.InstanceBillingStarted.Type,
			BillingStarted{InstanceBilling: *billing, Resubscribed: resubscribe}, nil))
	})
	if err != nil {
		return nil, err
	}
	return started, nil
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
	if cmd.CollectionMethod != nil {
		method = *cmd.CollectionMethod
	}
	if kind == db.BillingProviderKindNOOP && method == settings.SendInvoice {
		return kind, nil
	}
	conn, err := providers.Connect(ctx, u.deps.Providers, organizationID, kind)
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
	clock, err := q.BillingClock(ctx)
	if err != nil {
		return "", err
	}
	email := ""
	if customer.BillingEmail != nil {
		email = *customer.BillingEmail
	}
	if _, err := providers.EnsureCustomer(ctx, q, conn, organizationID,
		providers.Customer{ID: customer.ID, Name: customer.Name, Email: email}, u.deps.ProviderTimeout, clock.Time.UTC()); err != nil {
		return "", providers.APIError(operation, err)
	}
	return kind, nil
}
