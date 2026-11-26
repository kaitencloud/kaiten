package identity_test

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/createserviceaccount"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/schema"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// gatedCounter stands in for the licensing authority: it sets a stock counter and
// refuses a value beyond limit, as Core's usage report does on a hard grant.
type gatedCounter struct {
	services.NoopUsageReporter

	mu     sync.Mutex
	limit  float64
	values map[string][]float64
}

func (c *gatedCounter) SetUsage(_ context.Context, _ uuid.UUID, slug string, value float64) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.values[slug] = append(c.values[slug], value)
	if value > c.limit {
		return fmt.Errorf("enforce %q limit: %w", slug, dogfooding.ErrThresholdExceeded)
	}
	return nil
}

func (c *gatedCounter) set(slug string) []float64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]float64(nil), c.values[slug]...)
}

func TestCreateServiceAccountIsGatedByTheLicence(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	var held int64
	require.NoError(t, testDb.DbPool.QueryRow(t.Context(),
		`SELECT count(*) FROM "user" WHERE type = 'machine' AND organization_id = $1 AND deleted_at IS NULL`,
		testDb.DefaultData.OrganizationID).Scan(&held))

	// Room for exactly one more account than the organization already holds.
	counter := &gatedCounter{limit: float64(held + 1), values: map[string][]float64{}}
	server := tests.NewTestServer(testDb, tests.TestServerOptions{
		OrganizationID: &testDb.DefaultData.OrganizationID,
		UsageReporter:  counter,
	})
	t.Cleanup(func() { require.NoError(t, server.Close()) })

	create := func(name string) (int, string) {
		resp, err := server.App.Test(commonfixture.NewJSONRequest(t, "POST", "/api/service-accounts", schema.ServiceAccount{Name: name}), fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		var problem struct {
			Code string `json:"code"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&problem)
		return resp.StatusCode, problem.Code
	}

	// The counter is set to the number held once the account exists, so accounts
	// created before the entitlement are counted without a backfill.
	status, _ := create("First")
	require.Equal(t, fiber.StatusCreated, status)
	require.Equal(t, []float64{float64(held + 1)}, counter.set(dogfooding.ServiceAccountEntitlementSlug))

	status, code := create("Second")
	require.Equal(t, fiber.StatusConflict, status)
	require.Equal(t, createserviceaccount.EntitlementLimitReachedCode, code)

	var after int64
	require.NoError(t, testDb.DbPool.QueryRow(t.Context(),
		`SELECT count(*) FROM "user" WHERE type = 'machine' AND organization_id = $1 AND deleted_at IS NULL`,
		testDb.DefaultData.OrganizationID).Scan(&after))
	require.Equal(t, held+1, after, "a refused create persists nothing")
}

func TestDeleteServiceAccountGivesItsPlaceBack(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	var held int64
	require.NoError(t, testDb.DbPool.QueryRow(t.Context(),
		`SELECT count(*) FROM "user" WHERE type = 'machine' AND organization_id = $1 AND deleted_at IS NULL`,
		testDb.DefaultData.OrganizationID).Scan(&held))

	// Room for exactly one more account, as a Starter licence with one granted.
	counter := &gatedCounter{limit: float64(held + 1), values: map[string][]float64{}}
	server := tests.NewTestServer(testDb, tests.TestServerOptions{
		OrganizationID: &testDb.DefaultData.OrganizationID,
		UsageReporter:  counter,
	})
	t.Cleanup(func() { require.NoError(t, server.Close()) })

	call := func(method, url string, payload any) int {
		resp, err := server.App.Test(commonfixture.NewJSONRequest(t, method, url, payload), fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		return resp.StatusCode
	}

	require.Equal(t, fiber.StatusCreated, call("POST", "/api/service-accounts", schema.ServiceAccount{Name: "First", Slug: "first"}))
	require.Equal(t, fiber.StatusConflict, call("POST", "/api/service-accounts", schema.ServiceAccount{Name: "Second"}))

	// The delete sets the counter back to the accounts still held, so the
	// organization can replace the one it had.
	require.Equal(t, fiber.StatusNoContent, call("DELETE", "/api/service-accounts/first", nil))
	set := counter.set(dogfooding.ServiceAccountEntitlementSlug)
	require.Equal(t, float64(held), set[len(set)-1])

	require.Equal(t, fiber.StatusCreated, call("POST", "/api/service-accounts", schema.ServiceAccount{Name: "Replacement"}))
}
