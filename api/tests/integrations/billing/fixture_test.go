package billing_test

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
