package connectors_test

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/tests"
)

// gatedCounter stands in for the licensing authority: it sets a stock counter and
// refuses a value beyond limit, as Core's usage report does on a hard grant.
type gatedCounter struct {
	services.NoopUsageReporter

	mu     sync.Mutex
	limit  float64
	values []float64
}

func (c *gatedCounter) SetUsage(_ context.Context, _ uuid.UUID, slug string, value float64) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if slug != dogfooding.ConnectorEntitlementSlug {
		return nil
	}
	c.values = append(c.values, value)
	if value > c.limit {
		return fmt.Errorf("enforce %q limit: %w", slug, dogfooding.ErrThresholdExceeded)
	}
	return nil
}

func (c *gatedCounter) set() []float64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]float64(nil), c.values...)
}

// A licence that allows one active connector: the second activation is refused, a
// repeat of the first is not counted, and a deactivation gives the connector back.
func TestActivationIsGatedByTheNumberOfActiveConnectors(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	const second = "kaiten.integration.crm.second"
	registerConnector(t, connectorName, entitlementSlug)
	registerConnector(t, second, nil)

	useFakeVault(t)
	counter := &gatedCounter{limit: 1}
	server := tests.NewTestServer(testDb, tests.TestServerOptions{
		OrganizationID:        &testDb.DefaultData.OrganizationID,
		ConnectorEntitlements: &stubEntitlements{entitled: true},
		UsageReporter:         counter,
	})

	require.Equal(t, http.StatusOK, activate(t, server, connectorName))
	require.Equal(t, []float64{1}, counter.set())

	require.Equal(t, http.StatusOK, activate(t, server, connectorName))
	require.Equal(t, []float64{1}, counter.set(), "activating an active connector counts nothing")

	require.Equal(t, http.StatusConflict, activate(t, server, second))
	assert.False(t, getState(t, server, second).Activated, "a refused activation leaves no row")

	require.Equal(t, http.StatusNoContent, deactivate(t, server, connectorName))
	require.Equal(t, []float64{1, 2, 0}, counter.set(), "a deactivation sets the counter to what is still active")

	require.Equal(t, http.StatusOK, activate(t, server, second))
	require.Equal(t, []float64{1, 2, 0, 1}, counter.set())
}
