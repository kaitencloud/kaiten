// Package getcheckoutsession is GET /public/checkout-sessions/{sessionId}
// (§14.8): an anonymous checkout session, as the ksc_ it was started with
// reads it -- so the page learns the outcome, up to 24 h after it closed.
package getcheckoutsession

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscribeinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/checkout"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/createcheckoutsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/sessions"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Payments reads the ACTIVATION of the instance a completion created.
type Payments interface {
	Activation(ctx context.Context, organizationID, instanceID uuid.UUID) (*invoices.Invoice, error)
}

// Deps is what the read needs.
type Deps struct {
	Uof        *uow.UnitOfWork
	Activation createcheckoutsession.Activation
	Payments   Payments
}

type UseCase struct{ deps Deps }

func NewUseCase(deps Deps) *UseCase { return &UseCase{deps: deps} }

// Execute reads the session. The authenticator has matched the ksc_ to it,
// so a missing row is one the retention removed since: the same 401 as an
// unknown token.
func (u *UseCase) Execute(ctx context.Context, organizationID, sessionID uuid.UUID) (*checkout.CheckoutSession, error) {
	row, err := db.New(u.deps.Uof.DBTX(ctx)).GetCheckoutSession(ctx, db.GetCheckoutSessionParams{OrganizationID: organizationID, ID: sessionID})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, kaitenerrors.Unauthorized("PublicAuth.InvalidCredential", "invalid credential")
	}
	if err != nil {
		return nil, err
	}
	return Read(ctx, u.deps.Activation, u.deps.Payments, row)
}

// Read shows a session row as the API returns it: an OPEN session past its
// expiry reads ABANDONED before billing-lifecycle step (f) marks it, and
// dueToday is priced again from the stored selection, the prices of a
// published version being immutable (D-46).
func Read(ctx context.Context, activation createcheckoutsession.Activation, payments Payments, row db.GetCheckoutSessionRow) (*checkout.CheckoutSession, error) {
	var selection checkout.Selection
	if err := json.Unmarshal(row.Selection, &selection); err != nil {
		return nil, err
	}
	status := string(row.Status)
	if row.Lapsed {
		status = checkout.StatusAbandoned
	}
	out := &checkout.CheckoutSession{
		SessionID: row.ID, Status: status, Email: row.Email, ClientReferenceID: row.ClientReferenceID,
		LicenseSlug: row.LicenseSlug, BillingPeriod: "", PriceID: row.LicensePriceID,
		AddOns: make([]checkout.SessionAddonSelection, 0, len(selection.AddOns)),
		DueToday: sessions.DueToday{
			Currency: row.Currency, Subtotal: row.DueTodayMinor, DiscountTotal: 0, Total: row.DueTodayMinor, Lines: []sessions.SessionLine{},
		},
		TrialEndsAt: selection.TrialEndsAt, TrialRefusedReason: row.TrialRefusedReason,
		RequiresPaymentMethod: false, ExpiresAt: row.ExpiresAt.Time.UTC(),
		CustomerSlug: row.CustomerSlug, InstanceSlug: row.InstanceSlug, ActivationInvoice: nil, Payment: nil,
		CreatedAt: row.CreatedAt.Time.UTC(), CompletedAt: nil,
	}
	if row.PriceBillingPeriod != nil {
		out.BillingPeriod = string(*row.PriceBillingPeriod)
	}
	if row.CompletedAt.Valid {
		completed := row.CompletedAt.Time.UTC()
		out.CompletedAt = &completed
	}
	addOns := make([]subscribeinstance.SubscriptionAddon, 0, len(selection.AddOns))
	for _, addon := range selection.AddOns {
		out.AddOns = append(out.AddOns, checkout.SessionAddonSelection{AddonSlug: addon.AddonSlug, Quantity: addon.Quantity})
		addOns = append(addOns, subscribeinstance.SubscriptionAddon{AddonSlug: addon.AddonSlug, Quantity: addon.Quantity})
	}
	if selection.TrialEndsAt == nil && row.DueTodayMinor > 0 {
		none := int32(0)
		preview, err := activation.PreviewActivation(ctx, row.OrganizationID, subscribeinstance.PreviewCommand{
			BasePriceID: row.LicensePriceID, AddOns: addOns, TrialDays: &none,
		})
		if err != nil {
			return nil, err
		}
		out.DueToday = sessions.DueToday{
			Currency: preview.Currency, Subtotal: preview.Composition.Subtotal, DiscountTotal: preview.Composition.DiscountTotal,
			Total: preview.Composition.Total, Lines: sessions.LinesFrom(preview.Composition.Lines),
		}
	}
	free := row.LicensePricingType == db.PricingTypeFREE
	out.RequiresPaymentMethod = !free && (out.DueToday.Total > 0 || row.LicenseRequiresPaymentMethod)
	// Once completed, the payment of the ACTIVATION it issued, if any.
	if row.InstanceID != nil && payments != nil {
		invoice, err := payments.Activation(ctx, row.OrganizationID, *row.InstanceID)
		if err != nil {
			return nil, err
		}
		if invoice != nil {
			shown := sessions.InvoiceFrom(*invoice)
			status, hosted := sessions.PaymentOf(*invoice)
			out.ActivationInvoice, out.Payment = &shown, &checkout.CheckoutPayment{Status: status, HostedInvoiceURL: hosted}
		}
	}
	return out, nil
}
