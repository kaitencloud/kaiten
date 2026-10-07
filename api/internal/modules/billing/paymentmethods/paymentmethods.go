// Package paymentmethods is what the payment-method use cases share: a
// customer's side in each provider as the API shows it, the provider that
// captures payment methods, and recording the labels a provider reports.
//
// Kaiten never sees card data. Every surface where one is entered is a page
// the provider hosts, created server-side; Kaiten keeps labels only (brand,
// last four digits, expiry) and the provider's id of the method.
package paymentmethods

import (
	"context"
	"errors"
	"net/url"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// PaymentMethodLabels is a customer's default payment method in a provider, as
// labels.
type PaymentMethodLabels struct {
	Status     string     `json:"status" enum:"ACTIVE,EXPIRED,FAILED" doc:"ACTIVE: charged automatically. EXPIRED, FAILED: a charge said it is no longer usable; save another one"`
	Brand      *string    `json:"brand,omitempty" example:"visa"`
	Last4      *string    `json:"last4,omitempty" example:"4242"`
	ExpMonth   *int       `json:"expMonth,omitempty" example:"12"`
	ExpYear    *int       `json:"expYear,omitempty" example:"2030"`
	AttachedAt *time.Time `json:"attachedAt,omitempty"`
}

// CustomerInProvider is a customer's side in one provider.
type CustomerInProvider struct {
	ProviderKind       string         `json:"providerKind" enum:"STRIPE"`
	ExternalCustomerID string         `json:"externalCustomerId" doc:"The customer's id in the provider"`
	WebURL             *string        `json:"webUrl,omitempty" doc:"The customer's page in the provider's dashboard"`
	SyncedAt           *time.Time     `json:"syncedAt,omitempty"`
	PaymentMethod      *PaymentMethodLabels `json:"paymentMethod" doc:"Its default payment method; null when there is none"`
}

// View is a customer billing row as the API shows it.
func View(row db.CustomerBilling) CustomerInProvider {
	out := CustomerInProvider{
		ProviderKind: string(row.ProviderKind), ExternalCustomerID: row.ExternalCustomerID, WebURL: row.WebUrl,
		SyncedAt: instant(row.SyncedAt.Time, row.SyncedAt.Valid), PaymentMethod: nil,
	}
	if row.PaymentMethodStatus != db.PaymentMethodStatusNONE {
		out.PaymentMethod = &PaymentMethodLabels{
			Status: string(row.PaymentMethodStatus), Brand: row.PaymentMethodBrand, Last4: row.PaymentMethodLast4,
			ExpMonth: smallint(row.PaymentMethodExpMonth), ExpYear: smallint(row.PaymentMethodExpYear),
			AttachedAt: instant(row.PaymentMethodAttachedAt.Time, row.PaymentMethodAttachedAt.Valid),
		}
	}
	return out
}

func instant(t time.Time, valid bool) *time.Time {
	if !valid {
		return nil
	}
	u := t.UTC()
	return &u
}

func smallint(v *int16) *int {
	if v == nil {
		return nil
	}
	n := int(*v)
	return &n
}

// Customer is the customer a request names, in the caller's organization.
func Customer(ctx context.Context, q *db.Queries, organizationID uuid.UUID, slug, operation string) (db.GetBillingCustomerBySlugRow, error) {
	customer, err := q.GetBillingCustomerBySlug(ctx, db.GetBillingCustomerBySlugParams{OrganizationID: organizationID, Slug: slug})
	if errors.Is(err, pgx.ErrNoRows) {
		return customer, kaitenerrors.NotFoundf(operation+".CustomerNotFound", "customer %q not found", slug)
	}
	return customer, err
}

// Capturing is the connected provider that captures payment methods: the
// first one this deployment knows. <operation>.ProviderNotConnected when the
// organization has connected none.
func Capturing(ctx context.Context, deps access.Deps, organizationID uuid.UUID, operation string) (*provider.Connection, error) {
	if deps.Providers != nil {
		for _, kind := range deps.Providers.Kinds() {
			capabilities, ok := deps.Providers.Capabilities(kind)
			if !ok || !capabilities.PaymentMethodCapture {
				continue
			}
			conn, err := deps.Providers.Resolve(ctx, organizationID, kind)
			if errors.Is(err, provider.ErrNotConnected) {
				continue
			}
			if err != nil {
				return nil, err
			}
			return conn, nil
		}
	}
	return nil, kaitenerrors.UnprocessableEntity(operation+".ProviderNotConnected",
		"no payment provider that saves payment methods is connected for this organization")
}

// ValidateReturnURL accepts an https URL, or an http one on localhost, of at
// most 2048 characters (<operation>.InvalidReturnUrl).
func ValidateReturnURL(operation, raw string) error {
	parsed, err := url.Parse(raw)
	ok := err == nil && len(raw) <= 2048 && parsed.Host != "" &&
		(parsed.Scheme == "https" || (parsed.Scheme == "http" && (parsed.Hostname() == "localhost" || parsed.Hostname() == "127.0.0.1")))
	if !ok {
		return kaitenerrors.UnprocessableEntity(operation+".InvalidReturnUrl",
			"returnUrl must be an https URL (or http on localhost) of at most 2048 characters")
	}
	return nil
}

// PaymentMethodAttached is the payload of CUSTOMER_PAYMENT_METHOD_ATTACHED: no brand, last
// four digits or expiry.
type PaymentMethodAttached struct {
	CustomerSlug string    `json:"customerSlug"`
	ProviderKind string    `json:"providerKind" enum:"STRIPE"`
	Status       string    `json:"status" enum:"ACTIVE"`
	AttachedAt   time.Time `json:"attachedAt"`
}

// PaymentMethodDetached is the payload of CUSTOMER_PAYMENT_METHOD_DETACHED.
type PaymentMethodDetached struct {
	CustomerSlug string `json:"customerSlug"`
	ProviderKind string `json:"providerKind" enum:"STRIPE"`
}

// PaymentMethodExpiring is the payload of CUSTOMER_PAYMENT_METHOD_EXPIRING.
type PaymentMethodExpiring struct {
	CustomerSlug string    `json:"customerSlug"`
	ProviderKind string    `json:"providerKind" enum:"STRIPE"`
	ExpiresAt    time.Time `json:"expiresAt" doc:"The last instant of the payment method's expiry month"`
}

// Apply records the provider's default payment method of a customer, in the
// transaction ctx carries, and announces it when it changed: another method,
// or the same one usable again. Idempotent.
func Apply(ctx context.Context, q *db.Queries, box *outbox.ScopedRepository, organizationID, customerID uuid.UUID, customerSlug string,
	kind db.BillingProviderKind, method provider.PaymentMethod, now time.Time,
) (db.CustomerBilling, error) {
	before, err := q.GetCustomerBilling(ctx, db.GetCustomerBillingParams{OrganizationID: organizationID, CustomerID: customerID, ProviderKind: kind})
	if err != nil {
		return db.CustomerBilling{}, err
	}
	after, err := q.SetPaymentMethod(ctx, db.SetPaymentMethodParams{
		PaymentMethodID: &method.ExternalID, Brand: optional(method.Brand), Last4: optionalLast4(method.Last4),
		ExpMonth: optionalSmall(method.ExpMonth, 1, 12), ExpYear: optionalSmall(method.ExpYear, 2000, 2100),
		Now: invoices.Timestamp(now), OrganizationID: organizationID, CustomerID: customerID, ProviderKind: kind,
	})
	if err != nil {
		return db.CustomerBilling{}, err
	}
	same := before.PaymentMethodStatus == db.PaymentMethodStatusACTIVE && before.DefaultPaymentMethodID != nil &&
		*before.DefaultPaymentMethodID == method.ExternalID
	if same {
		return after, nil
	}
	return after, box.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(organizationID,
		events.CustomerPaymentMethodAttached.Name, events.CustomerPaymentMethodAttached.Type, PaymentMethodAttached{
			CustomerSlug: customerSlug, ProviderKind: string(kind), Status: string(db.PaymentMethodStatusACTIVE),
			AttachedAt: after.PaymentMethodAttachedAt.Time.UTC(),
		}, nil))
}

// Clear records that the customer has no payment method in the provider any
// more, and announces it once.
func Clear(ctx context.Context, q *db.Queries, box *outbox.ScopedRepository, organizationID, customerID uuid.UUID, customerSlug string,
	kind db.BillingProviderKind, now time.Time,
) error {
	before, err := q.GetCustomerBilling(ctx, db.GetCustomerBillingParams{OrganizationID: organizationID, CustomerID: customerID, ProviderKind: kind})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if before.PaymentMethodStatus == db.PaymentMethodStatusNONE {
		return nil
	}
	if _, err := q.ClearPaymentMethod(ctx, db.ClearPaymentMethodParams{
		Now: invoices.Timestamp(now), OrganizationID: organizationID, CustomerID: customerID, ProviderKind: kind,
	}); err != nil {
		return err
	}
	return box.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(organizationID,
		events.CustomerPaymentMethodDetached.Name, events.CustomerPaymentMethodDetached.Type,
		PaymentMethodDetached{CustomerSlug: customerSlug, ProviderKind: string(kind)}, nil))
}

func optional(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func optionalLast4(s string) *string {
	if len(s) != 4 || strings.Trim(s, "0123456789") != "" {
		return nil
	}
	return &s
}

func optionalSmall(v, lo, hi int) *int16 {
	if v < lo || v > hi {
		return nil
	}
	n := int16(v) //nolint:gosec // bounded above
	return &n
}

// RegisterWebhooks declares the payment-method events.
func RegisterWebhooks(api huma.API) {
	webhook.Declare(api,
		webhook.Declaration{
			Event: events.CustomerPaymentMethodAttached, Data: (*PaymentMethodAttached)(nil), OperationID: "onCustomerPaymentMethodAttached",
			Summary:     "Customer Payment Method Attached Webhook",
			Description: "Triggered when a customer's default payment method in a provider is set or replaced (a completed setup session, or a change in the provider's portal). Carries no card data.",
			Tags:        []string{"webhooks", "billing"},
		},
		webhook.Declaration{
			Event: events.CustomerPaymentMethodDetached, Data: (*PaymentMethodDetached)(nil), OperationID: "onCustomerPaymentMethodDetached",
			Summary:     "Customer Payment Method Detached Webhook",
			Description: "Triggered when a customer no longer has a payment method in a provider.",
			Tags:        []string{"webhooks", "billing"},
		},
		webhook.Declaration{
			Event: events.CustomerPaymentMethodExpiring, Data: (*PaymentMethodExpiring)(nil), OperationID: "onCustomerPaymentMethodExpiring",
			Summary:     "Customer Payment Method Expiring Webhook",
			Description: "Triggered once, 30 days before the end of the expiry month of a customer's payment method.",
			Tags:        []string{"webhooks", "billing"},
		},
	)
}
