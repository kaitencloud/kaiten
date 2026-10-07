// Package providerconnector is billing's half of the connectors that configure
// a payment provider: the lifecycle rules every such connector keeps,
// whichever provider it configures. A new provider is a connector manifest,
// an adapter and a provider.ConnectorBinding; nothing here names one.
//
//   - Settings are checked against the provider before they are stored: a key
//     the provider refuses is never kept, and while the organization has
//     customers in the provider, a new key must reach the same account.
//   - The connector cannot be disconnected, nor its settings deleted, while
//     subscriptions or unsettled invoices still route to the provider.
//   - Connecting and disconnecting are announced, in the transaction that
//     writes the activation, once per transition.
//
// Hooks satisfies infrastructure/connectorhooks.Hooks by shape; the
// connectors module calls it without billing importing that module.
package providerconnector

import (
	"context"
	"errors"
	"reflect"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/connectorhooks"
	kaitenevents "github.com/kaitencloud/kaiten/api/internal/infrastructure/events"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/providers"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Connection is the payload of billing_provider.v1.connected and
// .disconnected. It names the provider and whether it is its live account;
// never a credential.
type Connection struct {
	ProviderKind  string `json:"providerKind" enum:"STRIPE" doc:"The payment provider"`
	ConnectorName string `json:"connectorName" doc:"The connector that configures it" example:"kaiten.integration.billing.stripe"`
	Livemode      bool   `json:"livemode" doc:"Whether the connection reaches the provider's live account rather than a test one"`
}

// Routing is what still routes to the provider, as a refused disconnect
// reports it.
type Routing struct {
	ActiveSubscriptions int64 `json:"activeSubscriptions"`
	OpenInvoices        int64 `json:"openInvoices"`
}

// Hooks are a provider connector's lifecycle rules.
type Hooks struct {
	uof     *uow.UnitOfWork
	outbox  *outbox.ScopedRepository
	binding provider.ConnectorBinding
	timeout time.Duration
	// secrets are the settings keys that hold credentials: a change of one
	// is a change of account to check.
	secrets []string
}

var _ connectorhooks.Hooks = (*Hooks)(nil)

// New returns the hooks of the connector that configures binding's provider.
// secretFields are the connector's write-only settings.
func New(uof *uow.UnitOfWork, binding provider.ConnectorBinding, timeout time.Duration, secretFields []string) *Hooks {
	return &Hooks{uof: uof, outbox: outbox.NewScopedRepository(uof), binding: binding, timeout: timeout, secrets: secretFields}
}

func (h *Hooks) queries(ctx context.Context) *db.Queries { return db.New(h.uof.DBTX(ctx)) }

func (h *Hooks) kind() db.BillingProviderKind { return db.BillingProviderKind(h.binding.Kind()) }

// ValidateSettings refuses settings the provider does not accept, and a key
// of another account while customers are mapped in this one.
func (h *Hooks) ValidateSettings(ctx context.Context, organizationID uuid.UUID, merged, stored map[string]any) error {
	parsed, err := h.binding.Parse(merged)
	if err != nil {
		return kaitenerrors.Validation("UpdateConnectorSettings.InvalidPayloadSchema", "the connector settings are not usable")
	}
	if checker, ok := h.binding.Adapter.(provider.CredentialChecker); ok {
		callCtx, cancel := providers.Bound(ctx, h.timeout)
		_, err := checker.CheckCredentials(callCtx, parsed.Settings)
		cancel()
		if err != nil {
			return h.refusal(err)
		}
	}
	if stored == nil || !h.secretsChanged(merged, stored) {
		return nil
	}
	verifier, ok := h.binding.Adapter.(provider.AccountVerifier)
	if !ok {
		return nil
	}
	mapped, err := h.queries(ctx).GetAnyCustomerBillingID(ctx, db.GetAnyCustomerBillingIDParams{
		OrganizationID: organizationID, ProviderKind: h.kind(),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil // nothing to orphan
	}
	if err != nil {
		return err
	}
	callCtx, cancel := providers.Bound(ctx, h.timeout)
	same, err := verifier.SameAccount(callCtx, parsed.Settings, mapped)
	cancel()
	if err != nil {
		return h.refusal(err)
	}
	if !same {
		return kaitenerrors.Conflict("UpdateConnectorSettings.AccountChanged",
			"the new key reaches another account than the one this organization's customers live in")
	}
	return nil
}

// refusal answers a provider failure during a settings check: credentials
// the provider refuses, or a provider that cannot be reached.
func (h *Hooks) refusal(err error) error {
	var providerErr *provider.Error
	if errors.As(err, &providerErr) && (providerErr.Class == provider.ClassNotConnected || providerErr.Class == provider.ClassRejected) {
		location := "body.settings"
		if len(h.secrets) > 0 {
			location += "." + h.secrets[0]
		}
		return kaitenerrors.UnprocessableEntityWithErrors("UpdateConnectorSettings.CredentialsRejected",
			"the payment provider refused the credentials: "+providerErr.Message,
			&kaitenerrors.ErrorDetail{Message: "provider error", Location: location, Value: map[string]string{
				"providerCode": providerErr.Code, "providerRequestId": providerErr.RequestID,
			}})
	}
	return kaitenerrors.Unavailable("UpdateConnectorSettings.ProviderUnavailable",
		"the payment provider could not be reached to check the credentials; retry in a moment")
}

func (h *Hooks) secretsChanged(merged, stored map[string]any) bool {
	for _, field := range h.secrets {
		if !reflect.DeepEqual(merged[field], stored[field]) {
			return true
		}
	}
	return false
}

// CanDeactivate refuses while subscriptions or unsettled invoices route to
// the provider: they would be stranded, unpushable and unsyncable.
func (h *Hooks) CanDeactivate(ctx context.Context, organizationID uuid.UUID, operation string) error {
	routing, err := h.queries(ctx).CountProviderRouting(ctx, db.CountProviderRoutingParams{
		OrganizationID: organizationID, ProviderKind: h.kind(),
	})
	if err != nil {
		return err
	}
	if routing.ActiveSubscriptions == 0 && routing.OpenInvoices == 0 {
		return nil
	}
	return kaitenerrors.ConflictWithErrors(operation+".BillingActive",
		"subscriptions or unsettled invoices still route to this payment provider; cancel or switch them, and settle the invoices, first",
		&kaitenerrors.ErrorDetail{Message: "still routing", Location: "connector", Value: Routing{
			ActiveSubscriptions: routing.ActiveSubscriptions, OpenInvoices: routing.OpenInvoices,
		}})
}

// Activated announces the connection.
func (h *Hooks) Activated(ctx context.Context, organizationID uuid.UUID, settings map[string]any) error {
	return h.announce(ctx, organizationID, events.BillingProviderConnected, settings)
}

// Deactivated announces the disconnection.
func (h *Hooks) Deactivated(ctx context.Context, organizationID uuid.UUID, settings map[string]any) error {
	return h.announce(ctx, organizationID, events.BillingProviderDisconnected, settings)
}

func (h *Hooks) announce(ctx context.Context, organizationID uuid.UUID, event kaitenevents.Metadata, settings map[string]any) error {
	livemode := false
	if settings != nil {
		if parsed, err := h.binding.Parse(settings); err == nil {
			livemode = parsed.Livemode
		}
	}
	return h.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(organizationID, event.Name, event.Type, Connection{
		ProviderKind: string(h.binding.Kind()), ConnectorName: h.binding.ConnectorName, Livemode: livemode,
	}, nil))
}

// RegisterWebhooks declares the connection events' webhook contracts.
func RegisterWebhooks(api huma.API) {
	webhook.Declare(api,
		webhook.Declaration{
			Event:       events.BillingProviderConnected,
			Data:        (*Connection)(nil),
			OperationID: "onBillingProviderConnected",
			Summary:     "Billing Provider Connected Webhook",
			Description: "Triggered when an organization connects a payment provider (activates its connector).",
			Tags:        []string{"webhooks", "billing"},
		},
		webhook.Declaration{
			Event:       events.BillingProviderDisconnected,
			Data:        (*Connection)(nil),
			OperationID: "onBillingProviderDisconnected",
			Summary:     "Billing Provider Disconnected Webhook",
			Description: "Triggered when an organization disconnects a payment provider (deactivates its connector).",
			Tags:        []string{"webhooks", "billing"},
		},
	)
}
