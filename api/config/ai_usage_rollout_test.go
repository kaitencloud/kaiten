package config_test

import (
	"reflect"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/config"
)

func TestAIUsageConfigContainsDurationsNotRolloutAuthority(t *testing.T) {
	minimum(t)
	cfg, err := config.LoadConfig()
	require.NoError(t, err)
	require.Positive(t, cfg.AIUsage.IdempotencyWindow)
	require.Positive(t, cfg.AIUsage.ReservationTTL)
	require.GreaterOrEqual(t, cfg.AIUsage.ReservationMaxTTL, cfg.AIUsage.ReservationTTL)
	for field := range reflect.TypeFor[config.AIUsage]().NumField() {
		require.Equal(t, reflect.TypeFor[time.Duration](), reflect.TypeFor[config.AIUsage]().Field(field).Type)
	}
}

func TestAIUsageDurationEnvironmentOverridesFile(t *testing.T) {
	minimum(t)
	write(t, "config.yaml", "ai_usage:\n  reservation_ttl: 1m\n")
	t.Setenv("KAITEN_AI_RESERVATION_DEFAULT_TTL", "2m")
	cfg, err := config.LoadConfig()
	require.NoError(t, err)
	require.Equal(t, 2*time.Minute, cfg.AIUsage.ReservationTTL)
}
