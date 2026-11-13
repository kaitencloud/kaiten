package instances_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	customerschema "github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	integrationschema "github.com/kaitencloud/kaiten/api/internal/modules/integrations/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/integrations/upsertintegration"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestIntegrationInstanceAIAdmissionUsesPlatformFlag(t *testing.T) {
	useAIForThisTest(t)
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	aiInstance, _ := newAIUsagePair(t, 100)
	ordinaryLicense := newLicense(t)
	customer := newCustomer(t)
	const adapter = "kaiten.integration.crm.attio"
	const customerExternalID = "ai_gate_customer"
	const instanceExternalID = "ai_gate_instance"
	response, err := testServer.App.Test(commonfixture.NewJSONRequest(t, http.MethodPost, "/api/customers/"+customer.Slug+"/integrations/"+adapter, customerschema.CustomerIntegration{ExternalID: customerExternalID}), fiber.TestConfig{})
	require.NoError(t, err)
	require.Equal(t, http.StatusCreated, response.StatusCode)
	commonfixture.MustCloseBody(t, response.Body)

	createBody := upsertintegration.InstanceBody{
		Name: ptr.To("AI integration"), Description: ptr.To("Synthetic AI admission fixture"),
		CustomerExternalID: ptr.To(customerExternalID), LicenseID: &aiInstance.LicenseID,
		StartLicenseDate: timePointer(time.Now().UTC()), EndLicenseDate: timePointer(time.Now().AddDate(1, 0, 0).UTC()),
	}
	request := func(externalID string, body upsertintegration.InstanceBody) *http.Request {
		return commonfixture.NewJSONRequest(t, http.MethodPatch, "/api/integration/crm.attio/instance/"+externalID, body)
	}
	response, err = testServer.App.Test(request(instanceExternalID, createBody), fiber.TestConfig{})
	require.NoError(t, err)
	created := commonfixture.AssertJSONResponse[integrationschema.InstanceIntegrationResource](t, response, http.StatusOK)
	commonfixture.MustCloseBody(t, response.Body)
	require.Equal(t, aiInstance.LicenseID, created.LicenseID)

	off := tests.NewTestServer(testDb)
	t.Cleanup(func() { require.NoError(t, off.Close()) })
	events := recordedEvents(t)
	response, err = off.App.Test(request("disabled_ai_create", createBody), fiber.TestConfig{})
	require.NoError(t, err)
	problem := commonfixture.AssertJSONResponse[apierrors.Problem](t, response, http.StatusForbidden)
	commonfixture.MustCloseBody(t, response.Body)
	require.Equal(t, "AIUsage.Disabled", problem.Code)
	require.Equal(t, events, recordedEvents(t), "denied create must not emit instance or accounting events")

	// A retained AI licence does not turn ordinary metadata updates into AI operations.
	response, err = off.App.Test(request(instanceExternalID, upsertintegration.InstanceBody{Metadata: map[string]any{"owner": "ordinary-edit"}}), fiber.TestConfig{})
	require.NoError(t, err)
	updated := commonfixture.AssertJSONResponse[integrationschema.InstanceIntegrationResource](t, response, http.StatusOK)
	commonfixture.MustCloseBody(t, response.Body)
	require.Equal(t, aiInstance.LicenseID, updated.LicenseID)
	require.Equal(t, map[string]any{"owner": "ordinary-edit"}, updated.Metadata)

	for _, licenseID := range []struct {
		name string
		body upsertintegration.InstanceBody
	}{
		{"move from AI", upsertintegration.InstanceBody{LicenseID: &ordinaryLicense.ID}},
		{"move into AI", upsertintegration.InstanceBody{LicenseID: &aiInstance.LicenseID}},
	} {
		t.Run(licenseID.name, func(t *testing.T) {
			events := recordedEvents(t)
			response, err := off.App.Test(request(instanceExternalID, licenseID.body), fiber.TestConfig{})
			require.NoError(t, err)
			problem := commonfixture.AssertJSONResponse[apierrors.Problem](t, response, http.StatusForbidden)
			commonfixture.MustCloseBody(t, response.Body)
			require.Equal(t, "AIUsage.Disabled", problem.Code)
			require.Equal(t, events, recordedEvents(t), "denied licence moves must not write accounting events")
			response, err = testServer.App.Test(request(instanceExternalID, licenseID.body), fiber.TestConfig{})
			require.NoError(t, err)
			moved := commonfixture.AssertJSONResponse[integrationschema.InstanceIntegrationResource](t, response, http.StatusOK)
			commonfixture.MustCloseBody(t, response.Body)
			require.Equal(t, *licenseID.body.LicenseID, moved.LicenseID)
		})
	}
}
