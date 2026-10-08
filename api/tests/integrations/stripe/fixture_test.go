// Package stripe_test drives the Stripe connector end to end through the API:
// the real Stripe adapter, pointed at the in-process fake Stripe, on a real
// database, with the push job running every few milliseconds.
package stripe_test

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/config"
	billingstripe "github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/stripe"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/stripe/stripefake"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscribeinstance"
	connectorstripe "github.com/kaitencloud/kaiten/api/internal/modules/connectors/stripe"
	customerschema "github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

const (
	connector = "kaiten.integration.billing.stripe"
	testKey   = "rk_test_A1"
)

var (
	testDb       *tests.TestDatabase
	testServer   *tests.TestServer
	fake         *stripefake.Fake
	entitlements = &switchableEntitlements{}
)

func TestMain(m *testing.M) {
	// Connector settings live in Vault: the development file store, for the
	// whole package (vault.Configured reads the environment at each call, so
	// a test can unset it).
	dir, err := os.MkdirTemp("", "stripe-vault")
	if err != nil {
		panic(err)
	}
	_ = os.Setenv("VAULT_ADDR", "")
	_ = os.Setenv("VAULT_FAKE_FILE_PATH", filepath.Join(dir, "vault.json"))

	testDb, err = tests.NewTestDatabase()
	if err != nil {
		panic("failed to setup test database: " + err.Error())
	}
	fake = stripefake.Start()

	testServer = tests.NewTestServer(testDb, tests.TestServerOptions{
		ConfigOverride: func(cfg *config.Config) {
			cfg.Billing.Enabled = true
			cfg.Billing.PeriodClose.Interval = -1
			cfg.Billing.Lifecycle.Interval = -1
			cfg.Billing.Sync.Interval = -1
			cfg.Billing.InitialDelay = 20 * time.Millisecond
			cfg.Billing.Push.Interval = 50 * time.Millisecond
			cfg.Billing.Push.MaxBackoff = 200 * time.Millisecond
			cfg.Billing.Push.AlertAfterAttempts = 2
			cfg.Billing.AutoCollectionGrace = 2 * time.Hour
		},
		ConnectorEntitlements: entitlements,
		Stripe:                billingstripe.Options{BaseURL: fake.URL(), HTTPClient: fake.Client()},
	})

	code := m.Run()
	fake.Close()
	testDb.TearDown()
	_ = os.RemoveAll(dir)
	os.Exit(code)
}

// fresh registers the connector (a database reset forgets the registration
// the server made at boot), and resets the database and the fake Stripe after
// the test.
func fresh(t *testing.T) {
	t.Helper()
	manifest := connectorstripe.Manifest()
	schema, err := json.Marshal(manifest.SettingsSchema)
	require.NoError(t, err)
	_, err = testServer.Dependencies.DB.Exec(t.Context(),
		`INSERT INTO connector (name, version, settings_schema, entitlement_slug) VALUES ($1, $2, $3::jsonb, $4)
		 ON CONFLICT (name) DO NOTHING`, manifest.Name, manifest.Version, string(schema), *manifest.EntitlementSlug)
	require.NoError(t, err)
	fake.Reset()
	// Vault is a file the database reset does not touch.
	require.NoError(t, os.WriteFile(os.Getenv("VAULT_FAKE_FILE_PATH"), []byte("{}"), 0o600)) //nolint:gosec // the temp file TestMain created
	t.Cleanup(func() {
		fake.Reset()
		require.NoError(t, testDb.Reset())
	})
}

type switchableEntitlements struct {
	mu       sync.Mutex
	entitled map[string]bool
}

func (s *switchableEntitlements) Entitled(_ context.Context, _ uuid.UUID, slug string) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if v, ok := s.entitled[slug]; ok {
		return v, nil
	}
	return true, nil
}

// deny makes the licence refuse one entitlement for the test.
func (s *switchableEntitlements) deny(t *testing.T, slug string) {
	t.Helper()
	s.mu.Lock()
	if s.entitled == nil {
		s.entitled = map[string]bool{}
	}
	s.entitled[slug] = false
	s.mu.Unlock()
	t.Cleanup(func() {
		s.mu.Lock()
		delete(s.entitled, slug)
		s.mu.Unlock()
	})
}

func call(t *testing.T, method, path string, payload any) *http.Response {
	t.Helper()
	req := commonfixture.NewJSONRequest(t, method, path, payload)
	resp, err := testServer.App.Test(req, fiber.TestConfig{Timeout: 30 * time.Second})
	require.NoError(t, err)
	t.Cleanup(func() { commonfixture.MustCloseBody(t, resp.Body) })
	return resp
}

func problem(t *testing.T, status int, method, path string, payload any) kaitenerrors.Problem {
	t.Helper()
	return commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, call(t, method, path, payload), status)
}

// connect stores the Stripe settings, which activates the connector.
func connect(t *testing.T, settings map[string]any) map[string]any {
	t.Helper()
	if settings == nil {
		settings = map[string]any{"stripeSecretKey": testKey}
	}
	return commonfixture.AssertJSONResponse[map[string]any](t,
		call(t, "PUT", "/api/connectors/"+connector+"/settings", map[string]any{"settings": settings}), fiber.StatusOK)
}

type sold struct {
	version  licenseschema.License
	monthly  prices.Price
	customer customerschema.Customer
	instance instanceschema.Instance
}

// newSold is a published version at 29.00 EUR a month, a customer with a
// billing e-mail, and an instance of it.
func newSold(t *testing.T, name string) sold {
	t.Helper()
	version := commonfixture.AssertJSONResponse[licenseschema.License](t, call(t, "POST", "/api/licenses", map[string]any{
		"name": "Pro " + name, "description": "d", "type": "PAID", "isDefault": false, "lifecycleState": licenseschema.Published,
	}), fiber.StatusCreated)
	monthly := commonfixture.AssertJSONResponse[prices.Price](t, call(t, "POST", "/api/licenses/"+version.Slug+"/prices", map[string]any{
		"billingModel": "FLAT_FEE", "billingPeriod": "MONTHLY", "currency": "EUR", "unitAmountDecimal": "2900", "isDefault": true,
	}), fiber.StatusCreated)
	customer := commonfixture.AssertJSONResponse[customerschema.Customer](t,
		call(t, "POST", "/api/customers", map[string]any{"name": name, "billingEmail": "ap@" + name + ".test"}), fiber.StatusCreated)
	instance := commonfixture.AssertJSONResponse[instanceschema.Instance](t, call(t, "POST", "/api/instances", map[string]any{
		"name": name + " prod", "description": "d", "customerId": customer.ID, "licenseId": version.ID,
		"startLicenseDate": time.Now().UTC().Add(-24 * time.Hour), "endLicenseDate": time.Now().UTC().AddDate(1, 0, 0),
		"metadata": map[string]any{},
	}), fiber.StatusCreated)
	return sold{version: version, monthly: monthly, customer: customer, instance: instance}
}

// subscribe subscribes the instance through Stripe; its ACTIVATION enters
// the push queue.
func subscribe(t *testing.T, s sold) subscribeinstance.StartedSubscription {
	t.Helper()
	return commonfixture.AssertJSONResponse[subscribeinstance.StartedSubscription](t,
		call(t, "POST", "/api/instances/"+s.instance.Slug+"/billing", map[string]any{"basePriceId": s.monthly.ID, "providerKind": "STRIPE"}),
		fiber.StatusCreated)
}

func invoice(t *testing.T, id uuid.UUID) invoices.Invoice {
	t.Helper()
	return commonfixture.AssertJSONResponse[invoices.Invoice](t, call(t, "GET", "/api/invoices/"+id.String(), nil), fiber.StatusOK)
}

// waitFor waits for the jobs to bring an invoice to a condition.
func waitFor(t *testing.T, id uuid.UUID, condition func(invoices.Invoice) bool, what string) invoices.Invoice {
	t.Helper()
	var last invoices.Invoice
	ok := assertEventually(func() bool {
		last = invoice(t, id)
		return condition(last)
	}, 10*time.Second, 25*time.Millisecond)
	if !ok {
		status, lastError := last.Status, ""
		if last.Provider != nil && last.Provider.LastPushError != nil {
			lastError = *last.Provider.LastPushError
		}
		t.Fatalf("%s: invoice %s is %s, last push error %q", what, id, status, lastError)
	}
	return last
}

// outboxCount counts an event type in the default organization's outbox.
func outboxCount(t *testing.T, eventName string) int {
	t.Helper()
	n := 0
	for _, event := range commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID) {
		if event.EventName == eventName {
			n++
		}
	}
	return n
}

func assertEventually(condition func() bool, wait, tick time.Duration) bool {
	deadline := time.Now().Add(wait)
	for time.Now().Before(deadline) {
		if condition() {
			return true
		}
		time.Sleep(tick)
	}
	return condition()
}
