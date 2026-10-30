package instances_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestInstanceLicenseValidation(t *testing.T) {
	for _, tc := range []struct {
		name, status string
		start, end   time.Duration
	}{
		{"active", "ACTIVE", -time.Hour, time.Hour},
		{"not started", "NOT_STARTED", time.Hour, 2 * time.Hour},
		{"expired", "EXPIRED", -2 * time.Hour, -time.Hour},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
			instance := newInstances(t, 1)[0]
			now := time.Now().UTC()
			_, err := testServer.Dependencies.DB.Exec(t.Context(),
				`UPDATE instance SET start_license_date=$1, end_license_date=$2 WHERE id=$3`,
				now.Add(tc.start), now.Add(tc.end), instance.ID)
			require.NoError(t, err)
			result := sendInstanceRequest[schema.LicenseValidation](t, http.MethodGet,
				"/api/instances/"+instance.Slug+"/license-validation", nil, fiber.StatusOK)
			require.Equal(t, schema.LicenseTermStatus(tc.status), result.Status)
			require.Equal(t, tc.status == "ACTIVE", result.Valid)
			require.Equal(t, instance.LicenseID, result.LicenseID)
			require.Equal(t, instance.LicenseSlug, result.LicenseSlug)
			require.Equal(t, instance.Slug, result.InstanceSlug)
			require.WithinDuration(t, time.Now().UTC(), result.EvaluatedAt, time.Second)
			require.Equal(t, time.UTC, result.EvaluatedAt.Location())
		})
	}
	for _, state := range []string{"DRAFT", "ARCHIVED"} {
		t.Run("assigned "+state+" stays valid", func(t *testing.T) {
			t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
			instance := newInstances(t, 1)[0]
			// Establish an active UTC term away from the clock boundary;
			// catalog state, not start timing, is what this case tests.
			now := time.Now().UTC()
			_, err := testServer.Dependencies.DB.Exec(t.Context(),
				`UPDATE instance SET start_license_date=$1, end_license_date=$2 WHERE id=$3`,
				now.Add(-time.Hour), now.Add(time.Hour), instance.ID)
			require.NoError(t, err)
			setLicenseLifecycleState(t, instance.LicenseID, state)
			result := sendInstanceRequest[schema.LicenseValidation](t, http.MethodGet,
				"/api/instances/"+instance.Slug+"/license-validation", nil, fiber.StatusOK)
			require.True(t, result.Valid)
			require.Equal(t, schema.LicenseTermActive, result.Status)
		})
	}
	t.Run("missing and foreign instance return same denial", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newInstances(t, 1)[0]
		neighbour := newNeighbourOrganization(t)
		otherServer := tests.NewTestServer(testDb, tests.TestServerOptions{OrganizationID: &neighbour})
		t.Cleanup(func() { require.NoError(t, otherServer.Close()) })
		for _, slug := range []string{instance.Slug, "missing-prod"} {
			req := commonfixture.NewJSONRequest(t, http.MethodGet, "/api/instances/"+slug+"/license-validation", nil)
			resp, err := otherServer.App.Test(req, fiber.TestConfig{})
			require.NoError(t, err)
			defer commonfixture.MustCloseBody(t, resp.Body)
			problem := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, resp, fiber.StatusNotFound)
			require.Equal(t, "GetLicenseValidation.NotFound", problem.Code)
		}
	})
	t.Run("insufficient scope is forbidden", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		restricted := tests.NewTestServer(testDb, tests.TestServerOptions{Scopes: []string{"read:feature_flags"}})
		t.Cleanup(func() { require.NoError(t, restricted.Close()) })
		req := commonfixture.NewJSONRequest(t, http.MethodGet, "/api/instances/missing-prod/license-validation", nil)
		resp, err := restricted.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusForbidden, resp.StatusCode)
	})
	t.Run("no credential is unauthorized", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		authenticated := tests.NewTestServer(testDb, tests.TestServerOptions{UseJWTAuth: true})
		t.Cleanup(func() { require.NoError(t, authenticated.Close()) })
		req := commonfixture.NewJSONRequest(t, http.MethodGet, "/api/instances/missing-prod/license-validation", nil)
		resp, err := authenticated.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusUnauthorized, resp.StatusCode)
	})
}
