package provider_test

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider/fakeprovider"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider/noop"
)

type activations map[uuid.UUID]bool

func (a activations) IsActive(_ context.Context, org uuid.UUID, _ string) (bool, error) { return a[org], nil }

type settingsStore map[uuid.UUID]map[string]any

func (s settingsStore) Get(_ context.Context, org uuid.UUID, _ string) (map[string]any, error) {
	stored, ok := s[org]
	if !ok {
		return nil, provider.ErrSettingsNotFound
	}
	return stored, nil
}

type entitlements struct {
	entitled bool
	err      error
}

func (e entitlements) Entitled(context.Context, uuid.UUID, string) (bool, error) { return e.entitled, e.err }

func binding() provider.ConnectorBinding {
	return provider.ConnectorBinding{
		ConnectorName: "kaiten.integration.billing.fake", EntitlementSlug: "connector-fake",
		Adapter: fakeprovider.New(provider.KindStripe),
		Parse: func(stored map[string]any) (provider.ParsedSettings, error) {
			key, _ := stored["key"].(string)
			if key == "" {
				return provider.ParsedSettings{}, errors.New("no key")
			}
			return provider.ParsedSettings{Settings: key, AutoFinalize: true, InclusiveTax: true, Livemode: key == "live"}, nil
		},
	}
}

func TestConnectorProviderResolvesFromActivationAndSettings(t *testing.T) {
	inactive, noSettings, broken, connected := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	registry := provider.NewStatic(noop.New())
	registry.RegisterConnector(binding(), provider.ConnectorDeps{
		Activations: activations{noSettings: true, broken: true, connected: true},
		Settings:    settingsStore{broken: {"key": ""}, connected: {"key": "live"}},
		Entitlements: entitlements{entitled: true, err: nil}, VaultConfigured: func() bool { return true },
	})

	for name, org := range map[string]uuid.UUID{"inactive": inactive, "no settings": noSettings, "unparseable": broken} {
		if _, err := registry.Resolve(context.Background(), org, provider.KindStripe); !errors.Is(err, provider.ErrNotConnected) {
			t.Errorf("%s: got %v, want ErrNotConnected", name, err)
		}
	}
	conn, err := registry.Resolve(context.Background(), connected, provider.KindStripe)
	if err != nil {
		t.Fatalf("connected: %v", err)
	}
	if conn.Ref.Settings != "live" || !conn.AutoFinalize || !conn.InclusiveTax || !conn.Livemode || conn.Ref.OrganizationID != connected {
		t.Fatalf("the connection carries the parsed settings: %+v", conn)
	}
	if _, err := registry.Resolve(context.Background(), connected, provider.KindNoop); err != nil {
		t.Fatalf("NOOP is always connected: %v", err)
	}
	if _, err := registry.Resolve(context.Background(), connected, "LAGO"); !errors.Is(err, provider.ErrNotConnected) {
		t.Fatalf("an unknown provider is not connected: %v", err)
	}
}

func TestConnectorProviderAvailability(t *testing.T) {
	org := uuid.New()
	cases := map[string]struct {
		vault        bool
		entitlements entitlements
		want         provider.Availability
		wantErr      bool
	}{
		"available":     {vault: true, entitlements: entitlements{entitled: true}, want: provider.Availability{Available: true}},
		"not entitled":  {vault: true, entitlements: entitlements{entitled: false}, want: provider.Availability{Reason: provider.UnavailableNotEntitled}},
		"no vault":      {vault: false, entitlements: entitlements{entitled: true}, want: provider.Availability{Reason: provider.UnavailableVaultNotConfigured}},
		"licence error": {vault: true, entitlements: entitlements{err: errors.New("down")}, wantErr: true},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			registry := provider.NewStatic(noop.New())
			vault := tc.vault
			registry.RegisterConnector(binding(), provider.ConnectorDeps{
				Activations: activations{}, Settings: settingsStore{}, Entitlements: tc.entitlements,
				VaultConfigured: func() bool { return vault },
			})
			got, err := registry.Availability(context.Background(), org, provider.KindStripe)
			if (err != nil) != tc.wantErr {
				t.Fatalf("error %v, want error %v", err, tc.wantErr)
			}
			if got != tc.want {
				t.Fatalf("got %+v, want %+v", got, tc.want)
			}
			if noopAvailability, _ := registry.Availability(context.Background(), org, provider.KindNoop); !noopAvailability.Available {
				t.Fatal("NOOP is always available")
			}
		})
	}
}

func TestRefusedCurrencies(t *testing.T) {
	caps := provider.Capabilities{RefusedCurrencies: []string{"HUF"}}
	if caps.AcceptsCurrency("HUF") || !caps.AcceptsCurrency("EUR") {
		t.Fatal("a refused currency is refused, any other accepted")
	}
	caps.Currencies = []string{"HUF", "EUR"}
	if caps.AcceptsCurrency("HUF") {
		t.Fatal("a refused currency is refused even when allowed")
	}
}
