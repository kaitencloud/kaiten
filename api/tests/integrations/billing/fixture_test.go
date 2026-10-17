package billing_test

import (
	"context"
	"errors"
	"net/http"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/config"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider/fakeprovider"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider/noop"
	customerschema "github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

var (
	testDb *tests.TestDatabase
	// testServer has billing enabled, and asks entitlements whether the
	// organization is sold billing.
	testServer   *tests.TestServer
	entitlements = &switchableEntitlements{entitled: true}
	// disabledServer runs with the default configuration: billing off.
	disabledServer *tests.TestServer
	// platformServer authenticates every request as the platform credential.
	platformServer *tests.TestServer
	// providerServer bills through a fake payment provider, recorded as
	// STRIPE, whose push job runs every few milliseconds.
	providerServer *tests.TestServer
	providers      = &fakeProviders{fake: fakeprovider.New(provider.KindStripe), connected: true, autoFinalize: true}
)

func TestMain(m *testing.M) {
	var err error
	testDb, err = tests.NewTestDatabase()
	if err != nil {
		panic("failed to setup test database: " + err.Error())
	}
	defer testDb.TearDown()

	testServer = tests.NewTestServer(testDb, tests.TestServerOptions{
		ConfigOverride: func(cfg *config.Config) {
			cfg.Billing.Enabled = true
			// Tests close periods themselves; the job would race them.
			cfg.Billing.PeriodClose.Interval = -1
		},
		ConnectorEntitlements: entitlements,
	})
	disabledServer = tests.NewTestServer(testDb)
	platformServer = tests.NewTestServer(testDb, tests.TestServerOptions{
		ConfigOverride: func(cfg *config.Config) {
			cfg.Billing.Enabled = true
			cfg.Billing.PeriodClose.Interval = -1
		},
		PlatformCredential: true,
	})

	registry := provider.NewStatic(noop.New())
	registry.Register(providers.fake, providers.resolve)
	providerServer = tests.NewTestServer(testDb, tests.TestServerOptions{
		ConfigOverride: func(cfg *config.Config) {
			cfg.Billing.Enabled = true
			cfg.Billing.PeriodClose.Interval = -1
			cfg.Billing.Lifecycle.Interval = -1
			cfg.Billing.Sync.Interval = -1
			cfg.Billing.InitialDelay = 20 * time.Millisecond
			cfg.Billing.Push.Interval = 50 * time.Millisecond
			cfg.Billing.Push.MaxBackoff = 200 * time.Millisecond
			cfg.Billing.Push.AlertAfterAttempts = 2
		},
		ConnectorEntitlements: entitlements,
		BillingProviders:      registry,
	})

	os.Exit(m.Run())
}

// fakeProviders is the payment provider of providerServer: a fresh fake per
// test, connected or not, finalizing at once or leaving drafts for review.
type fakeProviders struct {
	mu           sync.Mutex
	fake         *fakeprovider.Fake
	connected    bool
	autoFinalize bool
}

func (p *fakeProviders) resolve(_ context.Context, organizationID uuid.UUID) (*provider.Connection, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if !p.connected {
		return nil, provider.ErrNotConnected
	}
	return &provider.Connection{
		Adapter: p.fake, Ref: provider.Ref{OrganizationID: organizationID, Settings: nil}, AutoFinalize: p.autoFinalize, InclusiveTax: false,
	}, nil
}

// use installs a fresh fake for a test, connected, finalizing at once unless
// review is asked.
func (p *fakeProviders) use(t *testing.T, review bool) *fakeprovider.Fake {
	t.Helper()
	p.mu.Lock()
	defer p.mu.Unlock()
	p.fake, p.connected, p.autoFinalize = fakeprovider.New(provider.KindStripe), true, !review
	return p.fake
}

func (p *fakeProviders) connect(connected bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.connected = connected
}

// switchableEntitlements answers the billing entitlement as a test sets it.
type switchableEntitlements struct {
	mu       sync.Mutex
	entitled bool
	fail     bool
}

func (s *switchableEntitlements) Entitled(context.Context, uuid.UUID, string) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.fail {
		return false, errors.New("licensing authority unreachable")
	}
	return s.entitled, nil
}

func (s *switchableEntitlements) set(t *testing.T, entitled, fail bool) {
	t.Helper()
	s.mu.Lock()
	s.entitled, s.fail = entitled, fail
	s.mu.Unlock()
	t.Cleanup(func() {
		s.mu.Lock()
		s.entitled, s.fail = true, false
		s.mu.Unlock()
	})
}

func callOn(t *testing.T, server *tests.TestServer, method, path string, payload any) *http.Response {
	t.Helper()
	req := commonfixture.NewJSONRequest(t, method, path, payload)
	resp, err := server.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	t.Cleanup(func() { commonfixture.MustCloseBody(t, resp.Body) })
	return resp
}

func call(t *testing.T, method, path string, payload any) *http.Response {
	t.Helper()
	return callOn(t, testServer, method, path, payload)
}

// newVersion creates a licence version in state and returns it. An ARCHIVED
// one is created published, then archived: the API creates none archived.
func newVersion(t *testing.T, name string, state licenseschema.LifecycleState) licenseschema.License {
	t.Helper()
	created := state
	if state == licenseschema.Archived {
		created = licenseschema.Published
	}
	license := commonfixture.AssertJSONResponse[licenseschema.License](t, call(t, "POST", "/api/licenses", map[string]any{
		"name": name, "description": "d", "type": "PAID", "isDefault": false, "lifecycleState": created,
	}), fiber.StatusCreated)
	if state == licenseschema.Archived {
		resp := call(t, "POST", "/api/licenses/"+license.Slug+"/archive", nil)
		require.Less(t, resp.StatusCode, 300)
	}
	return license
}

// newEntitlement creates a SUM NUMBER entitlement that resets monthly and
// returns its id. saleUnitFactor 0 gives it no sale unit.
func newEntitlement(t *testing.T, slug string, saleUnitFactor float64) uuid.UUID {
	t.Helper()
	payload := map[string]any{
		"name": slug, "slug": slug, "description": slug, "type": "NUMBER",
		"aggregationMethod": "SUM", "resetPeriod": "MONTH",
	}
	if saleUnitFactor != 0 {
		payload["unitSingular"] = "token"
		payload["unitPlural"] = "tokens"
		payload["saleUnitFactor"] = saleUnitFactor
		payload["saleUnitSingular"] = "10k tokens"
		payload["saleUnitPlural"] = "10k tokens"
	}
	created := commonfixture.AssertJSONResponse[map[string]any](t, call(t, "POST", "/api/entitlements", payload), fiber.StatusCreated)
	return uuid.MustParse(created["id"].(string))
}

// grant gives the version the entitlement with limit and overage percent.
func grant(t *testing.T, licenseSlug, entitlementSlug string, limit float64, overagePercent int32) {
	t.Helper()
	resp := call(t, "POST", "/api/licenses/"+licenseSlug+"/entitlements", map[string]any{
		"entitlementSlug":                entitlementSlug,
		"value":                          map[string]any{"type": "number", "value": limit},
		"limitCapExceededOveragePercent": overagePercent,
	})
	require.Contains(t, []int{fiber.StatusOK, fiber.StatusCreated, fiber.StatusNoContent}, resp.StatusCode)
}

func flatFee(amount, period string) map[string]any {
	return map[string]any{"billingModel": "FLAT_FEE", "billingPeriod": period, "currency": "EUR", "unitAmountDecimal": amount}
}

func metered(model, entitlementSlug, amount string) map[string]any {
	return map[string]any{"billingModel": model, "currency": "EUR", "unitAmountDecimal": amount, "meteredEntitlementSlug": entitlementSlug}
}

func createPrice(t *testing.T, licenseSlug string, payload map[string]any) prices.Price {
	t.Helper()
	return commonfixture.AssertJSONResponse[prices.Price](t,
		call(t, "POST", "/api/licenses/"+licenseSlug+"/prices", payload), fiber.StatusCreated)
}

// newCustomer creates a customer and returns its slug and id.
func newCustomer(t *testing.T, name string) customerschema.Customer {
	t.Helper()
	return commonfixture.AssertJSONResponse[customerschema.Customer](t,
		call(t, "POST", "/api/customers", map[string]any{"name": name, "billingEmail": "billing@" + name + ".test"}), fiber.StatusCreated)
}

// newInstance creates an instance of customer on license and returns it.
func newInstance(t *testing.T, name string, customerID, licenseID uuid.UUID) instanceschema.Instance {
	t.Helper()
	return commonfixture.AssertJSONResponse[instanceschema.Instance](t, call(t, "POST", "/api/instances", map[string]any{
		"name": name, "description": "d", "customerId": customerID, "licenseId": licenseID,
		"startLicenseDate": time.Now().UTC().Add(-24 * time.Hour), "endLicenseDate": time.Now().UTC().AddDate(1, 0, 0),
		"metadata": map[string]any{},
	}), fiber.StatusCreated)
}
