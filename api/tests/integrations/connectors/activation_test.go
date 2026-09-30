package connectors_test

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// connectorName is deliberately NOT a connector this binary ships.
//
// The properties in this file are about the organization-level half -- a row in
// organization_connector, the licence gate over it, and the state the console reads --
// and every one of them starts from "this connector is not registered yet". A built-in
// name would already be registered by the time the server answers, because that is what
// builtinconnectors does at startup, so the suite would be testing Attio's manifest
// instead of activation. Attio's own registration is asserted in builtin_test.go.
const connectorName = "kaiten.integration.crm.example"

// Availability, entitlement and activation used to be one 404 on the settings
// endpoint. These four states are what replaced it, and the point of asserting all of
// them here is that the transitions between them are independent: entitlement can flip
// without touching activation, and activation without touching entitlement.
func TestConnectorStateDistinguishesAvailabilityEntitlementAndActivation(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	entitlements := &stubEntitlements{entitled: true}
	server := newServer(t, entitlements)

	t.Run("a connector this deployment does not have is available:false, not 404", func(t *testing.T) {
		state := getState(t, server, connectorName)

		assert.False(t, state.Available)
		assert.False(t, state.Entitled, "nothing can be licensed that is not here")
		assert.False(t, state.Activated)
		assert.Nil(t, state.Version)
	})

	registerConnector(t, connectorName, entitlementSlug)

	t.Run("registered but not activated", func(t *testing.T) {
		state := getState(t, server, connectorName)

		assert.True(t, state.Available)
		assert.True(t, state.Entitled)
		assert.False(t, state.Activated)
		require.NotNil(t, state.Version)
		assert.Equal(t, "1.0.0", *state.Version)
	})

	t.Run("available but not entitled", func(t *testing.T) {
		entitlements.entitled = false
		t.Cleanup(func() { entitlements.entitled = true })

		state := getState(t, server, connectorName)

		assert.True(t, state.Available, "the licence says nothing about whether the connector exists")
		assert.False(t, state.Entitled)
		assert.False(t, state.Activated)
	})

	t.Run("activated", func(t *testing.T) {
		require.Equal(t, http.StatusOK, activate(t, server, connectorName))

		state := getState(t, server, connectorName)

		assert.True(t, state.Available)
		assert.True(t, state.Entitled)
		assert.True(t, state.Activated)
		require.NotNil(t, state.ActivatedAt)
	})

	// The two axes are independent in both directions: a licence that lapses does not
	// silently deactivate, and the state still reports the activation truthfully so a
	// console can say "you have this on but it is no longer in your plan".
	t.Run("losing entitlement leaves the activation visible", func(t *testing.T) {
		entitlements.entitled = false
		t.Cleanup(func() { entitlements.entitled = true })

		state := getState(t, server, connectorName)

		assert.False(t, state.Entitled)
		assert.True(t, state.Activated)
	})
}

func TestActivationRefusesWhatItShould(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	entitlements := &stubEntitlements{entitled: true}
	server := newServer(t, entitlements)

	t.Run("an unregistered connector is 404", func(t *testing.T) {
		assert.Equal(t, http.StatusNotFound, activate(t, server, "kaiten.integration.crm.nothere"))
	})

	registerConnector(t, connectorName, entitlementSlug)

	t.Run("an unlicensed organization is 403", func(t *testing.T) {
		entitlements.entitled = false
		t.Cleanup(func() { entitlements.entitled = true })

		assert.Equal(t, http.StatusForbidden, activate(t, server, connectorName))
		assert.False(t, getState(t, server, connectorName).Activated)
	})

	// Fail closed, not open. This deployment is not the authority on what was sold,
	// so an answer it could not get is not an answer it may invent -- letting the
	// activation through would enable a paid feature nobody bought, with no usage
	// record for anything to notice later.
	t.Run("an unverifiable licence is 503, not an activation", func(t *testing.T) {
		entitlements.err = errors.New("the licensing deployment is unreachable")

		assert.Equal(t, http.StatusServiceUnavailable, activate(t, server, connectorName))

		// Cleared before reading the state back, because the state endpoint fails
		// closed on the same unverifiable answer -- so asking it while the licensing
		// deployment is still "down" would tell us about that, not about whether the
		// refused activation left a row behind.
		entitlements.err = nil
		assert.False(t, getState(t, server, connectorName).Activated)
	})

	t.Run("an ungated connector needs no licence at all", func(t *testing.T) {
		entitlements.err = errors.New("nobody should be asking")
		t.Cleanup(func() { entitlements.err = nil })

		registerConnector(t, "kaiten.integration.crm.ungated", nil)

		assert.Equal(t, http.StatusOK, activate(t, server, "kaiten.integration.crm.ungated"))
		assert.True(t, getState(t, server, "kaiten.integration.crm.ungated").Entitled)
	})
}

// Activation is idempotent, and deliberately does not move activatedAt: "when did
// this organization first turn this connector on" is a fact worth not overwriting every
// time the settings form is saved.
func TestActivationIsIdempotentAndKeepsTheOriginalTimestamp(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	server := newServer(t, &stubEntitlements{entitled: true})
	registerConnector(t, connectorName, entitlementSlug)

	require.Equal(t, http.StatusOK, activate(t, server, connectorName))
	first := getState(t, server, connectorName).ActivatedAt
	require.NotNil(t, first)

	time.Sleep(10 * time.Millisecond)
	require.Equal(t, http.StatusOK, activate(t, server, connectorName))

	second := getState(t, server, connectorName).ActivatedAt
	require.NotNil(t, second)
	assert.True(t, first.Equal(*second), "re-activating must not reset when the connector was first activated")
}

// Deactivation is never refused on entitlement grounds, and is idempotent: an
// organization must always be able to stop using something, including something it is
// no longer licensed for.
func TestDeactivationAlwaysSucceeds(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	entitlements := &stubEntitlements{entitled: true}
	server := newServer(t, entitlements)
	registerConnector(t, connectorName, entitlementSlug)

	t.Run("deactivating something that was never on is a no-op", func(t *testing.T) {
		assert.Equal(t, http.StatusNoContent, deactivate(t, server, connectorName))
	})

	require.Equal(t, http.StatusOK, activate(t, server, connectorName))
	entitlements.entitled = false

	t.Run("an unlicensed organization can still turn it off", func(t *testing.T) {
		assert.Equal(t, http.StatusNoContent, deactivate(t, server, connectorName))
		assert.False(t, getState(t, server, connectorName).Activated)
	})
}

// The whole point of an organization-level table. This is asserted by
// snapshotting the neighbour rather than only checking the actor: a WHERE
// clause that matched both tenants would still make the acting organization's
// assertion pass.
func TestActivationIsScopedToOneOrganization(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	other := createOrganization(t, "other-tenant")

	entitlements := &stubEntitlements{entitled: true}
	actor := newServer(t, entitlements)
	neighbour := newServerForOrganization(t, entitlements, other)

	registerConnector(t, connectorName, entitlementSlug)

	require.Equal(t, http.StatusOK, activate(t, actor, connectorName))

	assert.True(t, getState(t, actor, connectorName).Activated)
	assert.False(t, getState(t, neighbour, connectorName).Activated,
		"one organization activating a connector must not activate it for another")

	// The registry is deployment-wide, so the neighbour sees the connector exists --
	// which is the distinction the two tables draw.
	assert.True(t, getState(t, neighbour, connectorName).Available)

	require.Equal(t, http.StatusOK, activate(t, neighbour, connectorName))
	require.Equal(t, http.StatusNoContent, deactivate(t, actor, connectorName))

	assert.False(t, getState(t, actor, connectorName).Activated)
	assert.True(t, getState(t, neighbour, connectorName).Activated,
		"one organization deactivating must not deactivate another")
}

// Saving settings is how the console turns a connector on, so it must leave the
// activation row exactly where the explicit endpoint would -- and clearing them must
// leave it where DELETE would.
func TestSettingsWritesCarryTheActivationWithThem(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	entitlements := &stubEntitlements{entitled: true}
	server := newServer(t, entitlements)
	registerConnector(t, connectorName, entitlementSlug)

	require.Equal(t, http.StatusOK, putSettings(t, server, connectorName))
	assert.True(t, getState(t, server, connectorName).Activated,
		"configuring a connector is how an organization activates it")

	require.Equal(t, http.StatusNoContent, deleteSettings(t, server, connectorName))
	assert.False(t, getState(t, server, connectorName).Activated,
		"clearing a connector's settings turns it off")
}

// The licence gate applies to both doors onto activation. A settings write that
// skipped it would be the way around the explicit endpoint's 403 -- and would store
// the organization's API key on the way past.
func TestSettingsWriteIsRefusedForAnUnlicensedOrganization(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	entitlements := &stubEntitlements{entitled: false}
	server := newServer(t, entitlements)
	registerConnector(t, connectorName, entitlementSlug)

	assert.Equal(t, http.StatusForbidden, putSettings(t, server, connectorName))
	assert.Equal(t, http.StatusNotFound, getSettingsStatus(t, server, connectorName),
		"the refusal must happen before the secret is stored")
}

// --- helpers -----------------------------------------------------------------

var entitlementSlug = ptr("connector-example")

// stubEntitlements stands in for the licensing deployment.
type stubEntitlements struct {
	entitled bool
	err      error
}

func (s *stubEntitlements) Entitled(context.Context, uuid.UUID, string) (bool, error) {
	if s.err != nil {
		return false, s.err
	}
	return s.entitled, nil
}

func newServer(t *testing.T, entitlements services.ConnectorEntitlements) *tests.TestServer {
	t.Helper()
	return newServerForOrganization(t, entitlements, testDb.DefaultData.OrganizationID)
}

func newServerForOrganization(
	t *testing.T, entitlements services.ConnectorEntitlements, organizationID uuid.UUID,
) *tests.TestServer {
	t.Helper()

	useFakeVault(t)

	return tests.NewTestServer(testDb, tests.TestServerOptions{
		OrganizationID:        &organizationID,
		ConnectorEntitlements: entitlements,
	})
}

// newPlatformServer authenticates as a platform credential on both listeners, which
// is what registration now requires.
//
// A second server rather than a flag on the first, because the two credential classes
// are the point: the same suite has to hold a platform credential to register a
// connector and an organization credential to activate one, and no single credential
// can do both. That is the boundary this change drew.
func newPlatformServer(t *testing.T) *tests.TestServer {
	t.Helper()

	useFakeVault(t)

	return tests.NewTestServer(testDb, tests.TestServerOptions{
		PlatformCredential: true,
		PlatformTokenID:    uuid.New(),
	})
}

// useFakeVault points the connector settings store at a per-test JSON file.
//
// The store's fake-file mode is what the compose stack uses too, so these tests
// exercise the real store rather than a stub of it. Idempotent within a test: every
// server built for one test shares the file, which is what lets a settings write
// through one server be read back through another.
func useFakeVault(t *testing.T) {
	t.Helper()

	if os.Getenv("VAULT_FAKE_FILE_PATH") != "" {
		return
	}

	t.Setenv("VAULT_ADDR", "")
	t.Setenv("VAULT_TOKEN", "")
	t.Setenv("VAULT_FAKE_FILE_PATH", filepath.Join(t.TempDir(), "vault-secrets.json"))
}

func createOrganization(t *testing.T, slug string) uuid.UUID {
	t.Helper()

	var id uuid.UUID
	err := testDb.DbPool.QueryRow(t.Context(),
		`INSERT INTO organization (external_id, name) VALUES ($1, $2) RETURNING id`,
		"ext-"+slug, slug).Scan(&id)
	require.NoError(t, err)

	return id
}

// registerConnector goes through the Platform listener, which is the only place
// registration answers now -- and with a platform credential, which is the only class
// it accepts.
func registerConnector(t *testing.T, name string, slug *string) {
	t.Helper()

	server := newPlatformServer(t)

	body := map[string]any{
		"name":            name,
		"version":         "1.0.0",
		"settings_schema": settingsSchema(),
	}
	if slug != nil {
		body["entitlement_slug"] = *slug
	}

	resp := do(t, server.PlatformApp, http.MethodPost, "/api/platform/connectors", body)
	defer commonfixture.MustCloseBody(t, resp.Body)
	require.Equal(t, http.StatusOK, resp.StatusCode, "register %s: %s", name, readBody(t, resp))
}

type connectorState struct {
	ConnectorName string     `json:"connectorName"`
	Available     bool       `json:"available"`
	Entitled      bool       `json:"entitled"`
	Activated     bool       `json:"activated"`
	Version       *string    `json:"version"`
	ActivatedAt   *time.Time `json:"activatedAt"`
}

func getState(t *testing.T, server *tests.TestServer, name string) connectorState {
	t.Helper()

	resp := do(t, server.App, http.MethodGet, "/api/connectors/"+name+"/state", nil)
	defer commonfixture.MustCloseBody(t, resp.Body)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var state connectorState
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&state))

	return state
}

func activate(t *testing.T, server *tests.TestServer, name string) int {
	t.Helper()
	return status(t, server, http.MethodPut, "/api/connectors/"+name+"/activation", nil)
}

func deactivate(t *testing.T, server *tests.TestServer, name string) int {
	t.Helper()
	return status(t, server, http.MethodDelete, "/api/connectors/"+name+"/activation", nil)
}

func putSettings(t *testing.T, server *tests.TestServer, name string) int {
	t.Helper()

	return status(t, server, http.MethodPut, "/api/connectors/"+name+"/settings", map[string]any{
		"settings": map[string]any{
			"apiKey": "secret",
			"apiUrl": "https://api.example.test",
		},
	})
}

func deleteSettings(t *testing.T, server *tests.TestServer, name string) int {
	t.Helper()
	return status(t, server, http.MethodDelete, "/api/connectors/"+name+"/settings", nil)
}

func getSettingsStatus(t *testing.T, server *tests.TestServer, name string) int {
	t.Helper()
	return status(t, server, http.MethodGet, "/api/connectors/"+name+"/settings", nil)
}

func status(t *testing.T, server *tests.TestServer, method, path string, body map[string]any) int {
	t.Helper()

	resp := do(t, server.App, method, path, body)
	defer commonfixture.MustCloseBody(t, resp.Body)

	return resp.StatusCode
}

func do(t *testing.T, app *fiber.App, method, path string, body map[string]any) *http.Response {
	t.Helper()

	req := commonfixture.NewJSONRequest(t, method, path, body)
	resp, err := app.Test(req, fiber.TestConfig{})
	require.NoError(t, err)

	return resp
}

func readBody(t *testing.T, resp *http.Response) string {
	t.Helper()

	raw, err := io.ReadAll(resp.Body)
	require.NoError(t, err)

	return string(raw)
}

// settingsSchema is the smallest schema with a secret in it, because the one thing
// these tests need from a schema is that a settings write stores something the wire
// then refuses to read back.
func settingsSchema() map[string]any {
	return map[string]any{
		"$schema": "https://json-schema.org/draft/2020-12/schema",
		"type":    "object",
		"properties": map[string]any{
			"apiKey": map[string]any{"type": "string", "writeOnly": true},
			"apiUrl": map[string]any{"type": "string"},
		},
		"required":             []string{"apiKey", "apiUrl"},
		"additionalProperties": false,
	}
}

func ptr[T any](v T) *T { return &v }
