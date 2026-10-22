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

func TestHumanAuthorizationHTTP(t *testing.T) {
	database, err := tests.NewTestDatabase()
	require.NoError(t, err)
	t.Cleanup(database.TearDown)
	server := tests.NewTestServer(database, tests.TestServerOptions{UseJWTAuth: true})
	t.Cleanup(func() { require.NoError(t, server.Close()) })
	org := "rbac-org-" + uuid.NewString()
	sign := func(subject string) string {
		token, err := jwt.NewWithClaims(jwt.SigningMethodNone, jwt.MapClaims{"sub": subject, "kaiten_external_org_id": org, "email": subject + "@example.com", "scopes": []any{"write:*", 123}, "roles": []string{"administrator"}, "permissions": []string{"write:*"}}).SignedString(jwt.UnsafeAllowNoneSignatureType)
		require.NoError(t, err)
		return token
	}
	request := func(token, method, path string, body any, status int) []byte {
		if assignment, ok := body.(schema.UserAuthorization); ok {
			if assignment.Roles == nil {
				assignment.Roles = []string{}
			}
			if assignment.Permissions == nil {
				assignment.Permissions = []string{}
			}
			body = assignment
		}
		data, err := json.Marshal(body)
		require.NoError(t, err)
		req := httptest.NewRequest(method, "/api"+path, bytes.NewReader(data))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		resp, err := server.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer resp.Body.Close()
		var result bytes.Buffer
		_, err = result.ReadFrom(resp.Body)
		require.NoError(t, err)
		require.Equal(t, status, resp.StatusCode, result.String())
		return result.Bytes()
	}
	adminSubject := "first-" + uuid.NewString()
	admin := sign(adminSubject)
	request(admin, "GET", "/me", nil, 200)
	memberSubject := "later-" + uuid.NewString()
	member := sign(memberSubject)
	id := externalid.DeriveUserID(memberSubject).String()
	raw := request(member, "GET", "/me", nil, 200)
	var me schema.Me
	require.NoError(t, json.Unmarshal(raw, &me))
	require.Empty(t, me.User.Authorization.Roles)
	request(member, "GET", "/users", nil, 403)
	request(member, "GET", "/components", nil, 403)
	request(member, "POST", "/graphql", map[string]string{"query": "query { customers { items { id } } }"}, 403)
	request(member, "PUT", "/users/"+id+"/authorization", schema.UserAuthorization{Enabled: true, Roles: []string{schema.RoleAdministrator}}, 403)
	request(admin, "PUT", "/users/"+id+"/authorization", schema.UserAuthorization{Enabled: true, Roles: []string{schema.RoleViewer}}, 200)
	request(member, "GET", "/components", nil, 200)
	request(member, "POST", "/graphql", map[string]string{"query": "query { customers { items { id } } }"}, 200)
	request(member, "GET", "/users", nil, 403)
	request(admin, "GET", "/users?limit=1", nil, 200)
	request(admin, "GET", "/users/"+id, nil, 200)
	request(admin, "PUT", "/users/"+id, schema.Profile{Name: "Managed", Email: "managed-http@example.com"}, 204)
	request(admin, "PUT", "/users/"+id+"/authorization", schema.UserAuthorization{Enabled: true, Permissions: []string{"write:users"}}, 200)
	request(member, "PUT", "/users/"+id+"/authorization", schema.UserAuthorization{Enabled: true, Roles: []string{schema.RoleAdministrator}}, 403)
	request(admin, "PUT", "/users/"+id+"/authorization", schema.UserAuthorization{Enabled: true, Permissions: []string{"invalid"}}, 400)
	request(admin, "PUT", "/users/"+id+"/authorization", schema.UserAuthorization{Enabled: false}, 200)
	request(member, "GET", "/me", nil, 403)
	request(admin, "PUT", "/users/"+id+"/authorization", schema.UserAuthorization{Enabled: true}, 200)
	request(member, "GET", "/me", nil, 200)
	request(member, "GET", "/components", nil, 403)
	role := schema.CreateRole{Slug: "custom", RoleDefinition: schema.RoleDefinition{Name: "Custom", Description: "Console-managed", Permissions: []string{"write:components", "write:users"}}}
	request(admin, "POST", "/roles", role, 201)
	raw = request(admin, "GET", "/roles", nil, 200)
	var roles []schema.Role
	require.NoError(t, json.Unmarshal(raw, &roles))
	require.Len(t, roles, 4)
	raw = request(member, "GET", "/me", nil, 200)
	require.NoError(t, json.Unmarshal(raw, &me))
	require.Len(t, me.AvailableRoles, 4)
	request(admin, "PUT", "/users/"+id+"/authorization", schema.UserAuthorization{Enabled: true, Roles: []string{"custom"}}, 200)
	request(member, "GET", "/components", nil, 200)
	request(member, "POST", "/roles", role, 403)
	request(member, "GET", "/roles", nil, 403)
	request(admin, "DELETE", "/roles/custom", nil, 409)
	request(admin, "PUT", "/roles/custom", schema.RoleDefinition{Name: "No grants", Permissions: []string{}}, 200)
	request(member, "GET", "/components", nil, 403)
	request(admin, "PUT", "/users/"+id+"/authorization", schema.UserAuthorization{Enabled: true, Roles: []string{"missing"}}, 400)
	request(admin, "PUT", "/roles/administrator", role.RoleDefinition, 409)
	request(admin, "DELETE", "/roles/administrator", nil, 409)
	request(admin, "PATCH", "/users/"+id+"/enabled", map[string]bool{"enabled": false}, 200)
	request(member, "GET", "/me", nil, 403)
	request(admin, "PATCH", "/users/"+id+"/enabled", map[string]bool{"enabled": true}, 200)
	raw = request(member, "GET", "/me", nil, 200)
	require.NoError(t, json.Unmarshal(raw, &me))
	require.Equal(t, []string{"custom"}, me.User.Authorization.Roles)
	request(admin, "PUT", "/users/"+id+"/authorization", schema.UserAuthorization{Enabled: true}, 200)
	request(admin, "DELETE", "/roles/custom", nil, 204)
	request(admin, "DELETE", "/roles/custom", nil, 404)
	adminID := externalid.DeriveUserID(adminSubject).String()
	request(admin, "PUT", "/users/"+adminID+"/authorization", schema.UserAuthorization{Enabled: false}, 409)
	request(admin, "GET", "/users/"+uuid.NewString(), nil, 404)
	// Warm JIT cache cannot keep a removed membership authorized.
	_, err = database.DbPool.Exec(t.Context(), `UPDATE user_on_organization SET deleted_at=now() WHERE user_id=$1 AND organization_id=$2`, externalid.DeriveUserID(memberSubject), externalid.DeriveOrganizationID(org))
	require.NoError(t, err)
	request(member, "GET", "/me", nil, 403)
}
