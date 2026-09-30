package connectors_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/attio"
	"github.com/kaitencloud/kaiten/api/pkg/dogfooding"
)

// A connector compiled into this binary registers itself at startup, through the
// in-process facade, and that has to be true of the running server rather than of a
// unit test of the registrar: updatesettings fails closed on an unregistered connector,
// so a deployment that boots without the row is a deployment where nobody can configure
// a connector that is demonstrably there.
func TestTheConnectorsThisBinaryShipsAreRegisteredAtStartup(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	newServer(t, &stubEntitlements{entitled: true})

	row := readConnectorRow(t, attio.Name)

	assert.Equal(t, attio.Version, row.version)
	require.NotNil(t, row.entitlementSlug, "the connector is an enterprise feature and must name its licence")
	assert.Equal(t, dogfooding.ConnectorAttioEntitlementSlug, *row.entitlementSlug)

	// The row and the manifest, not the row and a copy of it: what the console renders
	// its settings form from is this schema, and the connector reads the payload that
	// form produces.
	assert.JSONEq(t, mustJSON(t, attio.Manifest().SettingsSchema), row.settingsSchema)
}

// The failure mode worth pinning is a second registration appearing -- from a
// redeploy or a restart. Registration upserts on the name, so a second boot
// must leave one row, not two.
func TestStartupRegistrationLeavesExactlyOneRowPerConnector(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	newServer(t, &stubEntitlements{entitled: true})
	require.Equal(t, 1, countConnectorRows(t, attio.Name))

	// A restart, as far as the database is concerned.
	newServer(t, &stubEntitlements{entitled: true})
	assert.Equal(t, 1, countConnectorRows(t, attio.Name),
		"a redeploy must not add a second registration for the same connector")
}

// The end of the round trip: the schema registered at startup is the one an
// organization's settings are validated against, and the connector's own resolver reads
// the payload that passes. A drift between the two would show up here as a 422 on a
// settings write that the connector would have been perfectly able to sync with.
func TestTheRegisteredSchemaAcceptsTheSettingsTheConnectorReads(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	server := newServer(t, &stubEntitlements{entitled: true})

	code := status(t, server, http.MethodPut, "/api/connectors/"+attio.Name+"/settings", map[string]any{
		"settings": map[string]any{
			"attioApiKey":   "secret",
			"attioApiUrl":   "https://api.attio.com",
			"syncPolicy":    "create-and-bind",
			"fieldsMapping": map[string]any{"customer.name": "name"},
		},
	})
	require.Equal(t, http.StatusOK, code)

	// And configuring it is what turns it on, for the built-in connector exactly as for
	// any other.
	assert.True(t, getState(t, server, attio.Name).Activated)
}

// The registered schema pins the Attio URL: a settings write naming any other host is
// refused before it is stored, so the connector can never be pointed at an address an
// organization chose, an internal one included.
func TestTheRegisteredSchemaRefusesAnAttioURLThatIsNotAttios(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	server := newServer(t, &stubEntitlements{entitled: true})

	code := status(t, server, http.MethodPut, "/api/connectors/"+attio.Name+"/settings", map[string]any{
		"settings": map[string]any{
			"attioApiKey":   "secret",
			"attioApiUrl":   "http://169.254.169.254/latest/meta-data",
			"syncPolicy":    "create-and-bind",
			"fieldsMapping": map[string]any{},
		},
	})
	require.Equal(t, http.StatusBadRequest, code)

	// Nothing was stored, so nothing was switched on either.
	assert.False(t, getState(t, server, attio.Name).Activated)
}

// --- helpers -----------------------------------------------------------------

type connectorRow struct {
	version         string
	settingsSchema  string
	entitlementSlug *string
}

func readConnectorRow(t *testing.T, name string) connectorRow {
	t.Helper()

	var row connectorRow
	err := testDb.DbPool.QueryRow(t.Context(),
		`SELECT version, settings_schema::text, entitlement_slug FROM connector WHERE name = $1`,
		name).Scan(&row.version, &row.settingsSchema, &row.entitlementSlug)
	require.NoError(t, err, "connector %s was not registered at startup", name)

	return row
}

func countConnectorRows(t *testing.T, name string) int {
	t.Helper()

	var count int
	require.NoError(t, testDb.DbPool.QueryRow(t.Context(),
		`SELECT count(*) FROM connector WHERE name = $1`, name).Scan(&count))

	return count
}

func mustJSON(t *testing.T, value any) string {
	t.Helper()

	raw, err := json.Marshal(value)
	require.NoError(t, err)

	return string(raw)
}
