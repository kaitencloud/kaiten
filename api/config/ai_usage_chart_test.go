package config

import (
	"os/exec"
	"strings"
	"testing"

	"github.com/goccy/go-yaml"
	"github.com/stretchr/testify/require"
)

func TestChartAIUsageContainsNoRolloutSwitch(t *testing.T) {
	t.Parallel()
	helm, err := exec.LookPath("helm")
	if err != nil {
		t.Skip("helm unavailable; chart rendering not verified")
	}
	out, err := exec.Command(helm, "template", "ai-policy", "../../charts/kaiten", "--set", "api.enabled=true").CombinedOutput()
	require.NoError(t, err, string(out))
	found := false
	for _, document := range strings.Split(string(out), "\n---") {
		var manifest struct {
			Kind string            `yaml:"kind"`
			Data map[string]string `yaml:"data"`
		}
		require.NoError(t, yaml.Unmarshal([]byte(document), &manifest))
		if manifest.Kind != "ConfigMap" || manifest.Data["config.yaml"] == "" {
			continue
		}
		var cfg struct {
			AIUsage map[string]any `yaml:"ai_usage"`
		}
		require.NoError(t, yaml.Unmarshal([]byte(manifest.Data["config.yaml"]), &cfg))
		require.NotContains(t, cfg.AIUsage, "enabled")
		found = true
	}
	require.True(t, found, "API config map must be rendered")
}
