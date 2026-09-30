package huma

import (
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	humalib "github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humafiber"
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/platform/platformidentity"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
)

// The Platform API's three deletions cannot write an audit_trail row -- see
// AuditPlatformAction's doc comment -- so this log record IS the attribution.
// That makes its contents a contract rather than a debugging aid, and these tests
// pin it: which requests produce a record, at which level, and with which fields.

// recordingHandler collects what was logged. slog.SetDefault is process-global,
// so nothing here runs in parallel.
type recordingHandler struct {
	mu      sync.Mutex
	records []slog.Record
}

func (h *recordingHandler) Enabled(context.Context, slog.Level) bool { return true }

func (h *recordingHandler) Handle(_ context.Context, record slog.Record) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.records = append(h.records, record.Clone())
	return nil
}

func (h *recordingHandler) WithAttrs([]slog.Attr) slog.Handler { return h }
func (h *recordingHandler) WithGroup(string) slog.Handler      { return h }

// only returns the single record the request should have produced, failing
// loudly on none and on more than one: an audit line that appears twice is as
// wrong as one that never appears.
func (h *recordingHandler) only(t *testing.T) (slog.Record, map[string]string) {
	t.Helper()

	h.mu.Lock()
	defer h.mu.Unlock()
	require.Len(t, h.records, 1, "expected exactly one audit record")

	attributes := map[string]string{}
	h.records[0].Attrs(func(a slog.Attr) bool {
		attributes[a.Key] = a.Value.String()
		return true
	})
	return h.records[0], attributes
}

func captureLogs(t *testing.T) *recordingHandler {
	t.Helper()

	handler := &recordingHandler{}
	previous := slog.Default()
	slog.SetDefault(slog.New(handler))
	t.Cleanup(func() { slog.SetDefault(previous) })
	return handler
}

func TestAuditPlatformAction_RecordsAMutation(t *testing.T) {
	SetErrorHandler()
	logs := captureLogs(t)

	organizationID := uuid.New()
	actor := platformPrincipal()

	status, _ := callAuditedTargetRoute(t, actor, organizationID.String())
	require.Equal(t, http.StatusNoContent, status)

	record, attributes := logs.only(t)

	assert.Equal(t, slog.LevelInfo, record.Level, "a successful mutation is routine")
	assert.Equal(t, "platform", attributes["credential_kind"])
	assert.Equal(t, platformidentity.ExternalID, attributes["actor"])
	assert.Equal(t, actor.PlatformTokenID.String(), attributes["platform_token_id"],
		"the field an operator acts on: revoking this credential revokes what it minted")
	assert.Equal(t, "audited-target", attributes["operation"])
	assert.Equal(t, http.MethodDelete, attributes["method"])
	assert.Equal(t, "204", attributes["status"])
	assert.Equal(t, organizationID.String(), attributes["target_organization"])
}

// TestAuditPlatformAction_RecordsARefusal is the reason the middleware reads the
// status after the chain returns rather than deciding anything itself. Every refusal
// on this surface is now answered below it -- the wrong credential class by the
// handler's caller.Platform, a missing scope by the facade -- and a mutation refused
// on a publicly reachable privileged surface is the single most interesting thing
// this record can carry. A middleware that inspected the request instead would see
// neither.
func TestAuditPlatformAction_RecordsARefusal(t *testing.T) {
	SetErrorHandler()

	t.Run("wrong credential kind, organization-scoped operation", func(t *testing.T) {
		logs := captureLogs(t)

		status, pastAuthorization := callAuditedTargetRoute(t, organizationPrincipal(), uuid.NewString())
		require.Equal(t, http.StatusForbidden, status)

		record, attributes := logs.only(t)

		assert.Equal(t, slog.LevelWarn, record.Level, "a refused mutation is worth surfacing")
		assert.Equal(t, "organization", attributes["credential_kind"],
			"the observed kind, not the required one: this describes what arrived")
		assert.NotContains(t, attributes, "actor",
			"the platform identity did not act here, so nothing attributes to it")
		assert.NotContains(t, attributes, "platform_token_id")
		assert.Equal(t, "403", attributes["status"])
		assert.False(t, pastAuthorization,
			"the record exists even though authorization stopped the request on its first line")
	})

	t.Run("no identity at all, global operation", func(t *testing.T) {
		logs := captureLogs(t)

		status := callAuditedRoute(t, nil)
		require.Equal(t, http.StatusUnauthorized, status)

		_, attributes := logs.only(t)

		assert.Equal(t, "none", attributes["credential_kind"],
			"empty would read as missing data; KindOrganization's zero value is empty")
		assert.Equal(t, "401", attributes["status"])
		assert.NotContains(t, attributes, "target_organization",
			"a global operation declares no {orgId}, so there is nothing to report")
	})
}

// TestAuditPlatformAction_IsInstalledByBothRegistrars states the property that
// makes this attribution complete: there is no way onto the Platform API that
// skips it, because both registrars install it and every platform operation goes
// through one of them (asserted at source level in tests/architecture).
func TestAuditPlatformAction_IsInstalledByBothRegistrars(t *testing.T) {
	SetErrorHandler()

	t.Run("RegisterPlatform", func(t *testing.T) {
		logs := captureLogs(t)

		require.Equal(t, http.StatusNoContent, callAuditedRoute(t, platformPrincipal()))

		_, attributes := logs.only(t)
		assert.Equal(t, "audited-global", attributes["operation"])
	})

	t.Run("RegisterPlatformForOrganization", func(t *testing.T) {
		logs := captureLogs(t)

		status, _ := callAuditedTargetRoute(t, platformPrincipal(), uuid.NewString())
		require.Equal(t, http.StatusNoContent, status)

		_, attributes := logs.only(t)
		assert.Equal(t, "audited-target", attributes["operation"])
	})
}

// TestAuditPlatformAction_IgnoresReads keeps GET /platform/me out of the record.
// An SDK token source introspects itself on every refresh, and burying the
// operations that changed something under the ones that could not would make the
// attribution useless exactly when it is needed.
func TestAuditPlatformAction_IgnoresReads(t *testing.T) {
	SetErrorHandler()
	logs := captureLogs(t)

	app := newAppWithPrincipal(platformPrincipal())
	api := humafiber.New(app, humalib.DefaultConfig("test", "1.0.0"))
	RegisterPlatform(api, humalib.Operation{
		OperationID: "audited-read",
		Method:      http.MethodGet,
		Path:        "/platform/me",
	}, testRequiredScope, func(context.Context, *struct{}) (*struct{}, error) {
		return &struct{}{}, nil
	})

	resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/platform/me", nil))
	require.NoError(t, err)
	require.NoError(t, resp.Body.Close())
	require.Equal(t, http.StatusNoContent, resp.StatusCode)

	logs.mu.Lock()
	defer logs.mu.Unlock()
	assert.Empty(t, logs.records, "a read has no effect to attribute")
}

// TestIsStateChanging pins the method set directly, since it is what decides
// whether anything is recorded at all.
func TestIsStateChanging(t *testing.T) {
	t.Parallel()

	for method, expected := range map[string]bool{
		http.MethodPost:    true,
		http.MethodPut:     true,
		http.MethodPatch:   true,
		http.MethodDelete:  true,
		http.MethodGet:     false,
		http.MethodHead:    false,
		http.MethodOptions: false,
	} {
		assert.Equal(t, expected, isStateChanging(method), method)
	}
}

// callAuditedRoute drives a global platform operation registered through
// RegisterPlatform.
func callAuditedRoute(t *testing.T, actor *principal.Principal) int {
	t.Helper()

	app := newAppWithPrincipal(actor)
	api := humafiber.New(app, humalib.DefaultConfig("test", "1.0.0"))
	RegisterPlatform(api, humalib.Operation{
		OperationID:   "audited-global",
		Method:        http.MethodDelete,
		Path:          "/platform/users/{id}",
		DefaultStatus: http.StatusNoContent,
		Errors:        []int{http.StatusUnauthorized, http.StatusForbidden},
	}, testRequiredScope, func(ctx context.Context, _ *struct {
		ID uuid.UUID `path:"id" format:"uuid"`
	},
	) (*struct{}, error) {
		if _, err := caller.Platform(ctx); err != nil {
			return nil, err
		}
		return &struct{}{}, nil
	})

	return sendDelete(t, app, "/platform/users/"+uuid.NewString())
}

// callAuditedTargetRoute drives an {orgId} platform operation registered through
// RegisterPlatformForOrganization, reporting the status and whether the request got
// past authorization.
func callAuditedTargetRoute(
	t *testing.T,
	actor *principal.Principal,
	organizationID string,
) (int, bool) {
	t.Helper()

	app := newAppWithPrincipal(actor)
	api := humafiber.New(app, ConfigureErrors(humalib.DefaultConfig("test", "1.0.0")))

	pastAuthorization := false
	RegisterPlatformForOrganization(api, humalib.Operation{
		OperationID:   "audited-target",
		Method:        http.MethodDelete,
		Path:          "/platform/organizations/{orgId}/tokens/{tokenSlug}",
		DefaultStatus: http.StatusNoContent,
		Errors:        []int{http.StatusUnauthorized, http.StatusForbidden},
	}, testRequiredScope, func(ctx context.Context, _ *struct {
		OrganizationID uuid.UUID `path:"orgId" format:"uuid"`
		TokenSlug      string    `path:"tokenSlug"`
	},
	) (*struct{}, error) {
		if _, err := caller.Platform(ctx); err != nil {
			return nil, err
		}
		pastAuthorization = true
		return &struct{}{}, nil
	})

	status := sendDelete(t, app, "/platform/organizations/"+organizationID+"/tokens/some-slug")

	return status, pastAuthorization
}

func sendDelete(t *testing.T, app *fiber.App, path string) int {
	t.Helper()

	resp, err := app.Test(httptest.NewRequest(http.MethodDelete, path, nil))
	require.NoError(t, err)
	require.NoError(t, resp.Body.Close())
	return resp.StatusCode
}
