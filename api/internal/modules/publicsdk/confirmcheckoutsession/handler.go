// Package confirmcheckoutsession is POST
// /public/checkout-sessions/{sessionId}/confirm (§14.8, §9.12): it completes
// an anonymous checkout -- the customer, the instance and the subscription,
// in one transaction under system:kaiten -- once nothing stands between the
// visitor and the plan.
//
// A FREE plan (§9.12 rule 8), a trial on a licence that requires no payment
// method (rule 7) and anything else with nothing to capture complete at once.
// Otherwise the confirm opens a hosted setup page with no provider customer
// (§12.9 step 1) and answers requires_payment_method; the confirm after it
// completes, adopting the provider customer the page created. With an amount
// due, the session waits for its ACTIVATION's payment (AWAITING_PAYMENT),
// whose transaction completes it.
package confirmcheckoutsession

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/url"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/checkoutsetup"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscribeinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/createcustomer"
	customerschema "github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/createinstance"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/checkout"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/checkoutprogress"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/createcheckoutsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/getcheckoutsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/getpubliccatalog"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/sessions"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
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
		PushInline(ctx context.Context, started *subscribeinstance.StartedSubscription)
	}
	// Setup is the provider side of the checkout (§12.9).
	Setup interface {
		Open(ctx context.Context, organizationID uuid.UUID, operation string, req checkoutsetup.Request) (checkoutsetup.Page, error)
		Read(ctx context.Context, organizationID uuid.UUID, operation string, checkoutSessionID uuid.UUID, setupSessionID string) (checkoutsetup.Setup, error)
		Adopt(ctx context.Context, organizationID uuid.UUID, operation string, setup checkoutsetup.Setup) (checkoutsetup.Adopted, error)
		Link(ctx context.Context, organizationID, customerID uuid.UUID, customerSlug string, adopted checkoutsetup.Adopted) error
		Stamp(ctx context.Context, organizationID, checkoutSessionID, customerID uuid.UUID, adopted checkoutsetup.Adopted)
		getcheckoutsession.Payments
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
	Setup         Setup
	UsageReporter services.UsageReporter
	// Limits bound the visitor's confirms (§14.3); a job's completion is not
	// counted.
	Limits *checkout.Limits
	// Vouchers checks the selection's voucher again (§11.4, §14.8 rule 5).
	Vouchers createcheckoutsession.Vouchers
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

// errNothingToComplete is a job's completion that has nothing to do: the
// session is no longer OPEN, has no setup, or its setup is not complete.
var errNothingToComplete = errors.New("confirm: nothing to complete")

// Visitor is who confirms: the key that started the session, and the
// visitor's address as the gateway saw it.
type Visitor struct {
	PublishableKeyID uuid.UUID
	RemoteIP         string
}

// Execute confirms the session. The principal ctx carries is system:kaiten
// in the session's organization: the completion's rows are its.
func (u *UseCase) Execute(ctx context.Context, organizationID, sessionID uuid.UUID, visitor Visitor) (*checkout.CheckoutConfirmation, error) {
	if err := u.deps.Limits.Take(ctx, operation, visitor.PublishableKeyID, visitor.RemoteIP); err != nil {
		return nil, err
	}
	out, err := u.confirm(ctx, organizationID, sessionID, false)
	if errors.Is(err, errTrialTaken) {
		// Once: the session now has no trial to lose.
		return u.confirm(ctx, organizationID, sessionID, false)
	}
	return out, err
}

// Complete is the completion a job runs (§12.9 step 3): the sync backstop,
// for a setup the visitor finished without coming back, and billing-lifecycle
// step (f), for a session OPEN past its expiry. It completes only a session
// whose hosted setup the provider reports complete; it opens no setup page,
// accepts a session past its expiry, and leaves the ACTIVATION to the push
// queue. Whether it completed the session; a refusal is returned as the
// confirm would answer it, the session left OPEN.
func (u *UseCase) Complete(ctx context.Context, organizationID, sessionID uuid.UUID) (bool, error) {
	_, err := u.confirm(ctx, organizationID, sessionID, true)
	if errors.Is(err, errTrialTaken) {
		_, err = u.confirm(ctx, organizationID, sessionID, true)
	}
	if errors.Is(err, errNothingToComplete) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	row, err := db.New(u.deps.Uof.DBTX(ctx)).GetCheckoutSession(ctx, db.GetCheckoutSessionParams{OrganizationID: organizationID, ID: sessionID})
	if err != nil {
		return false, err
	}
	return row.Status != db.CheckoutSessionStatusOPEN, nil
}

func (u *UseCase) confirm(ctx context.Context, organizationID, sessionID uuid.UUID, job bool) (*checkout.CheckoutConfirmation, error) {
	q := db.New(u.deps.Uof.DBTX(ctx))
	row, err := q.GetCheckoutSession(ctx, db.GetCheckoutSessionParams{OrganizationID: organizationID, ID: sessionID})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, kaitenerrors.Unauthorized("PublicAuth.InvalidCredential", "invalid credential")
	}
	if err != nil {
		return nil, err
	}
	if job && row.Status != db.CheckoutSessionStatusOPEN {
		return nil, errNothingToComplete
	}
	if row.Status == db.CheckoutSessionStatusAWAITINGPAYMENT {
		// Completed already, the session waits for its payment: answered as
		// it now is.
		return u.answer(ctx, organizationID, sessionID, nil)
	}
	// A job completes a session past its expiry (step (f)); a visitor's
	// confirm does not.
	if !job {
		if err := closed(row); err != nil {
			return nil, err
		}
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
	// The voucher, checked again against the selection: up to 24 h passed.
	// What the completion redeems is what this check accepted; the
	// redemption does not check it again (§11.4).
	var voucherCode, pricedCode *string
	var voucher *catalogue.Voucher
	if selection.Voucher != nil {
		code := selection.Voucher.Code
		if voucher, err = createcheckoutsession.SelectedVoucher(ctx, u.deps.Vouchers, operation, organizationID, code, row.LicensePriceID, selection.AddOns); err != nil {
			return nil, err
		}
		voucherCode, pricedCode = &code, createcheckoutsession.PricedCode(voucher, code)
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
			if row.ExternalSetupSessionID != nil {
				// After a setup the visitor may have given a card for the
				// amount shown: it is never charged another one.
				return nil, dueTodayChanged()
			}
			if err := u.dropTrial(ctx, q, row, selection, addOns, pricedCode); err != nil {
				return nil, err
			}
			return u.confirm(ctx, organizationID, sessionID, job)
		}
	}
	var trialDays *int32
	if !trial {
		none := int32(0)
		trialDays = &none
	}
	preview, err := u.deps.Activation.PreviewActivation(ctx, organizationID, subscribeinstance.PreviewCommand{
		BasePriceID: row.LicensePriceID, AddOns: addOns, TrialDays: trialDays, VoucherCode: pricedCode,
	})
	if err != nil {
		return nil, voucherRefusal(err)
	}
	due := preview.Composition.Total
	if due > 0 && !createcheckoutsession.RecordableAtPayment(voucher) {
		return nil, createcheckoutsession.VoucherInvalid(operation)
	}
	// With an amount due the instance starts on the fallback family's free
	// version, and the payment moves it to the one bought (§9.12 rule 4
	// step 3). Checked before any setup, so no card is asked for in vain.
	instanceLicenseID := licenseID
	if due > 0 {
		fallback, err := q.GetCheckoutFallbackLicense(ctx, db.GetCheckoutFallbackLicenseParams{OrganizationID: organizationID, LicenseID: licenseID})
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.UnprocessableEntity(operation+".FallbackRequired",
				"this plan names no free fallback plan to start on until the payment")
		}
		if err != nil {
			return nil, err
		}
		instanceLicenseID = fallback
	}
	requiresMethod := !free && (due > 0 || plan.RequiresPaymentMethod)
	var adopted *checkoutsetup.Adopted
	if job && (!requiresMethod || row.ExternalSetupSessionID == nil) {
		return nil, errNothingToComplete // completed at its confirm, or never set up
	}
	if requiresMethod {
		setup, page, err := u.setup(ctx, q, row, job)
		if err != nil {
			return nil, err
		}
		if page != nil {
			return u.answer(ctx, organizationID, sessionID, page)
		}
		// What is charged is what the start showed (§9.12 rule 3, §24 #81).
		if due != row.DueTodayMinor {
			return nil, dueTodayChanged()
		}
		found, err := u.deps.Setup.Adopt(ctx, organizationID, operation, setup)
		if err != nil {
			return nil, err
		}
		adopted = &found
	} else if due != row.DueTodayMinor {
		return nil, dueTodayChanged()
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
	if adopted != nil {
		providerKind = adopted.ProviderKind
	}
	var (
		started    *subscribeinstance.StartedSubscription
		customerID uuid.UUID
	)
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
				if adopted != nil {
					// The amount changes, and the card is captured already.
					return dueTodayChanged()
				}
				return errTrialTaken
			}
		}
		email := locked.Email
		customer, err := u.deps.Customers.Persist(ctx, organizationID, user.ID, &createcustomer.Command{Name: email, BillingEmail: &email})
		if err != nil {
			return err
		}
		customerID = customer.ID
		now := time.Now().UTC()
		instance, err := u.deps.Instances.Persist(ctx, organizationID, user.ID, &createinstance.Command{
			Name: email, Description: "", CustomerID: customer.ID, LicenseID: instanceLicenseID,
			StartLicenseDate: now, EndLicenseDate: now.Add(licenceHorizon), Metadata: map[string]interface{}{},
		})
		if err != nil {
			return err
		}
		instanceSlug = instance.Slug
		if adopted != nil {
			if err := u.deps.Setup.Link(ctx, organizationID, customer.ID, customer.Slug, *adopted); err != nil {
				return err
			}
		}
		cmd := subscribeinstance.Command{
			BasePriceID: row.LicensePriceID, ProviderKind: "NOOP", CollectionMethod: ptr("SEND_INVOICE"),
			TrialDays: trialDays, AddOns: addOns, VoucherCode: voucherCode, AllowMissingPaymentMethod: adopted == nil,
		}
		if !free && providerKind != "" {
			cmd.ProviderKind, cmd.CollectionMethod = providerKind, ptr("CHARGE_AUTOMATICALLY")
		}
		if due > 0 {
			// A job leaves the ACTIVATION to the push queue (§12.9 step 3.5).
			cmd.Incomplete, cmd.MoveToLicenseID, cmd.CallerPushes = true, &licenseID, !job
		}
		if started, err = u.deps.Subscriber.Execute(ctx, instance.Slug, cmd); err != nil {
			return voucherRefusal(err)
		}
		if due > 0 {
			_, err := q.AwaitCheckoutPayment(ctx, db.AwaitCheckoutPaymentParams{
				CustomerID: &customer.ID, InstanceID: &instance.ID, OrganizationID: organizationID, ID: sessionID,
			})
			return err
		}
		if _, err := q.CompleteCheckoutSession(ctx, db.CompleteCheckoutSessionParams{
			CustomerID: &customer.ID, InstanceID: &instance.ID, OrganizationID: organizationID, ID: sessionID,
		}); err != nil {
			return err
		}
		done, err := q.GetCheckoutSession(ctx, db.GetCheckoutSessionParams{OrganizationID: organizationID, ID: sessionID})
		if err != nil {
			return err
		}
		return u.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(organizationID,
			events.CheckoutSessionCompleted.Name, events.CheckoutSessionCompleted.Type,
			checkoutprogress.Event(done, checkout.StatusCompleted), nil))
	})
	if err != nil {
		compensate()
		return nil, err
	}
	if instanceSlug != "" {
		switch {
		case adopted != nil:
			// The provider customer the page created carries the Kaiten ids
			// from now on (§12.9 step 3.4).
			u.deps.Setup.Stamp(ctx, organizationID, sessionID, customerID, *adopted)
		case !free && providerKind != "":
			// Without a setup, on a provider that pushes invoices, the
			// provider customer is created now, outside the transaction that
			// created the Kaiten one (§9.12 rule 5). A failure undoes nothing.
			if err := u.deps.Subscriber.EnsureProviderCustomer(ctx, organizationID, instanceSlug, providerKind); err != nil {
				slog.WarnContext(ctx, "anonymous checkout: the provider customer will be ensured later", "session_id", sessionID, "error", err)
			}
		}
		if started != nil && due > 0 && !job {
			// Its payment, when it is immediate, completes the session.
			u.deps.Subscriber.PushInline(ctx, started)
		}
	}
	if job {
		return nil, nil //nolint:nilnil // a job reads the session itself
	}
	return u.answer(ctx, organizationID, sessionID, nil)
}

// setup runs the setup page of a session that needs a payment method (§12.9
// steps 1 and 3.1): opened when there is none, or a replacement when it
// expired, and answered as a page while the visitor has not completed it.
// Once completed, the setup is returned for the completion.
func (u *UseCase) setup(ctx context.Context, q *db.Queries, row db.GetCheckoutSessionRow, job bool) (checkoutsetup.Setup, *checkoutsetup.Page, error) {
	replaces := ""
	if row.ExternalSetupSessionID != nil {
		setup, err := u.deps.Setup.Read(ctx, row.OrganizationID, operation, row.ID, *row.ExternalSetupSessionID)
		if err != nil {
			return checkoutsetup.Setup{}, nil, err
		}
		switch {
		case setup.Complete:
			if !row.SetupCompletedAt.Valid {
				if err := q.MarkCheckoutSetupCompleted(ctx, db.MarkCheckoutSetupCompletedParams{OrganizationID: row.OrganizationID, ID: row.ID}); err != nil {
					return checkoutsetup.Setup{}, nil, err
				}
			}
			return setup, nil, nil
		case job:
			return checkoutsetup.Setup{}, nil, errNothingToComplete // a job never opens a page
		case !setup.Expired:
			return setup, &setup.Page, nil
		}
		replaces = *row.ExternalSetupSessionID
	}
	page, err := u.deps.Setup.Open(ctx, row.OrganizationID, operation, checkoutsetup.Request{
		CheckoutSessionID: row.ID, Email: row.Email, Currency: row.Currency, ReturnURL: returnURL(row.ReturnUrl, row.ID),
		ExpiresAt: row.ExpiresAt.Time.UTC(), Replaces: replaces,
	})
	if err != nil {
		return checkoutsetup.Setup{}, nil, err
	}
	// Stored before the page is handed out (INV-03).
	if err := q.SetCheckoutSetupSession(ctx, db.SetCheckoutSetupSessionParams{
		ExternalSetupSessionID: &page.SessionID, OrganizationID: row.OrganizationID, ID: row.ID,
	}); err != nil {
		return checkoutsetup.Setup{}, nil, err
	}
	return checkoutsetup.Setup{}, &page, nil
}

// answer is the session as it now reads, with the setup page to send the
// visitor to when there is one.
func (u *UseCase) answer(ctx context.Context, organizationID, sessionID uuid.UUID, page *checkoutsetup.Page) (*checkout.CheckoutConfirmation, error) {
	final, err := getcheckoutsession.Load(ctx, db.New(u.deps.Uof.DBTX(ctx)), u.deps.Setup, organizationID, sessionID)
	if err != nil {
		return nil, err
	}
	session, err := getcheckoutsession.Read(ctx, u.deps.Activation, u.deps.Setup, final)
	if err != nil {
		return nil, err
	}
	out := &checkout.CheckoutConfirmation{Status: checkout.ConfirmCompleted, SetupURL: nil, SetupExpiresAt: nil, Session: *session}
	switch {
	case page != nil:
		expires := page.ExpiresAt
		out.Status, out.SetupURL, out.SetupExpiresAt = checkout.ConfirmRequiresPaymentMethod, &page.URL, &expires
	case final.Status == db.CheckoutSessionStatusAWAITINGPAYMENT:
		out.Status = checkout.ConfirmAwaitingPayment
	}
	return out, nil
}

// returnURL is where the provider sends the visitor back: the session's
// returnUrl, naming the session, which nothing trusts (§12.9 step 1).
func returnURL(raw string, sessionID uuid.UUID) string {
	parsed, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	query := parsed.Query()
	query.Set("kaiten_checkout_session", sessionID.String())
	parsed.RawQuery = query.Encode()
	return parsed.String()
}

func dueTodayChanged() error {
	return kaitenerrors.Conflict(operation+".DueTodayChanged", "what is due today changed since the start: start again to see the new amount")
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
	}
	return kaitenerrors.ConflictWithErrors(operation+".SessionClosed", "this checkout session is closed: start a new one",
		&kaitenerrors.ErrorDetail{Message: "the session's status", Location: "path.sessionId", Value: map[string]any{"status": status}})
}

// dropTrial reprices an OPEN session without its trial, before any setup.
func (u *UseCase) dropTrial(ctx context.Context, q *db.Queries, row db.GetCheckoutSessionRow, selection checkout.Selection,
	addOns []subscribeinstance.SubscriptionAddon, pricedCode *string,
) error {
	none := int32(0)
	preview, err := u.deps.Activation.PreviewActivation(ctx, row.OrganizationID, subscribeinstance.PreviewCommand{
		BasePriceID: row.LicensePriceID, AddOns: addOns, TrialDays: &none, VoucherCode: pricedCode,
	})
	if err != nil {
		return voucherRefusal(err)
	}
	selection.TrialEndsAt = nil
	selection.DueToday = &sessions.DueToday{
		Currency: preview.Currency, Subtotal: preview.Composition.Subtotal, DiscountTotal: preview.Composition.DiscountTotal,
		Total: preview.Composition.Total, Lines: sessions.LinesFrom(preview.Composition.Lines),
	}
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

// voucherRefusal answers the subscribe's refusal of the voucher as the
// checkout's own, opaque (§14.8 rule 5).
func voucherRefusal(err error) error {
	if kaitenerrors.GetCode(err) == "SubscribeInstance.VoucherInvalid" {
		return createcheckoutsession.VoucherInvalid(operation)
	}
	return err
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
