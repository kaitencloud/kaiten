package huma

import (
	"context"
	"net/http"
	"testing"

	humalib "github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humafiber"
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// What is left here is what the {orgId} registrar still decides: the document it
// publishes, and the refusal of a path that does not match the registrar used.
// Resolving the target -- parsing it, checking the organization exists, putting it
// in targetorg's slot -- is the application's, and its tests moved with it to
// internal/kaiten.

// The 404 that naming a non-existent organization produces is part of the
// operation's contract, so it has to appear in the document rather than being an
// answer only the source reveals. It is declared here even though it is now raised
// a layer down, because the contract belongs to the transport either way.
func TestRegisterPlatformForOrganization_DeclaresTheNotFound(t *testing.T) {
	SetErrorHandler()

	api := humafiber.New(fiber.New(),
		ConfigurePlatformSecurity(humalib.DefaultConfig("test", "1.0.0")))
	registerTargetProbe(api)

	pathItem, ok := api.OpenAPI().Paths["/platform/organizations/{orgId}/probe"]
	require.True(t, ok)
	require.NotNil(t, pathItem.Get)
	assert.Contains(t, pathItem.Get.Responses, "404")
	require.Len(t, pathItem.Get.Security, 1)
	assert.Equal(t, []string{testRequiredScope}, pathItem.Get.Security[0][PlatformAuth])
}

// The registrars refuse a path/registrar mismatch in both directions, at
// registration time. A panic here means the server cannot start, so every test
// that builds one is the check -- which is why this cannot be forgotten on a new
// route the way an architecture test's enumeration can be.
func TestRegistrarsRefuseAPathMismatch(t *testing.T) {
	SetErrorHandler()

	newAPI := func() humalib.API {
		return humafiber.New(fiber.New(),
			ConfigurePlatformSecurity(humalib.DefaultConfig("test", "1.0.0")))
	}

	t.Run("a target registrar on a path without the parameter", func(t *testing.T) {
		assert.PanicsWithValue(t,
			"kaitenhuma: operation probe is registered for a target organization "+
				"but its path /platform/probe declares no {orgId}",
			func() {
				RegisterPlatformForOrganization(newAPI(),
					humalib.Operation{
						OperationID: "probe",
						Method:      http.MethodGet,
						Path:        "/platform/probe",
					}, testRequiredScope, probeHandler)
			})
	})

	t.Run("the plain registrar on a path with the parameter", func(t *testing.T) {
		assert.PanicsWithValue(t,
			"kaitenhuma: operation probe declares {orgId} in its path "+
				"/platform/organizations/{orgId} and must be registered with "+
				"RegisterPlatformForOrganization",
			func() {
				RegisterPlatform(newAPI(), humalib.Operation{
					OperationID: "probe",
					Method:      http.MethodGet,
					Path:        "/platform/organizations/{orgId}",
				}, testRequiredScope, probeHandler)
			})
	})
}

// targetProbeInput is shaped like a real {orgId} operation's Request: huma refuses
// to register an operation whose path declares a parameter the input does not, and
// the type is uuid.UUID because huma's own parsing is now what rejects a malformed
// one.
type targetProbeInput struct {
	OrgID uuid.UUID `path:"orgId" format:"uuid"`
}

// registerTargetProbe registers through the production registrar, so what the
// document says is what the registrar put there rather than what a hand-assembled
// operation would have.
func registerTargetProbe(api humalib.API) {
	RegisterPlatformForOrganization(api, humalib.Operation{
		OperationID: "target-probe",
		Method:      http.MethodGet,
		Path:        "/platform/organizations/{orgId}/probe",
		Errors:      []int{http.StatusUnauthorized, http.StatusForbidden},
	}, testRequiredScope, func(context.Context, *targetProbeInput) (*probeOutput, error) {
		out := &probeOutput{}
		out.Body.OK = true

		return out, nil
	})
}
