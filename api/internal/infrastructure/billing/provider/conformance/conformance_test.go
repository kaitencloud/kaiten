package conformance_test

import (
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider/conformance"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider/fakeprovider"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider/noop"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/stripe"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/stripe/stripefake"
)

func TestNoop(t *testing.T) {
	conformance.Run(t, func(*testing.T) conformance.Subject {
		return conformance.Subject{Adapter: noop.New(), Ref: provider.Ref{OrganizationID: uuid.New(), Settings: nil}}
	})
}

func TestFakeProvider(t *testing.T) {
	conformance.Run(t, func(*testing.T) conformance.Subject {
		return conformance.Subject{Adapter: fakeprovider.New(provider.KindStripe), Ref: provider.Ref{OrganizationID: uuid.New(), Settings: nil}}
	})
}

// TestStripe runs the contract against the Stripe adapter, pointed at the
// in-process fake Stripe.
func TestStripe(t *testing.T) {
	conformance.Run(t, func(t *testing.T) conformance.Subject {
		fake := stripefake.New(t)
		adapter := stripe.New(stripe.Options{BaseURL: fake.URL(), HTTPClient: fake.Client(), SendAfterFinalize: false, Now: nil})
		return conformance.Subject{Adapter: adapter, Ref: provider.Ref{
			OrganizationID: uuid.New(),
			Settings:       &stripe.Settings{SecretKey: "rk_test_conformance", AutomaticTax: false, TaxBehavior: stripe.TaxExclusive, AutoFinalize: true},
		}}
	})
}

// TestStripeSandbox runs the contract against Stripe's own test mode, with
// the restricted key in KAITEN_STRIPE_TEST_KEY; skipped without one.
func TestStripeSandbox(t *testing.T) {
	key := os.Getenv("KAITEN_STRIPE_TEST_KEY")
	if !strings.HasPrefix(key, "rk_test_") {
		t.Skip("KAITEN_STRIPE_TEST_KEY (an rk_test_ key) is not set")
	}
	conformance.Run(t, func(*testing.T) conformance.Subject {
		return conformance.Subject{Adapter: stripe.New(stripe.Options{}), Ref: provider.Ref{
			OrganizationID: uuid.New(),
			Settings:       &stripe.Settings{SecretKey: key, AutomaticTax: false, TaxBehavior: stripe.TaxExclusive, AutoFinalize: true},
		}}
	})
}
