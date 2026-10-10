package sessions

import (
	"time"

	"github.com/danielgtaylor/huma/v2"

	addoncatalogue "github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscriptions"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/getpubliccatalog"
	"github.com/kaitencloud/kaiten/api/internal/shared/nullable"
)

// SessionInvoice is an invoice as a vendor's customer sees it (§14.4): what it
// bills and how to pay it, without the vendor's bookkeeping -- no handoff, no
// reconciliation, no provider ids.
type SessionInvoice struct {
	ID                    string        `json:"id" format:"uuid"`
	Kind                  string        `json:"kind" enum:"ACTIVATION,RENEWAL,FINAL"`
	Status                string        `json:"status" enum:"MANUAL,PUSHED,PAID,PAYMENT_FAILED,UNCOLLECTIBLE,VOID" doc:"PUSHED: issued and awaiting payment. PAYMENT_FAILED: a charge failed; pay on hostedInvoiceUrl. MANUAL: issued, the vendor collects it."`
	Currency              string        `json:"currency" example:"EUR"`
	Subtotal              int64         `json:"subtotal" doc:"Minor units"`
	DiscountTotal         int64         `json:"discountTotal" doc:"Minor units"`
	Total                 int64         `json:"total" doc:"Minor units"`
	IssuedAt              *time.Time    `json:"issuedAt"`
	DueAt                 *time.Time    `json:"dueAt"`
	PaidAt                *time.Time    `json:"paidAt"`
	ServiceFrom           time.Time     `json:"serviceFrom"`
	ServiceTo             time.Time     `json:"serviceTo"`
	ProviderInvoiceNumber *string       `json:"providerInvoiceNumber"`
	ExternalReference     *string       `json:"externalReference" doc:"The vendor's own number for an invoice it collects itself"`
	HostedInvoiceURL      *string       `json:"hostedInvoiceUrl" doc:"Where the customer pays the invoice, or confirms a payment that needs authenticating"`
	InvoicePDFURL         *string       `json:"invoicePdfUrl"`
	Lines                 []SessionLine `json:"lines" nullable:"false"`
}

// SessionLine is one line of a SessionInvoice.
type SessionLine struct {
	Seq               int       `json:"seq"`
	Type              string    `json:"type" enum:"BASE,ADDON,USAGE,OVERAGE,DISCOUNT"`
	Label             string    `json:"label"`
	Description       string    `json:"description"`
	Quantity          string    `json:"quantity" doc:"In sale units, a decimal string"`
	UnitAmountDecimal *string   `json:"unitAmountDecimal" doc:"Minor units; null on a DISCOUNT line"`
	Amount            int64     `json:"amount" doc:"Minor units; negative on a DISCOUNT line"`
	ServiceFrom       time.Time `json:"serviceFrom"`
	ServiceTo         time.Time `json:"serviceTo"`
}

// TransformSchema publishes SessionLine's absent members as null (§13.15).
func (SessionLine) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	return nullable.Pointers(s, SessionLine{})
}

// InvoiceFrom shows an invoice as a session does.
func InvoiceFrom(invoice invoices.Invoice) SessionInvoice {
	out := SessionInvoice{
		ID: invoice.ID.String(), Kind: invoice.Kind, Status: invoice.Status, Currency: invoice.Currency,
		Subtotal: invoice.Subtotal, DiscountTotal: invoice.DiscountTotal, Total: invoice.Total,
		IssuedAt: invoice.IssuedAt, DueAt: invoice.DueAt, PaidAt: invoice.PaidAt,
		ServiceFrom: invoice.ServiceFrom, ServiceTo: invoice.ServiceTo,
		ProviderInvoiceNumber: nil, ExternalReference: invoice.Handoff.ExternalReference,
		HostedInvoiceURL: nil, InvoicePDFURL: nil, Lines: make([]SessionLine, 0, len(invoice.Lines)),
	}
	if invoice.Provider != nil {
		out.ProviderInvoiceNumber = invoice.Provider.InvoiceNumber
		out.HostedInvoiceURL = invoice.Provider.HostedInvoiceURL
		out.InvoicePDFURL = invoice.Provider.InvoicePDFURL
	}
	for _, line := range invoice.Lines {
		out.Lines = append(out.Lines, SessionLine{
			Seq: line.Seq, Type: string(line.Type), Label: line.Label, Description: line.Description,
			Quantity: line.Quantity, UnitAmountDecimal: line.UnitAmountDecimal, Amount: line.Amount,
			ServiceFrom: line.ServiceFrom, ServiceTo: line.ServiceTo,
		})
	}
	return out
}

// SessionAddon is an add-on of the session's instance (§14.4): what the
// customer holds of it and what it costs.
type SessionAddon struct {
	AddonSlug   string                         `json:"addonSlug" example:"extra-seats-v1"`
	FamilySlug  string                         `json:"familySlug" example:"extra-seats"`
	Name        string                         `json:"name" example:"Extra seats"`
	Quantity    int32                          `json:"quantity" doc:"0 when the add-on is not held" example:"3"`
	MaxQuantity *int32                         `json:"maxQuantity" doc:"The most one instance may hold; null when unbounded"`
	Prices      []getpubliccatalog.PublicPrice `json:"prices" nullable:"false" doc:"What it is billed: the flat fee of the subscription's period and the metered prices. Quantity changes are billed from the next renewal, with no proration."`
}

// AddonFrom shows an instance's add-on as a session does.
func AddonFrom(addon addoncatalogue.InstanceAddon) SessionAddon {
	out := SessionAddon{
		AddonSlug: addon.AddonSlug, FamilySlug: addon.FamilySlug, Name: addon.Name, Quantity: addon.Quantity,
		MaxQuantity: addon.MaxQuantity, Prices: make([]getpubliccatalog.PublicPrice, 0, len(addon.Prices)),
	}
	for _, price := range addon.Prices {
		out.Prices = append(out.Prices, getpubliccatalog.PriceFrom(price))
	}
	return out
}

// SessionSubscription is a subscription as a vendor's customer sees it.
type SessionSubscription struct {
	Status             string                       `json:"status" enum:"TRIAL,ACTIVE,PAST_DUE,CANCELED"`
	ProviderKind       string                       `json:"providerKind" enum:"NOOP,STRIPE"`
	CollectionMethod   string                       `json:"collectionMethod" enum:"SEND_INVOICE,CHARGE_AUTOMATICALLY"`
	Currency           string                       `json:"currency" example:"EUR"`
	BillingPeriod      string                       `json:"billingPeriod" enum:"MONTHLY,QUARTERLY,SEMI_ANNUAL,ANNUAL"`
	BasePrice          getpubliccatalog.PublicPrice `json:"basePrice"`
	CurrentPeriodStart time.Time                    `json:"currentPeriodStart"`
	CurrentPeriodEnd   time.Time                    `json:"currentPeriodEnd" doc:"When the current period ends: the renewal date, or the trial's end"`
	TrialEndsAt        *time.Time                   `json:"trialEndsAt"`
	CancelAtPeriodEnd  bool                         `json:"cancelAtPeriodEnd" doc:"The subscription ends at currentPeriodEnd; reactivate it before then to keep it"`
	ScheduledChange    *SessionScheduledChange      `json:"scheduledChange" doc:"A plan change the vendor scheduled for the next boundary"`
}

// TransformSchema publishes SessionSubscription's absent members as null (§13.15).
func (SessionSubscription) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	return nullable.Pointers(s, SessionSubscription{})
}

// SessionScheduledChange is a plan change waiting for the next boundary.
type SessionScheduledChange struct {
	Price       getpubliccatalog.PublicPrice `json:"price" doc:"The price the subscription moves to"`
	EffectiveAt time.Time                    `json:"effectiveAt" doc:"When it applies: the current period's end"`
}

// SubscriptionFrom shows a subscription as a session does.
func SubscriptionFrom(billing subscriptions.InstanceBilling) SessionSubscription {
	out := SessionSubscription{
		Status: billing.Status, ProviderKind: billing.ProviderKind, CollectionMethod: billing.CollectionMethod,
		Currency: billing.Currency, BillingPeriod: billing.BillingPeriod,
		BasePrice:          getpubliccatalog.PriceFrom(billing.BasePrice),
		CurrentPeriodStart: billing.CurrentPeriodStart, CurrentPeriodEnd: billing.CurrentPeriodEnd,
		TrialEndsAt: billing.TrialEndsAt, CancelAtPeriodEnd: billing.CancelAtPeriodEnd, ScheduledChange: nil,
	}
	if change := billing.ScheduledChange; change != nil {
		out.ScheduledChange = &SessionScheduledChange{Price: getpubliccatalog.PriceFrom(change.Price), EffectiveAt: change.EffectiveAt}
	}
	return out
}
