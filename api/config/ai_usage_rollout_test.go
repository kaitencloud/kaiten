package config_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/config"
)

func TestAIUsageRolloutDefaultsOff(t *testing.T) {
	minimum(t)
	t.Setenv("KAITEN_AI_USAGE_ENABLED", "")
	cfg, err := config.LoadConfig()
	require.NoError(t, err)
	assert.False(t, cfg.AIUsage.Enabled)
	assert.False(t, config.CoreConfig{}.AIUsage.Enabled)
}

func TestAIUsageRolloutEnvironmentOverridesFile(t *testing.T) {
	for _, tc := range []struct {
		name, file, environment string
		enabled                 bool
	}{
		{"file opt in", "true", "", true},
		{"environment opt in", "false", "true", true},
		{"environment turns off", "true", "false", false},
		{"explicitly off", "false", "false", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			minimum(t)
			write(t, "config.yaml", "ai_usage:\n  enabled: "+tc.file+"\n")
			t.Setenv("KAITEN_AI_USAGE_ENABLED", tc.environment)
			cfg, err := config.LoadConfig()
			require.NoError(t, err)
			assert.Equal(t, tc.enabled, cfg.AIUsage.Enabled)
		})
	}
}

func TestAIUsageRolloutInvalidValueRefusesStartup(t *testing.T) {
	minimum(t)
	t.Setenv("KAITEN_AI_USAGE_ENABLED", "not-a-boolean")
	cfg, err := config.LoadConfig()
	require.Error(t, err)
	assert.Nil(t, cfg)
}
