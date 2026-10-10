// Package getsessionportal is GET /public/session/portal (§14.4): everything
// the customer's portal shows, in one read -- who the customer is, the
// instance and its subscription, its quotas and where they come from, its
// add-ons and vouchers, the payment method, the next invoice, and what the
// portal may offer.
//
// A session bound to an instance gets all of it for that instance. A session
// bound to the customer only gets the customer, its instances and the payment
// method: a subscription, quotas and invoices are an instance's.
package getsessionportal

import (
	"context"
	"errors"
	"slices"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	addoncatalogue "github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getcustomerbilling"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscriptions"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/getpubliccatalog"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/sessions"
	vouchercatalogue "github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/shared/nullable"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// SessionPortal is the customer portal's payload.
type SessionPortal struct {
	Customer        PortalCustomer                `json:"customer"`
	Instance        *PortalInstance               `json:"instance" doc:"The session's instance; null for a session bound to the customer only"`
	Instances       []PortalInstanceSummary       `json:"instances" nullable:"false" doc:"The customer's instances, for a session bound to the customer only; empty otherwise"`
	Subscription    *sessions.SessionSubscription `json:"subscription" doc:"The instance's subscription; null when it has none, or the session is bound to no instance"`
	Entitlements    []PortalEntitlement           `json:"entitlements" nullable:"false" doc:"The instance's effective entitlements: its licence's, raised or added by add-ons and boosts"`
	AddOns          []sessions.SessionAddon       `json:"addOns" nullable:"false" doc:"The add-ons the instance holds"`
	Vouchers        []PortalVoucher               `json:"vouchers" nullable:"false" doc:"The vouchers the instance redeemed. Never a code."`
	PaymentMethod   *PortalPaymentMethod          `json:"paymentMethod" doc:"The payment method the customer's invoices are charged to; null when none is saved"`
	UpcomingInvoice *PortalUpcomingInvoice        `json:"upcomingInvoice" doc:"What the next boundary will bill, on usage so far; null without a live subscription"`
	Capabilities    PortalCapabilities            `json:"capabilities"`
	UpdatedAt       time.Time                     `json:"updatedAt" doc:"When this snapshot was read"`
}

// TransformSchema publishes SessionPortal's absent members as null (§13.15).
func (SessionPortal) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	return nullable.Pointers(s, SessionPortal{})
}

// PortalCustomer is the session's customer.
type PortalCustomer struct {
	Slug         string  `json:"slug" example:"acme"`
	Name         string  `json:"name" example:"Acme"`
	BillingEmail *string `json:"billingEmail" doc:"Where its invoices are sent"`
}

// TransformSchema publishes PortalCustomer's absent members as null (§13.15).
func (PortalCustomer) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	return nullable.Pointers(s, PortalCustomer{})
}

// PortalInstance is the session's instance.
type PortalInstance struct {
	Slug        string `json:"slug" example:"acme-prod"`
	Name        string `json:"name" example:"Acme prod"`
	LicenseSlug string `json:"licenseSlug" example:"pro-v2"`
	LicenseName string `json:"licenseName" example:"Pro"`
}

// PortalInstanceSummary is one of the customer's instances.
type PortalInstanceSummary struct {
	Slug          string  `json:"slug" example:"acme-prod"`
	Name          string  `json:"name" example:"Acme prod"`
	LicenseSlug   string  `json:"licenseSlug" example:"pro-v2"`
	BillingStatus *string `json:"billingStatus" enum:"TRIAL,ACTIVE,PAST_DUE,CANCELED" doc:"Its subscription's status; null when it was never subscribed"`
}

// TransformSchema publishes PortalInstanceSummary's absent members as null (§13.15).
func (PortalInstanceSummary) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	return nullable.Pointers(s, PortalInstanceSummary{})
}

// PortalEntitlement is one of the instance's effective entitlements.
type PortalEntitlement struct {
	Slug                           string                           `json:"slug" example:"seats"`
	Name                           string                           `json:"name" example:"Seats"`
	Type                           string                           `json:"type" enum:"NUMBER,NUMBER_AI_CREDIT,BOOLEAN,CONFIG"`
	LimitValue                     *instanceschema.EntitlementValue `json:"limitValue" doc:"The effective value: a number's limit (-1 unlimited), a BOOLEAN's flag, a CONFIG's object"`
	CurrentValue                   *float64                         `json:"currentValue" doc:"A number's usage in its current window; null for BOOLEAN and CONFIG"`
	Unlimited                      bool                             `json:"unlimited"`
	LimitCapExceededOveragePercent *int16                           `json:"limitCapExceededOveragePercent" doc:"How far above the limit usage is still accepted, in percent: 0 a hard limit; null for BOOLEAN and CONFIG"`
	MaximumAllowedUsage            *float64                         `json:"maximumAllowedUsage" doc:"The most usage accepted, limit × (1 + percent ÷ 100); null when unlimited, and for BOOLEAN and CONFIG"`
	PercentageUsed                 *float64                         `json:"percentageUsed" doc:"currentValue ÷ limit × 100; null when unlimited or the limit is 0, and for BOOLEAN and CONFIG"`
	CurrentPeriodStart             *time.Time                       `json:"currentPeriodStart" doc:"The usage window's start; null for a lifetime quota"`
	CurrentPeriodEnd               *time.Time                       `json:"currentPeriodEnd" doc:"The usage window's end; null for a lifetime quota"`
	Source                         string                           `json:"source" enum:"license,addon" doc:"license: the licence grants it; addon: only add-ons do"`
	Provenance                     *instanceschema.Provenance       `json:"provenance" doc:"What the licence, the add-ons and the boosts each contribute"`
}

// TransformSchema publishes PortalEntitlement's absent members as null (§13.15).
func (PortalEntitlement) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	return nullable.Pointers(s, PortalEntitlement{})
}

// PortalVoucher is a voucher the instance redeemed.
type PortalVoucher struct {
	Name               string     `json:"name" example:"Summer launch"`
	VoucherType        string     `json:"voucherType" enum:"PRICE,ENTITLEMENT_BOOST"`
	Status             string     `json:"status" enum:"ACTIVE,EXPIRED,REVOKED"`
	EffectiveStartsAt  time.Time  `json:"effectiveStartsAt"`
	EffectiveExpiresAt *time.Time `json:"effectiveExpiresAt" doc:"When a boost stops applying; null when it does not expire, and for a PRICE voucher, counted in invoices"`
}

// TransformSchema publishes PortalVoucher's absent members as null (§13.15).
func (PortalVoucher) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	return nullable.Pointers(s, PortalVoucher{})
}

// PortalPaymentMethod is the payment method's labels, as the provider gave
// them. Never card data.
type PortalPaymentMethod struct {
	Status   string  `json:"status" enum:"ACTIVE,EXPIRED,FAILED" doc:"EXPIRED, FAILED: save another one"`
	Brand    *string `json:"brand" example:"visa"`
	Last4    *string `json:"last4" example:"4242"`
	ExpMonth *int    `json:"expMonth" example:"12"`
	ExpYear  *int    `json:"expYear" example:"2030"`
}

// TransformSchema publishes PortalPaymentMethod's absent members as null (§13.15).
func (PortalPaymentMethod) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	return nullable.Pointers(s, PortalPaymentMethod{})
}

// PortalUpcomingInvoice is what the next boundary bills, on usage so far.
type PortalUpcomingInvoice struct {
	Currency      string    `json:"currency" example:"EUR"`
	Subtotal      int64     `json:"subtotal" doc:"Minor units"`
	DiscountTotal int64     `json:"discountTotal" doc:"Minor units"`
	Total         int64     `json:"total" doc:"Minor units"`
	BoundaryAt    time.Time `json:"boundaryAt" doc:"When it is issued"`
}

// PortalCapabilities is what the portal may offer (§14.5).
type PortalCapabilities struct {
	PaymentMethods bool `json:"paymentMethods" doc:"The vendor's provider captures payment methods: the payment-method and portal sessions work"`
	Invoices       bool `json:"invoices" doc:"Billing is on: GET /public/session/invoices lists the customer's"`
	Unsubscribe    bool `json:"unsubscribe" doc:"The instance's subscription is live and not already ending: POST /public/session/billing/cancel"`
	Checkout       bool `json:"checkout" doc:"The instance has no live subscription, and its plan can be bought alone: POST /public/session/checkout"`
}

// Session is the customer session the portal is read for.
type Session struct {
	CustomerID   uuid.UUID
	CustomerSlug string
	InstanceID   *uuid.UUID
	InstanceSlug *string
}

// The other modules' reads the portal is made of, through ports it owns.
type (
	SubscriptionReader interface {
		Execute(ctx context.Context, instanceSlug string) (*subscriptions.InstanceBilling, error)
	}
	UpcomingInvoiceReader interface {
		Execute(ctx context.Context, instanceSlug string) (*rating.InvoicePreview, error)
	}
	EntitlementReader interface {
		Execute(ctx context.Context, instanceSlug string) ([]instanceschema.EntitlementUsage, error)
	}
	AddonReader interface {
		Execute(ctx context.Context, instanceSlug string, includeRemoved bool) ([]addoncatalogue.InstanceAddon, error)
	}
	VoucherReader interface {
		Execute(ctx context.Context, instanceSlug, status string) ([]vouchercatalogue.Redemption, error)
	}
	CustomerBillingReader interface {
		Execute(ctx context.Context, customerSlug string) (*getcustomerbilling.CustomerBilling, error)
	}
)

// Deps is what the portal reads.
type Deps struct {
	Queries         func(ctx context.Context) *db.Queries
	Catalog         *getpubliccatalog.UseCase
	Subscription    SubscriptionReader
	UpcomingInvoice UpcomingInvoiceReader
	Entitlements    EntitlementReader
	AddOns          AddonReader
	Vouchers        VoucherReader
	CustomerBilling CustomerBillingReader
}

type UseCase struct{ deps Deps }

func NewUseCase(deps Deps) *UseCase { return &UseCase{deps: deps} }

// Execute reads the portal of the session's customer, and its instance when
// the session is bound to one.
func (u *UseCase) Execute(ctx context.Context, organizationID uuid.UUID, session Session) (*SessionPortal, error) {
	q := u.deps.Queries(ctx)
	customer, err := q.GetPortalCustomer(ctx, db.GetPortalCustomerParams{OrganizationID: organizationID, ID: session.CustomerID})
	if err != nil {
		return nil, err
	}
	catalog, err := u.deps.Catalog.Execute(ctx, organizationID, getpubliccatalog.Query{FamilySlug: nil, IncludeAddOns: false})
	if err != nil {
		return nil, err
	}
	billing, err := u.deps.CustomerBilling.Execute(ctx, session.CustomerSlug)
	if err != nil {
		return nil, err
	}
	out := &SessionPortal{
		Customer:  PortalCustomer{Slug: customer.Slug, Name: customer.Name, BillingEmail: customer.BillingEmail},
		Instance:  nil,
		Instances: []PortalInstanceSummary{}, Subscription: nil,
		Entitlements: []PortalEntitlement{}, AddOns: []sessions.SessionAddon{}, Vouchers: []PortalVoucher{},
		PaymentMethod: nil, UpcomingInvoice: nil,
		Capabilities: PortalCapabilities{PaymentMethods: catalog.Capabilities.PaymentMethods, Invoices: true, Unsubscribe: false, Checkout: false},
		UpdatedAt:    time.Now().UTC().Truncate(time.Millisecond),
	}

	if session.InstanceID == nil || session.InstanceSlug == nil {
		instances, err := q.ListPortalInstances(ctx, db.ListPortalInstancesParams{OrganizationID: organizationID, CustomerID: session.CustomerID})
		if err != nil {
			return nil, err
		}
		for _, row := range instances {
			summary := PortalInstanceSummary{Slug: row.Slug, Name: row.Name, LicenseSlug: row.LicenseSlug, BillingStatus: nil}
			if row.BillingStatus != "" {
				status := row.BillingStatus
				summary.BillingStatus = &status
			}
			out.Instances = append(out.Instances, summary)
		}
		out.PaymentMethod = paymentMethod(billing, "")
		return out, nil
	}

	slug := *session.InstanceSlug
	instance, err := q.GetPortalInstance(ctx, db.GetPortalInstanceParams{OrganizationID: organizationID, ID: *session.InstanceID, CustomerID: session.CustomerID})
	if err != nil {
		return nil, err
	}
	out.Instance = &PortalInstance{Slug: instance.Slug, Name: instance.Name, LicenseSlug: instance.LicenseSlug, LicenseName: instance.LicenseName}

	subscription, err := u.deps.Subscription.Execute(ctx, slug)
	if err != nil && !missing(err) {
		return nil, err
	}
	live := false
	provider := ""
	if subscription != nil {
		shown := sessions.SubscriptionFrom(*subscription)
		out.Subscription = &shown
		live = subscription.Status != subscriptions.StatusCanceled
		provider = subscription.ProviderKind
	}
	out.PaymentMethod = paymentMethod(billing, provider)
	out.Capabilities.Unsubscribe = live && !subscription.CancelAtPeriodEnd
	plan := slices.IndexFunc(catalog.Plans, func(p getpubliccatalog.PublicPlan) bool { return p.FamilySlug == instance.FamilySlug })
	out.Capabilities.Checkout = !live && plan >= 0 && catalog.Plans[plan].SelfServe

	if out.Entitlements, err = u.entitlements(ctx, q, organizationID, slug); err != nil {
		return nil, err
	}
	addOns, err := u.deps.AddOns.Execute(ctx, slug, false)
	if err != nil {
		return nil, err
	}
	for _, addon := range addOns {
		out.AddOns = append(out.AddOns, sessions.AddonFrom(addon))
	}
	redeemed, err := u.deps.Vouchers.Execute(ctx, slug, "")
	if err != nil {
		return nil, err
	}
	for _, r := range redeemed {
		out.Vouchers = append(out.Vouchers, PortalVoucher{
			Name: r.VoucherName, VoucherType: r.VoucherType, Status: r.Status,
			EffectiveStartsAt: r.EffectiveStartsAt, EffectiveExpiresAt: r.EffectiveExpiresAt,
		})
	}
	if live {
		upcoming, err := u.deps.UpcomingInvoice.Execute(ctx, slug)
		switch {
		case err == nil:
			out.UpcomingInvoice = &PortalUpcomingInvoice{
				Currency: upcoming.Currency, Subtotal: upcoming.Subtotal, DiscountTotal: upcoming.DiscountTotal,
				Total: upcoming.Total, BoundaryAt: upcoming.BoundaryAt,
			}
		case !missing(err) && !kaitenerrors.IsUnprocessable(err) && !kaitenerrors.IsConflict(err):
			// Usage outside the journal's retention, or a subscription that
			// ended since it was read, have no preview to show; anything else
			// is a failure.
			return nil, err
		}
	}
	return out, nil
}

func (u *UseCase) entitlements(ctx context.Context, q *db.Queries, organizationID uuid.UUID, instanceSlug string) ([]PortalEntitlement, error) {
	usages, err := u.deps.Entitlements.Execute(ctx, instanceSlug)
	if err != nil || len(usages) == 0 {
		return []PortalEntitlement{}, err
	}
	ids := make([]uuid.UUID, 0, len(usages))
	for _, usage := range usages {
		ids = append(ids, usage.EntitlementID)
	}
	rows, err := q.ListPortalEntitlementNames(ctx, db.ListPortalEntitlementNamesParams{OrganizationID: organizationID, Ids: ids})
	if err != nil {
		return nil, err
	}
	names := make(map[uuid.UUID]db.ListPortalEntitlementNamesRow, len(rows))
	for _, row := range rows {
		names[row.ID] = row
	}
	out := make([]PortalEntitlement, 0, len(usages))
	for _, usage := range usages {
		out = append(out, entitlementFrom(usage, names[usage.EntitlementID]))
	}
	slices.SortFunc(out, func(a, b PortalEntitlement) int {
		switch {
		case a.Slug < b.Slug:
			return -1
		case a.Slug > b.Slug:
			return 1
		}
		return 0
	})
	return out, nil
}

// entitlementFrom shows an effective entitlement as the portal does: a
// number's limit, usage and cap worked out, so the browser computes nothing.
func entitlementFrom(usage instanceschema.EntitlementUsage, named db.ListPortalEntitlementNamesRow) PortalEntitlement {
	out := PortalEntitlement{
		Slug: usage.EntitlementSlug, Name: named.Name, Type: named.Type, LimitValue: usage.Limit,
		CurrentValue: nil, Unlimited: false, LimitCapExceededOveragePercent: nil, MaximumAllowedUsage: nil, PercentageUsed: nil,
		CurrentPeriodStart: usage.CurrentPeriodStart, CurrentPeriodEnd: usage.CurrentPeriodEnd,
		Source: usage.Source, Provenance: usage.Provenance,
	}
	if usage.Value.Number == nil {
		return out
	}
	current := usage.Value.Number.Value
	out.CurrentValue = &current
	out.LimitCapExceededOveragePercent = usage.LimitCapExceededOveragePercent
	if usage.Limit == nil || usage.Limit.Number == nil {
		return out
	}
	limit := usage.Limit.Number.Value
	if limit < 0 {
		out.Unlimited = true
		return out
	}
	percent := 0.0
	if usage.LimitCapExceededOveragePercent != nil && *usage.LimitCapExceededOveragePercent > 0 {
		percent = float64(*usage.LimitCapExceededOveragePercent)
	}
	maximum := limit * (1 + percent/100)
	out.MaximumAllowedUsage = &maximum
	if limit > 0 {
		used := current / limit * 100
		out.PercentageUsed = &used
	}
	return out
}

// paymentMethod is the payment method of the provider the subscription bills
// through, else the first saved one.
func paymentMethod(billing *getcustomerbilling.CustomerBilling, provider string) *PortalPaymentMethod {
	var chosen *PortalPaymentMethod
	for _, p := range billing.Providers {
		if p.PaymentMethod == nil {
			continue
		}
		labels := p.PaymentMethod
		method := &PortalPaymentMethod{Status: labels.Status, Brand: labels.Brand, Last4: labels.Last4, ExpMonth: labels.ExpMonth, ExpYear: labels.ExpYear}
		if p.ProviderKind == provider {
			return method
		}
		if chosen == nil {
			chosen = method
		}
	}
	return chosen
}

// missing reports the answer of a read that found nothing: an instance never
// subscribed has no subscription to show.
func missing(err error) bool {
	return kaitenerrors.IsNotFound(err) || errors.Is(err, pgx.ErrNoRows)
}
