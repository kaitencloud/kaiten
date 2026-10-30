package instances_test

import (
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestInstanceLicenseTermsPreserveOffsetInstants(t *testing.T) {
	for _, hours := range []int{9, -7} {
		zone := time.FixedZone("request-offset", hours*60*60)
		t.Run(fmt.Sprintf("UTC%+d", hours), func(t *testing.T) {
			t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
			customer, license := newCustomer(t), newLicense(t)
			now := time.Now().UTC().Truncate(time.Millisecond)
			start, end := now.Add(-time.Hour), now.Add(time.Hour)
			payload := newInstancePayload(customer.ID, license.ID)
			payload.StartLicenseDate = start.In(zone)
			payload.EndLicenseDate = end.In(zone)
			created := sendInstanceRequest[schema.Instance](t, http.MethodPost, "/api/instances", payload, fiber.StatusCreated)
			require.Equal(t, start, created.StartLicenseDate, "POST must preserve the instant, not the request's wall-clock hour")
			require.Equal(t, end, created.EndLicenseDate)

			start, end = start.Add(-time.Hour), end.Add(time.Hour)
			payload = updatePayloadFrom(&created)
			payload.StartLicenseDate = start.In(zone)
			payload.EndLicenseDate = end.In(zone)
			req := commonfixture.NewJSONRequest(t, http.MethodPut, "/api/instances/"+created.Slug, payload)
			resp, err := testServer.App.Test(req, fiber.TestConfig{})
			require.NoError(t, err)
			defer commonfixture.MustCloseBody(t, resp.Body)
			require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
			stored := storedInstance(t, created.Slug)
			require.Equal(t, start, stored.StartLicenseDate, "PUT must preserve the instant, not the request's wall-clock hour")
			require.Equal(t, end, stored.EndLicenseDate)
			validation := sendInstanceRequest[schema.LicenseValidation](t, http.MethodGet,
				"/api/instances/"+created.Slug+"/license-validation", nil, fiber.StatusOK)
			require.True(t, validation.Valid)
			require.Equal(t, schema.LicenseTermActive, validation.Status)
		})
	}
}
