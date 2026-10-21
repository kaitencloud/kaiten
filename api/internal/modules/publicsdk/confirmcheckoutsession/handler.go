// Package confirmcheckoutsession is POST
// /public/checkout-sessions/{sessionId}/confirm (§14.8, §9.12): it completes
// an anonymous checkout -- the customer, the instance and the subscription,
// in one transaction under system:kaiten -- once nothing stands between the
// visitor and the plan.
//
// Built so far: the completions that need no payment method, a FREE plan
// (§9.12 rule 8) and a trial on a licence that requires none (rule 7). A
// session that needs a payment method answers 503 .ProviderUnavailable until
// the setup without a provider customer exists (Δ32-3.3).
package confirmcheckoutsession

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscribeinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/createcustomer"
	customerschema "github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/createinstance"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/checkout"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/createcheckoutsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/getcheckoutsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/getpubliccatalog"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "ConfirmCheckoutSession"

// licenceHorizon is the end date a Tier 2 instance is created with: the spec
// gives it none (§9.12 rule 4 step 3), the column requires one.
const licenceHorizon = 100 * 365 * 24 * time.Hour

// The other modules' operations the completion runs, through ports it owns.
type (
	CustomerCreator interface {
		Persist(ctx context.Context, orgID, userID uuid.UUID, command *createcustomer.Command) (*customerschema.Customer, error)
	}
	InstanceCreator interface {
		Persist(ctx context.Context, orgID, userID uuid.UUID, command *createinstance.Command) (*instanceschema.Instance, error)
	}
	Subscriber interface {
		Execute(ctx context.Context, instanceSlug string, cmd subscribeinstance.Command) (*subscribeinstance.StartedSubscription, error)
		EnsureProviderCustomer(ctx context.Context, organizationID uuid.UUID, instanceSlug, providerKind string) error
	}
)

// Deps is what the confirm needs.
type Deps struct {
	UserProvider  currentuser.Provider
	Uof           *uow.UnitOfWork
	Catalog       *getpubliccatalog.UseCase
	Activation    createcheckoutsession.Activation
	Customers     CustomerCreator
	Instances     InstanceCreator
	Subscriber    Subscriber
	UsageReporter services.UsageReporter
}

type UseCase struct {
	deps   Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// errTrialTaken is a trial another checkout consumed between the confirm's
// check and the completion's, under the e-mail's lock: rolled back, and the
// session repriced without it.
var errTrialTaken = errors.New("confirm: the trial was consumed meanwhile")

// Execute confirms the session. The principal ctx carries is system:kaiten
// in the session's organization: the completion's rows are its.
func (u *UseCase) Execute(ctx context.Context, organizationID, sessionID uuid.UUID) (*checkout.CheckoutConfirmation, error) {
	out, err := u.confirm(ctx, organizationID, sessionID)
	if errors.Is(err, errTrialTaken) {
		// Once: the session now has no trial to lose.
		return u.confirm(ctx, organizationID, sessionID)
	}
	return out, err
}

func (u *UseCase) confirm(ctx context.Context, organizationID, sessionID uuid.UUID) (*checkout.CheckoutConfirmation, error) {
	q := db.New(u.deps.Uof.DBTX(ctx))
	row, err := q.GetCheckoutSession(ctx, db.GetCheckoutSessionParams{OrganizationID: organizationID, ID: sessionID})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, kaitenerrors.Unauthorized("PublicAuth.InvalidCredential", "invalid credential")
	}
	if err != nil {
		return nil, err
	}
	if err := closed(row); err != nil {
		return nil, err
	}
	key, err := q.GetPublishableKeyCheckout(ctx, db.GetPublishableKeyCheckoutParams{OrganizationID: organizationID, ID: row.PublishableKeyID})
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	if err != nil || !key.AnonymousCheckout {
		return nil, kaitenerrors.Forbidden(operation+".AnonymousCheckoutDisabled", "this publishable key no longer starts anonymous checkouts")
	}
	var selection checkout.Selection
	if err := json.Unmarshal(row.Selection, &selection); err != nil {
		return nil, err
	}
	addOns := make([]subscribeinstance.SubscriptionAddon, 0, len(selection.AddOns))
	for _, a := range selection.AddOns {
		addOns = append(addOns, subscribeinstance.SubscriptionAddon{AddonSlug: a.AddonSlug, Quantity: a.Quantity})
	}

	// Re-validation (§9.12 rule 3): up to 24 h passed since the start.
	catalog, err := u.deps.Catalog.Execute(ctx, organizationID, getpubliccatalog.Query{FamilySlug: nil, IncludeAddOns: true, PublishableKeyID: nil})
	if err != nil {
		return nil, err
	}
	plan, price, ok := createcheckoutsession.FindPrice(catalog, row.LicensePriceID)
	if !ok {
		return nil, kaitenerrors.UnprocessableEntity(operation+".PriceNotPublic", "this price is no longer offered: start again")
	}
	free := plan.PricingType == "FREE"
	if err := createcheckoutsession.CheckPlan(ctx, operation, u.deps.Catalog, organizationID, catalog, plan, price, addOns, free); err != nil {
		return nil, err
	}
	licenseID, err := uuid.Parse(plan.LicenseID)
	if err != nil {
		return nil, err
	}

	// The trial, checked again before anything is captured: consumed
	// meanwhile, the session goes on without it.
	trial := selection.TrialEndsAt != nil
	if trial {
		consumed, err := q.TrialConsumedByEmail(ctx, db.TrialConsumedByEmailParams{OrganizationID: organizationID, LicenseID: licenseID, Email: row.Email})
		if err != nil {
			return nil, err
		}
		if consumed {
			if err := u.dropTrial(ctx, q, row, selection, addOns); err != nil {
				return nil, err
			}
			return u.confirm(ctx, organizationID, sessionID)
		}
	}
	var trialDays *int32
	if !trial {
		none := int32(0)
		trialDays = &none
	}
	preview, err := u.deps.Activation.PreviewActivation(ctx, organizationID, subscribeinstance.PreviewCommand{BasePriceID: row.LicensePriceID, AddOns: addOns, TrialDays: trialDays})
	if err != nil {
		return nil, err
	}
	if preview.Composition.Total != row.DueTodayMinor && row.SetupCompletedAt.Valid {
		return nil, kaitenerrors.Conflict(operation+".DueTodayChanged", "what is due today changed since the start: start again to see the new amount")
	}
	requiresMethod := !free && (preview.Composition.Total > 0 || plan.RequiresPaymentMethod)
	if requiresMethod {
		return nil, kaitenerrors.Unavailable(operation+".ProviderUnavailable",
			"saving a payment method for an anonymous checkout is not available yet: try again later").WithRetryAfter(30 * time.Second)
	}

	// The creation limits, enforced before the transaction and compensated
	// if it fails (§9.12 rule 3).
	user, err := u.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}
	compensate, err := u.enforceLimits(ctx, organizationID)
	if err != nil {
		return nil, err
	}
	providerKind, _ := u.deps.Catalog.CapturingProvider(ctx, organizationID)
	instanceSlug := ""
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := db.New(u.deps.Uof.DBTX(ctx))
		locked, err := q.LockCheckoutSession(ctx, db.LockCheckoutSessionParams{OrganizationID: organizationID, ID: sessionID})
		if err != nil {
			return err
		}
		if locked.CustomerID != nil || locked.Status != db.CheckoutSessionStatusOPEN {
			return nil // completed meanwhile, by another caller: answered as it now is
		}
		if trial {
			if err := q.LockTrialEmail(ctx, db.LockTrialEmailParams{OrganizationID: organizationID.String(), Email: locked.Email}); err != nil {
				return err
			}
			consumed, err := q.TrialConsumedByEmail(ctx, db.TrialConsumedByEmailParams{OrganizationID: organizationID, LicenseID: licenseID, Email: locked.Email})
			if err != nil {
				return err
			}
			if consumed {
				return errTrialTaken
			}
		}
		email := locked.Email
		customer, err := u.deps.Customers.Persist(ctx, organizationID, user.ID, &createcustomer.Command{Name: email, BillingEmail: &email})
		if err != nil {
			return err
		}
		now := time.Now().UTC()
		instance, err := u.deps.Instances.Persist(ctx, organizationID, user.ID, &createinstance.Command{
			Name: email, Description: "", CustomerID: customer.ID, LicenseID: licenseID,
			StartLicenseDate: now, EndLicenseDate: now.Add(licenceHorizon), Metadata: map[string]interface{}{},
		})
		if err != nil {
			return err
		}
		instanceSlug = instance.Slug
		cmd := subscribeinstance.Command{
			BasePriceID: row.LicensePriceID, ProviderKind: "NOOP", CollectionMethod: ptr("SEND_INVOICE"),
			TrialDays: trialDays, AddOns: addOns, AllowMissingPaymentMethod: true,
		}
		if !free && providerKind != "" {
			cmd.ProviderKind, cmd.CollectionMethod = providerKind, ptr("CHARGE_AUTOMATICALLY")
		}
		if _, err := u.deps.Subscriber.Execute(ctx, instance.Slug, cmd); err != nil {
			return err
		}
		done, err := q.CompleteCheckoutSession(ctx, db.CompleteCheckoutSessionParams{
			CustomerID: &customer.ID, InstanceID: &instance.ID, OrganizationID: organizationID, ID: sessionID,
		})
		if err != nil {
			return err
		}
		return u.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(organizationID,
			events.CheckoutSessionCompleted.Name, events.CheckoutSessionCompleted.Type, checkout.SessionEvent{
				SessionID: done.ID, Email: done.Email, ClientReferenceID: done.ClientReferenceID, LicenseSlug: plan.LicenseSlug,
				BillingPeriod: string(deref(row.PriceBillingPeriod)), CustomerSlug: &customer.Slug, InstanceSlug: &instance.Slug,
				Status: checkout.StatusCompleted,
			}, nil))
	})
	if err != nil {
		compensate()
		return nil, err
	}
	// Without a setup, on a provider that pushes invoices, the provider
	// customer is created now, outside the transaction that created the
	// Kaiten one (§9.12 rule 5). A failure undoes nothing.
	if instanceSlug != "" && !free && providerKind != "" {
		if err := u.deps.Subscriber.EnsureProviderCustomer(ctx, organizationID, instanceSlug, providerKind); err != nil {
			slog.WarnContext(ctx, "anonymous checkout: the provider customer will be ensured later", "session_id", sessionID, "error", err)
		}
	}
	final, err := q.GetCheckoutSession(ctx, db.GetCheckoutSessionParams{OrganizationID: organizationID, ID: sessionID})
	if err != nil {
		return nil, err
	}
	session, err := getcheckoutsession.Read(ctx, u.deps.Activation, final)
	if err != nil {
		return nil, err
	}
	return &checkout.CheckoutConfirmation{Status: checkout.ConfirmCompleted, SetupURL: nil, SetupExpiresAt: nil, Session: *session}, nil
}

// closed refuses a session that can no longer be confirmed (§14.8 confirm
// rule 6), its status in errors[0].value.
func closed(row db.GetCheckoutSessionRow) error {
	status := string(row.Status)
	if row.Lapsed {
		status = checkout.StatusAbandoned
	}
	switch status {
	case checkout.StatusOpen:
		return nil
	case checkout.StatusAwaitingPayment:
		// Answered as it now is by the payment's path (Δ32-3.3).
		return kaitenerrors.Conflict(operation+".SessionClosed", "this session waits for its payment")
	}
	return kaitenerrors.ConflictWithErrors(operation+".SessionClosed", "this checkout session is closed: start a new one",
		&kaitenerrors.ErrorDetail{Message: "the session's status", Location: "path.sessionId", Value: map[string]any{"status": status}})
}

// dropTrial reprices an OPEN session without its trial, before any setup.
func (u *UseCase) dropTrial(ctx context.Context, q *db.Queries, row db.GetCheckoutSessionRow, selection checkout.Selection, addOns []subscribeinstance.SubscriptionAddon) error {
	none := int32(0)
	preview, err := u.deps.Activation.PreviewActivation(ctx, row.OrganizationID, subscribeinstance.PreviewCommand{BasePriceID: row.LicensePriceID, AddOns: addOns, TrialDays: &none})
	if err != nil {
		return err
	}
	selection.TrialEndsAt = nil
	stored, err := json.Marshal(selection)
	if err != nil {
		return err
	}
	reason := checkout.TrialRefusedAlreadyConsumed
	return q.RepriceCheckoutSession(ctx, db.RepriceCheckoutSessionParams{
		TrialRefusedReason: &reason, Selection: stored, DueTodayMinor: preview.Composition.Total,
		OrganizationID: row.OrganizationID, ID: row.ID,
	})
}

// enforceLimits reports a customer and an instance to the organization's
// creation limits, and answers how to give them back if the completion fails.
func (u *UseCase) enforceLimits(ctx context.Context, organizationID uuid.UUID) (func(), error) {
	const message = "this organization cannot create more customers or instances"
	customers, err := dogfooding.EnforceCreationLimit(ctx, u.deps.UsageReporter, organizationID, dogfooding.CustomerEntitlementSlug,
		operation+".EntitlementLimitReached", message, nil)
	if err != nil {
		return nil, err
	}
	instances, err := dogfooding.EnforceCreationLimit(ctx, u.deps.UsageReporter, organizationID, dogfooding.InstanceEntitlementSlug,
		operation+".EntitlementLimitReached", message, nil)
	if err != nil {
		dogfooding.CompensateEnforcement(ctx, u.deps.UsageReporter, customers, organizationID, dogfooding.CustomerEntitlementSlug)
		return nil, err
	}
	return func() {
		dogfooding.CompensateEnforcement(context.WithoutCancel(ctx), u.deps.UsageReporter, customers, organizationID, dogfooding.CustomerEntitlementSlug)
		dogfooding.CompensateEnforcement(context.WithoutCancel(ctx), u.deps.UsageReporter, instances, organizationID, dogfooding.InstanceEntitlementSlug)
	}, nil
}

func ptr[T any](v T) *T { return &v }

func deref[T any](v *T) T {
	var zero T
	if v == nil {
		return zero
	}
	return *v
}
