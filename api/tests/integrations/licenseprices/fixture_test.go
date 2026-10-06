package licenseprices_test

import (
	"context"
	"errors"
	"net/http"
	"os"
	"sync"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/config"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
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
)

func TestMain(m *testing.M) {
	var err error
	testDb, err = tests.NewTestDatabase()
	if err != nil {
		panic("failed to setup test database: " + err.Error())
	}
	defer testDb.TearDown()

	testServer = tests.NewTestServer(testDb, tests.TestServerOptions{
		ConfigOverride:        func(cfg *config.Config) { cfg.Billing.Enabled = true },
		ConnectorEntitlements: entitlements,
	})
	disabledServer = tests.NewTestServer(testDb)

	os.Exit(m.Run())
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

// newVersion creates a licence version in state and returns its slug. An
// ARCHIVED one is created published, then archived: the API creates none
// archived.
func newVersion(t *testing.T, name string, state schema.LifecycleState) string {
	t.Helper()
	created := state
	if state == schema.Archived {
		created = schema.Published
	}
	license := commonfixture.AssertJSONResponse[schema.License](t, call(t, "POST", "/api/licenses", map[string]any{
		"name": name, "description": "d", "type": "PAID", "isDefault": false, "lifecycleState": created,
	}), fiber.StatusCreated)
	if state == schema.Archived {
		resp := call(t, "POST", "/api/licenses/"+license.Slug+"/archive", nil)
		require.Less(t, resp.StatusCode, 300)
	}
	return license.Slug
}

// newEntitlement creates a NUMBER entitlement. resetPeriod "" makes it a stock.
func newEntitlement(t *testing.T, slug, resetPeriod string, saleUnitFactor float64) {
	t.Helper()
	payload := map[string]any{"name": slug, "slug": slug, "description": slug, "type": "NUMBER", "aggregationMethod": "SUM"}
	if resetPeriod != "" {
		payload["resetPeriod"] = resetPeriod
	}
	if saleUnitFactor != 0 {
		payload["unitSingular"] = "token"
		payload["unitPlural"] = "tokens"
		payload["saleUnitFactor"] = saleUnitFactor
		payload["saleUnitSingular"] = "10k tokens"
		payload["saleUnitPlural"] = "10k tokens"
	}
	commonfixture.AssertJSONResponse[map[string]any](t, call(t, "POST", "/api/entitlements", payload), fiber.StatusCreated)
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
