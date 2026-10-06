package provider

import (
	"context"
	"errors"
	"log/slog"

	"github.com/google/uuid"
)

// A provider other than NOOP is configured through a connector: the
// organization stores its settings (credentials included) with the connector
// and activates it. ConnectorBinding ties the two, so that a provider is a
// manifest, an adapter and a binding, and nothing in billing or in the
// connector use cases names it.

// Availability reasons, as GET /billing/capabilities reports them.
const (
	UnavailableNotEntitled        = "NOT_ENTITLED"
	UnavailableVaultNotConfigured = "VAULT_NOT_CONFIGURED"
)

// Availability is whether an organization may connect a provider on this
// deployment, and why not.
type Availability struct {
	Available bool
	// Reason is empty when available, else one of the Unavailable* constants.
	Reason string
}

// Account is what a credential check learns about the provider account.
type Account struct {
	Livemode bool
}

// CredentialChecker is implemented by an adapter that can validate a
// connector's settings with a read-only call, before they are stored.
type CredentialChecker interface {
	CheckCredentials(ctx context.Context, settings any) (Account, error)
}

// AccountVerifier is implemented by an adapter that can tell whether settings
// reach the account a known provider customer lives in. A customer deleted in
// the provider still proves the account; only "no such customer" disproves it.
type AccountVerifier interface {
	SameAccount(ctx context.Context, settings any, externalCustomerID string) (bool, error)
}

// ParsedSettings are a connector's stored settings as billing uses them.
type ParsedSettings struct {
	// Settings is the adapter's Ref.Settings. Never logged.
	Settings     any
	AutoFinalize bool
	InclusiveTax bool
	Livemode     bool
}

// ConnectorBinding ties a provider to the connector that configures it.
type ConnectorBinding struct {
	ConnectorName string
	// EntitlementSlug is the connector manifest's; empty means ungated.
	EntitlementSlug string
	Adapter         Adapter
	// Parse turns the stored settings into ParsedSettings.
	Parse func(stored map[string]any) (ParsedSettings, error)
}

// Kind is the provider the binding configures.
func (b ConnectorBinding) Kind() Kind { return b.Adapter.Kind() }

// ErrSettingsNotFound is what a SettingsReader answers when the organization
// stored no settings for the connector.
var ErrSettingsNotFound = errors.New("provider connector settings not found")

// ActivationReader answers whether an organization activated a connector.
type ActivationReader interface {
	IsActive(ctx context.Context, organizationID uuid.UUID, connectorName string) (bool, error)
}

// SettingsReader reads a connector's stored settings, unredacted;
// ErrSettingsNotFound when there are none.
type SettingsReader interface {
	Get(ctx context.Context, organizationID uuid.UUID, connectorName string) (map[string]any, error)
}

// EntitlementChecker answers whether an organization's licence grants a
// connector's entitlement.
type EntitlementChecker interface {
	Entitled(ctx context.Context, organizationID uuid.UUID, entitlementSlug string) (bool, error)
}

// ConnectorDeps is what a connector-backed provider is resolved with.
type ConnectorDeps struct {
	Activations  ActivationReader
	Settings     SettingsReader
	Entitlements EntitlementChecker
	// VaultConfigured reports whether connector settings can be stored on
	// this deployment at all.
	VaultConfigured func() bool
}

// RegisterConnector adds a provider configured through a connector. The
// organization is connected when the connector is active and its settings
// parse; entitlement gates activation and availability only, so that a
// downgrade never strands the invoices already issued through the provider.
func (s *Static) RegisterConnector(binding ConnectorBinding, deps ConnectorDeps) {
	vaultConfigured := deps.VaultConfigured
	if vaultConfigured == nil {
		vaultConfigured = func() bool { return true }
	}
	s.Register(binding.Adapter, func(ctx context.Context, organizationID uuid.UUID) (*Connection, error) {
		if !vaultConfigured() {
			return nil, ErrNotConnected
		}
		active, err := deps.Activations.IsActive(ctx, organizationID, binding.ConnectorName)
		if err != nil {
			return nil, err
		}
		if !active {
			return nil, ErrNotConnected
		}
		stored, err := deps.Settings.Get(ctx, organizationID, binding.ConnectorName)
		if errors.Is(err, ErrSettingsNotFound) {
			return nil, ErrNotConnected
		}
		if err != nil {
			return nil, err
		}
		parsed, err := binding.Parse(stored)
		if err != nil {
			// Never the payload: it holds the credentials.
			slog.WarnContext(ctx, "billing provider connector settings do not parse",
				"connector", binding.ConnectorName, "organization_id", organizationID, "error", err)
			return nil, ErrNotConnected
		}
		return &Connection{
			Adapter:      binding.Adapter,
			Ref:          Ref{OrganizationID: organizationID, Settings: parsed.Settings},
			AutoFinalize: parsed.AutoFinalize,
			InclusiveTax: parsed.InclusiveTax,
			Livemode:     parsed.Livemode,
		}, nil
	})
	s.availability[binding.Kind()] = func(ctx context.Context, organizationID uuid.UUID) (Availability, error) {
		if !vaultConfigured() {
			return Availability{Available: false, Reason: UnavailableVaultNotConfigured}, nil
		}
		if binding.EntitlementSlug == "" || deps.Entitlements == nil {
			return Availability{Available: true, Reason: ""}, nil
		}
		entitled, err := deps.Entitlements.Entitled(ctx, organizationID, binding.EntitlementSlug)
		if err != nil {
			return Availability{}, err
		}
		if !entitled {
			return Availability{Available: false, Reason: UnavailableNotEntitled}, nil
		}
		return Availability{Available: true, Reason: ""}, nil
	}
}
