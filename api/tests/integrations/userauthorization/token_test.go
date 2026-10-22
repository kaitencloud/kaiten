package userauthorization_test

import (
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/tests"
)

func TestMachineAuthorizationIsResolvedFromStorage(t *testing.T) {
	database, err := tests.NewTestDatabase()
	require.NoError(t, err)
	t.Cleanup(database.TearDown)
	server := tests.NewTestServer(database, tests.TestServerOptions{UseJWTAuth: true})
	t.Cleanup(func() { require.NoError(t, server.Close()) })
	orgID := database.DefaultData.OrganizationID
	userID, tokenID := uuid.New(), uuid.New()
	subject := "service-" + uuid.NewString()
	_, err = database.DbPool.Exec(t.Context(), `INSERT INTO "user"(id,external_id,name,slug,type,organization_id) VALUES($1,$2,'Machine',$2,'machine',$3)`, userID, subject, orgID)
	require.NoError(t, err)
	_, err = database.DbPool.Exec(t.Context(), `INSERT INTO user_on_organization(user_id,organization_id) VALUES($1,$2)`, userID, orgID)
	require.NoError(t, err)
	_, err = database.DbPool.Exec(t.Context(), `INSERT INTO token(id,hash,lookup_hash,created_by,service_account_id,organization_id,scopes,name,slug) VALUES($1::uuid,'hash',$1::uuid::text,$2,$3,$4,ARRAY['write:*'],'Token',$1::uuid::text)`, tokenID, database.DefaultData.UserID, userID, orgID)
	require.NoError(t, err)
	var org string
	require.NoError(t, database.DbPool.QueryRow(t.Context(), `SELECT external_id FROM organization WHERE id=$1`, orgID).Scan(&org))
	sign := func(subject, org string, method jwt.SigningMethod) string {
		token, err := jwt.NewWithClaims(method, jwt.MapClaims{"sub": subject, "kaiten_external_org_id": org, "kaiten_token_id": tokenID.String(), "scopes": []string{"write:*"}, "roles": []string{"administrator"}}).SignedString(func() any {
			if method == jwt.SigningMethodNone {
				return jwt.UnsafeAllowNoneSignatureType
			}
			return []byte("provider-secret")
		}())
		require.NoError(t, err)
		return token
	}
	credential := sign(subject, org, jwt.SigningMethodNone)
	request := func(credential, path string, status int) {
		req := httptest.NewRequest("GET", "/api"+path, nil)
		req.Header.Set("Authorization", "Bearer "+credential)
		resp, err := server.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer resp.Body.Close()
		require.Equal(t, status, resp.StatusCode)
	}
	request(credential, "/components", 200)
	request(credential, "/users", 403)
	request(credential, "/roles", 403)
	request(credential, "/users/"+database.DefaultData.UserID.String(), 403)
	request(sign(subject, org, jwt.SigningMethodHS256), "/components", 401)
	request(sign("other-subject", org, jwt.SigningMethodNone), "/components", 401)
	request(sign(subject, "other-org", jwt.SigningMethodNone), "/components", 401)
	require.Zero(t, scalar(t, database, `SELECT count(*) FROM user_administrator_bootstrap`))
	_, err = database.DbPool.Exec(t.Context(), `UPDATE token SET scopes='{}' WHERE id=$1`, tokenID)
	require.NoError(t, err)
	request(credential, "/components", 403)
	_, err = database.DbPool.Exec(t.Context(), `UPDATE token SET scopes=ARRAY['read:components'],expires_at=now()-interval '1 hour' WHERE id=$1`, tokenID)
	require.NoError(t, err)
	request(credential, "/components", 401)
	_, err = database.DbPool.Exec(t.Context(), `UPDATE token SET expires_at=NULL,revoked_date=now() WHERE id=$1`, tokenID)
	require.NoError(t, err)
	request(credential, "/components", 401)
	_, err = database.DbPool.Exec(t.Context(), `UPDATE token SET revoked_date=NULL WHERE id=$1`, tokenID)
	require.NoError(t, err)
	_, err = database.DbPool.Exec(t.Context(), `UPDATE user_on_organization SET deleted_at=now() WHERE user_id=$1`, userID)
	require.NoError(t, err)
	request(credential, "/components", 401)
}
