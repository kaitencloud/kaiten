package instances_test

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	instanceEvents "github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestInstanceLicenseTermResource(t *testing.T) {
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
			req := commonfixture.NewJSONRequest(t, http.MethodGet, "/api/instances/"+instance.Slug, nil)
			resp, err := testServer.App.Test(req, fiber.TestConfig{})
			require.NoError(t, err)
			defer commonfixture.MustCloseBody(t, resp.Body)
			require.Equal(t, "no-store", resp.Header.Get("Cache-Control"))
			result := commonfixture.AssertJSONResponse[schema.Instance](t, resp, fiber.StatusOK)
			require.NotNil(t, result.LicenseTerm)
			require.Equal(t, schema.LicenseTermStatus(tc.status), result.LicenseTerm.Status)
			require.Equal(t, instance.LicenseID, result.LicenseID)
			require.Equal(t, instance.LicenseSlug, result.LicenseSlug)
			require.Equal(t, instance.Slug, result.Slug)
			require.WithinDuration(t, time.Now().UTC(), result.LicenseTerm.EvaluatedAt, time.Second)
			require.Equal(t, time.UTC, result.LicenseTerm.EvaluatedAt.Location())
			require.Zero(t, result.LicenseTerm.EvaluatedAt.Nanosecond()%int(time.Millisecond))
		})
	}
	for _, state := range []string{"DRAFT", "ARCHIVED"} {
		t.Run("assigned "+state+" retains active term", func(t *testing.T) {
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
			result := sendInstanceRequest[schema.Instance](t, http.MethodGet,
				"/api/instances/"+instance.Slug, nil, fiber.StatusOK)
			require.NotNil(t, result.LicenseTerm)
			require.Equal(t, schema.LicenseTermActive, result.LicenseTerm.Status)
		})
	}
	t.Run("missing and foreign instance return same denial", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newInstances(t, 1)[0]
		neighbour := newNeighbourOrganization(t)
		otherServer := tests.NewTestServer(testDb, tests.TestServerOptions{OrganizationID: &neighbour})
		t.Cleanup(func() { require.NoError(t, otherServer.Close()) })
		for _, slug := range []string{instance.Slug, "missing-prod"} {
			req := commonfixture.NewJSONRequest(t, http.MethodGet, "/api/instances/"+slug, nil)
			resp, err := otherServer.App.Test(req, fiber.TestConfig{})
			require.NoError(t, err)
			defer commonfixture.MustCloseBody(t, resp.Body)
			problem := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, resp, fiber.StatusNotFound)
			require.Equal(t, "GetInstance.NotFound", problem.Code)
		}
	})
	t.Run("insufficient scope is forbidden", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		restricted := tests.NewTestServer(testDb, tests.TestServerOptions{Scopes: []string{"read:feature_flags"}})
		t.Cleanup(func() { require.NoError(t, restricted.Close()) })
		req := commonfixture.NewJSONRequest(t, http.MethodGet, "/api/instances/missing-prod", nil)
		resp, err := restricted.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusForbidden, resp.StatusCode)
	})
	t.Run("no credential is unauthorized", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		authenticated := tests.NewTestServer(testDb, tests.TestServerOptions{UseJWTAuth: true})
		t.Cleanup(func() { require.NoError(t, authenticated.Close()) })
		req := commonfixture.NewJSONRequest(t, http.MethodGet, "/api/instances/missing-prod", nil)
		resp, err := authenticated.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusUnauthorized, resp.StatusCode)
	})
}

func TestInstanceTermIsDetailOnlyAndNotWritable(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	customer, license := newCustomer(t), newLicense(t)
	now := time.Now().UTC().Truncate(time.Millisecond)
	payload := newInstancePayload(customer.ID, license.ID)
	payload.StartLicenseDate, payload.EndLicenseDate = now.Add(-time.Hour), now.Add(time.Hour)
	payload.LicenseTerm = &schema.LicenseTerm{Status: schema.LicenseTermExpired, EvaluatedAt: now.AddDate(10, 0, 0)}
	createdJSON := sendInstanceRequest[map[string]any](t, http.MethodPost, "/api/instances", payload, fiber.StatusCreated)
	require.NotContains(t, createdJSON, "licenseTerm")
	require.NotContains(t, createdJSON, "valid")
	raw, err := json.Marshal(createdJSON)
	require.NoError(t, err)
	var created schema.Instance
	require.NoError(t, json.Unmarshal(raw, &created))
	list := sendInstanceRequest[map[string]any](t, http.MethodGet, "/api/instances", nil, fiber.StatusOK)
	items := list["items"].([]any)
	require.Len(t, items, 1)
	require.NotContains(t, items[0], "licenseTerm")
	path := "/api/instances/" + created.Slug
	detail := sendInstanceRequest[schema.Instance](t, http.MethodGet, path, nil, fiber.StatusOK)
	require.NotNil(t, detail.LicenseTerm)
	require.Equal(t, schema.LicenseTermActive, detail.LicenseTerm.Status)
	// A GET representation can be echoed into PUT. The read-only projection
	// must neither be written nor turn this into a new rejection policy.
	detail.Name = "Renamed from echoed resource"
	detail.LicenseTerm = payload.LicenseTerm
	resp, err := testServer.App.Test(commonfixture.NewJSONRequest(t, http.MethodPut, path, detail), fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)
	require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
	updated := sendInstanceRequest[schema.Instance](t, http.MethodGet, path, nil, fiber.StatusOK)
	require.Equal(t, detail.Name, updated.Name)
	require.Equal(t, created.LicenseID, updated.LicenseID)
	require.Equal(t, created.StartLicenseDate, updated.StartLicenseDate)
	require.Equal(t, created.EndLicenseDate, updated.EndLicenseDate)
	require.Equal(t, schema.LicenseTermActive, updated.LicenseTerm.Status)
	require.WithinDuration(t, time.Now().UTC(), updated.LicenseTerm.EvaluatedAt, time.Second)
	foundEvents := map[string]bool{}
	for _, event := range commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID) {
		if event.EventName != instanceEvents.InstanceCreated.Name && event.EventName != instanceEvents.InstanceUpdated.Name {
			continue
		}
		var data map[string]any
		require.NoError(t, json.Unmarshal(event.Data, &data))
		require.NotContains(t, data, "licenseTerm", "events retain their persisted representation")
		foundEvents[event.EventName] = true
	}
	require.Contains(t, foundEvents, instanceEvents.InstanceCreated.Name)
	require.Contains(t, foundEvents, instanceEvents.InstanceUpdated.Name)
	removed, err := testServer.App.Test(commonfixture.NewJSONRequest(t, http.MethodGet, path+"/license-validation", nil), fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, removed.Body)
	require.Equal(t, fiber.StatusNotFound, removed.StatusCode)
}
