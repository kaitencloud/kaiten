package getbillingcapabilities

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/gate"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// BillingCapabilities is what billing can do for the organization on this
// deployment, for a client to show only what works.
type BillingCapabilities struct {
	Enabled                     bool              `json:"enabled" doc:"Whether the billing routes answer for this organization"`
	DisabledReason              *string           `json:"disabledReason" enum:"DEPLOYMENT_DISABLED,NOT_ENTITLED" doc:"Why they do not: billing is off on this deployment, or the organization's plan does not include it"`
	Providers                   []BillingProvider `json:"providers" nullable:"false" doc:"Who can collect invoices"`
	PublicSurface               PublicSurface     `json:"publicSurface"`
	UsageHistoryRetentionMonths *int              `json:"usageHistoryRetentionMonths" doc:"How long usage reports are kept, in months; null when they are kept forever or it cannot be told"`
	UsageIdempotencyWindowDays  int               `json:"usageIdempotencyWindowDays" doc:"How long a usage report's transactionId is remembered, in days"`
	Features                    BillingFeatures   `json:"features" doc:"Which parts of billing this release ships"`
}

// BillingProvider is one way of collecting invoices.
type BillingProvider struct {
	Kind      string `json:"kind" enum:"NOOP,STRIPE"`
	Available bool   `json:"available" doc:"Whether the organization may connect it on this deployment"`
	// UnavailableReason says why it may not: its connector's entitlement is
	// not granted, or the deployment has no Vault to store its settings in.
	UnavailableReason *string              `json:"unavailableReason,omitempty" enum:"NOT_ENTITLED,VAULT_NOT_CONFIGURED" doc:"Why it is not available; absent when it is"`
	Connected         bool                 `json:"connected" doc:"Whether it is set up for the organization; NOOP always is"`
	Livemode          *bool                `json:"livemode,omitempty" doc:"Whether the connection reaches the provider's live account rather than a test one; absent when not connected, and for NOOP"`
	Capabilities      ProviderCapabilities `json:"capabilities"`
}

// ProviderCapabilities is what a provider can do beyond issuing invoices.
type ProviderCapabilities struct {
	PaymentMethodCapture bool `json:"paymentMethodCapture"`
	BillingPortal        bool `json:"billingPortal"`
	AutomaticCollection  bool `json:"automaticCollection"`
}

// PublicSurface is the self-serve surface for the organization's own
// customers.
type PublicSurface struct {
	Enabled bool `json:"enabled" doc:"Whether publishable keys and customer sessions work for the organization: billing is on for it"`
}

// BillingFeatures are the parts of billing a release ships.
type BillingFeatures struct {
	Stripe              bool `json:"stripe"`
	Lifecycle           bool `json:"lifecycle" doc:"Cancellation, reactivation, plan changes and overdue tracking"`
	Trials              bool `json:"trials"`
	Addons              bool `json:"addons"`
	Vouchers            bool `json:"vouchers"`
	ChargeAutomatically bool `json:"chargeAutomatically"`
	PublicSurface       bool `json:"publicSurface"`
}

type UseCase struct {
	deps              access.Deps
	idempotencyWindow time.Duration
}

// providers lists the providers this deployment knows, NOOP first: whether
// the organization may connect each, and whether it has.
func (u *UseCase) providers(ctx context.Context, organizationID uuid.UUID) ([]BillingProvider, error) {
	out := []BillingProvider{}
	if u.deps.Providers == nil {
		return out, nil
	}
	for _, kind := range u.deps.Providers.Kinds() {
		capabilities, _ := u.deps.Providers.Capabilities(kind)
		availability, err := u.deps.Providers.Availability(ctx, organizationID, kind)
		if err != nil {
			// The capabilities answer even when the licensing authority does
			// not: the provider reads as unavailable, with no reason given.
			slog.WarnContext(ctx, "billing provider availability could not be read", "provider", kind, "error", err)
			availability = provider.Availability{Available: false, Reason: ""}
		}
		entry := BillingProvider{
			Kind: string(kind), Available: availability.Available, UnavailableReason: nil, Connected: false, Livemode: nil,
			Capabilities: ProviderCapabilities{
				PaymentMethodCapture: capabilities.PaymentMethodCapture, BillingPortal: capabilities.BillingPortal,
				AutomaticCollection: capabilities.ChargeAutomatically,
			},
		}
		if availability.Reason != "" {
			reason := availability.Reason
			entry.UnavailableReason = &reason
		}
		if conn, err := u.deps.Providers.Resolve(ctx, organizationID, kind); err == nil {
			entry.Connected = true
			if kind != provider.KindNoop {
				livemode := conn.Livemode
				entry.Livemode = &livemode
			}
		}
		out = append(out, entry)
	}
	return out, nil
}

func NewUseCase(deps access.Deps, idempotencyWindow time.Duration) *UseCase {
	return &UseCase{deps: deps, idempotencyWindow: idempotencyWindow}
}

// Execute answers whether billing is enabled, and what it can do, even when it
// is not.
func (u *UseCase) Execute(ctx context.Context) (*BillingCapabilities, error) {
	user, err := u.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}
	providers, err := u.providers(ctx, user.OrganizationID)
	if err != nil {
		return nil, err
	}
	out := &BillingCapabilities{
		Enabled:                     true,
		DisabledReason:              nil,
		Providers:                   providers,
		PublicSurface:               PublicSurface{Enabled: true},
		UsageHistoryRetentionMonths: nil,
		UsageIdempotencyWindowDays:  int(u.idempotencyWindow / (24 * time.Hour)),
		Features: BillingFeatures{
			Stripe: true, Lifecycle: true, Trials: true, Addons: true, Vouchers: true,
			ChargeAutomatically: true, PublicSurface: true,
		},
	}
	if err := u.deps.Gate.Require(ctx, user.OrganizationID); err != nil {
		var reason string
		switch kaitenerrors.GetCode(err) {
		case gate.CodeDisabled:
			reason = "DEPLOYMENT_DISABLED"
		case gate.CodeNotEntitled:
			reason = "NOT_ENTITLED"
		default:
			return nil, err
		}
		out.Enabled, out.DisabledReason, out.PublicSurface.Enabled = false, &reason, false
	}
	if months, known := u.deps.Usage.RetentionMonths(ctx, user.OrganizationID); known && months > 0 {
		out.UsageHistoryRetentionMonths = &months
	}
	return out, nil
}
