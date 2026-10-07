package updateinstancebilling

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/lifecycle"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/providers"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/settings"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscriptions"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "UpdateInstanceBilling"

// Command is a change of terms. A member that is not Set is left as it is; a
// Set member without a value goes back to the organization's default.
type Command struct {
	// ProviderKind, when set, moves the subscription to another payment
	// provider, from its next invoice on.
	ProviderKind     *string
	CollectionMethod Optional[string]
	DaysUntilDue     Optional[int32]
}

// Optional is a PATCH member: absent, null, or a value.
type Optional[T any] struct {
	Set   bool
	Value *T
}

type UseCase struct {
	deps   access.Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps access.Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// checkProvider checks the provider the subscription would bill through, and
// for a provider that pushes invoices, makes sure it knows the customer:
// synchronously, before the change is written. It returns the provider to
// move to, or nil to keep the current one.
func (u *UseCase) checkProvider(ctx context.Context, organizationID uuid.UUID, instanceSlug string, cmd Command) (*db.BillingProviderKind, error) {
	q := u.deps.Queries(ctx)
	sub, err := lifecycle.Lock(ctx, q, organizationID, instanceSlug, operation)
	if err != nil {
		return nil, err
	}
	kind := sub.ProviderKind
	var target *db.BillingProviderKind
	if cmd.ProviderKind != nil && db.BillingProviderKind(*cmd.ProviderKind) != sub.ProviderKind {
		kind = db.BillingProviderKind(*cmd.ProviderKind)
		target = &kind
	}
	defaults, err := settings.Read(ctx, q, organizationID)
	if err != nil {
		return nil, err
	}
	method := subscriptions.Terms(sub, defaults).CollectionMethod
	if cmd.CollectionMethod.Set {
		method = defaults.DefaultCollectionMethod
		if cmd.CollectionMethod.Value != nil {
			method = *cmd.CollectionMethod.Value
		}
	}
	if method == settings.SendInvoice && target == nil {
		return nil, nil
	}
	conn, err := providers.Connect(ctx, u.deps.Providers, organizationID, kind)
	if err != nil {
		return nil, providers.APIError(operation, err)
	}
	capabilities := conn.Adapter.Capabilities()
	if method != settings.SendInvoice && !capabilities.ChargeAutomatically {
		return nil, kaitenerrors.UnprocessableEntity(operation+".CollectionMethodUnsupported",
			"only SEND_INVOICE is available: the payment provider cannot charge automatically")
	}
	if method == settings.ChargeAutomatically && capabilities.PushesInvoices && sub.CustomerID != nil {
		if err := providers.RequirePaymentMethod(ctx, q, organizationID, *sub.CustomerID, kind, operation); err != nil {
			return nil, err
		}
	}
	if target == nil || !capabilities.PushesInvoices {
		return target, nil
	}
	if !capabilities.AcceptsCurrency(sub.Currency) {
		return nil, kaitenerrors.UnprocessableEntityf(operation+".UnsupportedCurrency", "the payment provider does not accept %s", sub.Currency)
	}
	if sub.CustomerID == nil {
		return nil, kaitenerrors.Conflict(operation+".CustomerMissing", "the subscription's customer was deleted")
	}
	customer, err := q.GetBillingCustomer(ctx, db.GetBillingCustomerParams{OrganizationID: organizationID, ID: *sub.CustomerID})
	if err != nil {
		return nil, err
	}
	if method == settings.SendInvoice && (customer.BillingEmail == nil || *customer.BillingEmail == "") {
		return nil, kaitenerrors.UnprocessableEntity(operation+".BillingEmailMissing",
			"the customer has no billing e-mail: the payment provider sends the invoices there")
	}
	now, err := lifecycle.Now(ctx, q)
	if err != nil {
		return nil, err
	}
	if _, err := providers.EnsureCustomer(ctx, q, conn, organizationID, providers.Customer{
		ID: customer.ID, Name: customer.Name, Email: *customer.BillingEmail,
	}, u.deps.ProviderTimeout, now); err != nil {
		return nil, providers.APIError(operation, err)
	}
	return target, nil
}

// Execute changes the subscription's own terms, and its payment provider,
// from its next invoice on; invoices already composed keep theirs, and keep
// routing to the provider that issued them. A terms-only change records no
// event: it is kept by the row's updated_by_id and updated_at; a provider
// change records INSTANCE_BILLING_PROVIDER_CHANGED.
func (u *UseCase) Execute(ctx context.Context, instanceSlug string, cmd Command) (*subscriptions.InstanceBilling, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	if v := cmd.DaysUntilDue.Value; v != nil && (*v < 0 || *v > 365) {
		return nil, kaitenerrors.UnprocessableEntity(operation+".InvalidDaysUntilDue", "daysUntilDue is between 0 and 365")
	}
	target, err := u.checkProvider(ctx, user.OrganizationID, instanceSlug, cmd)
	if err != nil {
		return nil, err
	}
	var result *subscriptions.InstanceBilling
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := u.deps.Queries(ctx)
		sub, err := lifecycle.Lock(ctx, q, user.OrganizationID, instanceSlug, operation)
		if err != nil {
			return err
		}
		if !subscriptions.Live(sub.Status) {
			return kaitenerrors.Conflict(operation+".NotActive", "the subscription is canceled")
		}
		now, err := lifecycle.Now(ctx, q)
		if err != nil {
			return err
		}
		if err := lifecycle.BoundaryPending(operation, sub, now); err != nil {
			return err
		}
		method, days := sub.CollectionMethod, sub.DaysUntilDue
		if cmd.CollectionMethod.Set {
			method = nil
			if cmd.CollectionMethod.Value != nil {
				m := db.CollectionMethod(*cmd.CollectionMethod.Value)
				method = &m
			}
		}
		if cmd.DaysUntilDue.Set {
			days = cmd.DaysUntilDue.Value
		}
		updated, err := q.UpdateSubscriptionTerms(ctx, db.UpdateSubscriptionTermsParams{
			CollectionMethod: method, DaysUntilDue: days, UserID: user.ID, Now: invoices.Timestamp(now), ID: sub.ID,
		})
		if err != nil {
			return err
		}
		if target != nil && *target != sub.ProviderKind {
			if updated, err = q.SetSubscriptionProvider(ctx, db.SetSubscriptionProviderParams{
				ProviderKind: *target, UserID: user.ID, Now: invoices.Timestamp(now), ID: sub.ID,
			}); err != nil {
				return err
			}
			if err := u.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(user.OrganizationID,
				events.InstanceBillingProviderChanged.Name, events.InstanceBillingProviderChanged.Type,
				subscriptions.ProviderChange{
					InstanceSlug: sub.InstanceSlug, From: string(sub.ProviderKind), To: string(*target), EffectiveFrom: "next_composition",
				}, nil)); err != nil {
				return err
			}
		}
		result, err = subscriptions.Build(ctx, q, u.deps.Catalogue, updated)
		return err
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}
