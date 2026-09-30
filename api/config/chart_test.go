package config

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The one seam between this package's secret classification and the Helm chart
// that renders its configuration.
//
// The chart holds a copy of the secret-bearing keys, because a Go template cannot
// read the settings table. A copy is a thing that drifts, and the way this
// particular copy drifts is silent and expensive: somebody adds a credential, the
// chart's ConfigMap guard has never heard of the key, an operator writes a value
// for it under api.config because that is where every other setting goes, and it
// renders into a ConfigMap that anything with `get configmaps` can read. Nothing
// fails. The credential is simply readable.
//
// So the copy is asserted equal, from the Go side, where the table is. An internal
// test package rather than config_test for exactly that reason: the list is one
// column of `settings` and nothing outside this package has any use for it.
//
// The guard itself is in Helm rather than here on purpose. A refusal at render
// time fails in CI, before anything reaches a cluster; a refusal at start time
// fires only after the ConfigMap already exists in the API server -- which is
// after the disclosure it was supposed to prevent.

// chartHelpers is the template file holding kaiten.apiSecretKeys. Relative to
// this package, which is two levels below the repository root.
const chartHelpers = "../../charts/kaiten/templates/_helpers.tpl"

// secretKeys is the `secret` column of the settings table.
func secretKeys() []string {
	var keys []string
	for _, s := range settings {
		if s.secret {
			keys = append(keys, s.key)
		}
	}
	return keys
}

func TestChartGuardsEverySecretKey(t *testing.T) {
	t.Parallel()

	want := secretKeys()
	require.NotEmpty(t, want, "a service with no secret-bearing settings would make this test vacuous")

	got := chartSecretKeys(t)

	// ElementsMatch rather than Equal: the chart's list is a set of keys to
	// guard, and what order they are written in is nobody's business.
	assert.ElementsMatch(t, want, got,
		"charts/kaiten/templates/_helpers.tpl's kaiten.apiSecretKeys has drifted from the "+
			"`secret` column of the settings table in api/config/config.go.\n"+
			"Every setting marked secret must be listed there, or the chart will happily render a "+
			"value for it into a ConfigMap.\n"+
			"table says: %v\nchart says: %v", want, got)
}

// chartSecretKeys reads the `- key` lines out of the kaiten.apiSecretKeys
// define. Parsed rather than rendered: `helm template` would need a whole values
// file and would only tell us the list is well-formed, not what is in it.
func chartSecretKeys(t *testing.T) []string {
	t.Helper()

	raw, err := os.ReadFile(chartHelpers)
	require.NoError(t, err, "the chart is part of this repository; if this path moved, move it here too")

	const define = `{{- define "kaiten.apiSecretKeys" -}}`

	_, after, found := strings.Cut(string(raw), define)
	require.True(t, found, "%s no longer defines kaiten.apiSecretKeys — the chart's ConfigMap guard is "+
		"what this test protects; if it was renamed, rename it here", chartHelpers)

	body, _, found := strings.Cut(after, "{{- end }}")
	require.True(t, found, "kaiten.apiSecretKeys is not terminated")

	var keys []string

	for _, line := range strings.Split(body, "\n") {
		item, ok := strings.CutPrefix(strings.TrimSpace(line), "- ")
		if !ok {
			continue
		}

		keys = append(keys, strings.TrimSpace(item))
	}

	return keys
}

// TestChartRefusesACredentialInTheConfigMap is the other half: that the list is
// actually wired to a refusal, and not merely present.
//
// A secret key may not appear in api.config at all: the loader does not expand
// ${VARIABLE} placeholders when it reads its file, so even a well-formed
// reference would be a literal string the API tries to connect with.
//
// Skipped without helm, because a developer without it should still be able to
// run the unit tests; CI has it, and `task test:charts` lints and renders both
// charts.
func TestChartRefusesACredentialInTheConfigMap(t *testing.T) {
	t.Parallel()

	helm, err := exec.LookPath("helm")
	if err != nil {
		t.Skip("helm not installed; `task test:charts` covers the rendered assertions")
	}

	chart, err := filepath.Abs("../../charts/kaiten")
	require.NoError(t, err)

	// api.enabled=false throughout, so this also asserts the guard is not hiding
	// inside the Deployment's own `if`.
	render := func(t *testing.T, key, value string) (string, error) {
		t.Helper()
		out, err := exec.Command(helm, "template", "guard", chart,
			"--set", "api.enabled=false",
			"--set", "api.config."+key+"="+value).CombinedOutput()
		return string(out), err
	}

	for _, key := range secretKeys() {
		t.Run(key, func(t *testing.T) {
			t.Parallel()

			out, err := render(t, key, "whatever-a-credential-looks-like")
			require.Error(t, err, "api.config.%s took a literal value instead of being refused:\n%s", key, out)
			assert.Contains(t, out, key,
				"the render was refused, but the message does not name the key an operator has to fix")

			// The loader does not expand ${VARIABLE}, so the chart must refuse a
			// reference exactly like any other value.
			out, err = render(t, key, `${KAITEN_A_SECRET_REF}`)
			require.Error(t, err, "api.config.%s took a ${VARIABLE} reference, which the loader no "+
				"longer expands, so this would render a working ConfigMap for a process that cannot "+
				"start:\n%s", key, out)
		})
	}
}
