package userauthorization_test

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/users/schema"
	"github.com/kaitencloud/kaiten/api/pkg/externalid"
	"github.com/kaitencloud/kaiten/api/tests"
)

// The bootstrap administrator is not the only administrator forever. Delegated
// administrators receive the same management capability with their existing JWT.
func TestFirstAdministratorCanDelegateManagement(t *testing.T) {
	database, err := tests.NewTestDatabase()
	require.NoError(t, err)
	t.Cleanup(database.TearDown)
	server := tests.NewTestServer(database, tests.TestServerOptions{UseJWTAuth: true})
	t.Cleanup(func() { require.NoError(t, server.Close()) })
	org := "delegation-" + uuid.NewString()
	subjects := []string{"first-" + uuid.NewString(), "second-" + uuid.NewString(), "third-" + uuid.NewString()}
	credentials := make([]string, len(subjects))
	for i, subject := range subjects {
		credentials[i], err = jwt.NewWithClaims(jwt.SigningMethodNone, jwt.MapClaims{"sub": subject, "kaiten_external_org_id": org}).SignedString(jwt.UnsafeAllowNoneSignatureType)
		require.NoError(t, err)
	}
	request := func(actor int, method, path string, body any, want int) {
		payload, err := json.Marshal(body)
		require.NoError(t, err)
		req := httptest.NewRequest(method, "/api"+path, bytes.NewReader(payload))
		req.Header.Set("Authorization", "Bearer "+credentials[actor])
		req.Header.Set("Content-Type", "application/json")
		response, err := server.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer response.Body.Close()
		require.Equal(t, want, response.StatusCode, method+" "+path)
	}
	for i := range subjects {
		request(i, "GET", "/me", nil, 200)
	}
	request(1, "GET", "/users", nil, 403)
	assignments := schema.UserRoleAssignments{Roles: []string{schema.RoleAdministrator}, Permissions: []string{}}
	request(0, "PATCH", "/users/"+externalid.DeriveUserID(subjects[1]).String()+"/assignments", assignments, 200)
	request(0, "GET", "/users", nil, 200)
	request(1, "GET", "/users", nil, 200)
	request(1, "POST", "/roles", schema.CreateRole{Slug: "delegated-support", RoleDefinition: schema.RoleDefinition{Name: "Support", Description: "Created by delegated administrator", Permissions: []string{"read:customers"}}}, 201)
	// The second administrator can appoint a third and manage the first.
	request(1, "PATCH", "/users/"+externalid.DeriveUserID(subjects[2]).String()+"/assignments", assignments, 200)
	request(2, "GET", "/users", nil, 200)
	request(1, "PATCH", "/users/"+externalid.DeriveUserID(subjects[0]).String()+"/enabled", schema.UserEnablement{Enabled: false}, 200)
	request(0, "GET", "/users", nil, 403)
	request(1, "PATCH", "/users/"+externalid.DeriveUserID(subjects[2]).String()+"/enabled", schema.UserEnablement{Enabled: false}, 200)
	request(1, "PATCH", "/users/"+externalid.DeriveUserID(subjects[1]).String()+"/enabled", schema.UserEnablement{Enabled: false}, 409)
}
