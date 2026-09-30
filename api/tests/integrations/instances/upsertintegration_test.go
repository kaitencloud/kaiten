package instances_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	customerschema "github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	integrationschema "github.com/kaitencloud/kaiten/api/internal/modules/integrations/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/integrations/upsertintegration"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestUpsertInstanceIntegrationSeparatesEntityAndIntegrationMetadata(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	customer := newCustomer(t)
	license := newLicense(t)
	const (
		adapter            = "kaiten.integration.crm.attio"
		customerExternalID = "rec_customer_123"
		instanceExternalID = "rec_workspace_123"
	)

	createCustomerIntegrationReq := commonfixture.NewJSONRequest(
		t,
		http.MethodPost,
		"/api/customers/"+customer.Slug+"/integrations/"+adapter,
		customerschema.CustomerIntegration{
			ExternalID: customerExternalID,
			Metadata:   map[string]any{"source": "attio"},
		},
	)
	createCustomerIntegrationResp, err := testServer.App.Test(createCustomerIntegrationReq, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, createCustomerIntegrationResp.Body)
	require.Equal(t, http.StatusCreated, createCustomerIntegrationResp.StatusCode)

	webURL := "https://app.attio.com/w/acme/workspace/rec_workspace_123"
	createBody := upsertintegration.InstanceBody{
		CustomerExternalID: ptr.To(customerExternalID),
		Description:        ptr.To("Initial description"),
		EndLicenseDate:     timePointer(time.Now().AddDate(1, 0, 0).UTC()),
		IntegrationMetadata: map[string]any{
			"sync": "initial",
		},
		LicenseID: &license.ID,
		Metadata: map[string]any{
			"owner": "team-platform",
		},
		Name:             ptr.To("External workspace"),
		StartLicenseDate: timePointer(time.Now().UTC()),
		WebURL:           &webURL,
	}
	createReq := commonfixture.NewJSONRequest(
		t,
		http.MethodPatch,
		"/api/integration/crm.attio/instance/"+instanceExternalID,
		createBody,
	)
	createResp, err := testServer.App.Test(createReq, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, createResp.Body)

	created := commonfixture.AssertJSONResponse[integrationschema.InstanceIntegrationResource](t, createResp, http.StatusOK)
	require.Equal(t, map[string]any{"owner": "team-platform"}, created.Metadata)
	require.NotNil(t, created.WebURL)
	require.Equal(t, webURL, *created.WebURL)

	integration := getInstanceIntegration(t, created.Slug, adapter)
	require.Equal(t, map[string]any{"sync": "initial"}, integration.Metadata)

	updateEntityMetadataReq := commonfixture.NewJSONRequest(
		t,
		http.MethodPatch,
		"/api/integration/crm.attio/instance/"+instanceExternalID,
		upsertintegration.InstanceBody{
			Metadata: map[string]any{"owner": "team-success"},
		},
	)
	updateEntityMetadataResp, err := testServer.App.Test(updateEntityMetadataReq, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, updateEntityMetadataResp.Body)
	updatedEntity := commonfixture.AssertJSONResponse[integrationschema.InstanceIntegrationResource](t, updateEntityMetadataResp, http.StatusOK)
	require.Equal(t, map[string]any{"owner": "team-success"}, updatedEntity.Metadata)
	require.Equal(t, map[string]any{"sync": "initial"}, getInstanceIntegration(t, created.Slug, adapter).Metadata)

	updateIntegrationMetadataReq := commonfixture.NewJSONRequest(
		t,
		http.MethodPatch,
		"/api/integration/crm.attio/instance/"+instanceExternalID,
		upsertintegration.InstanceBody{
			IntegrationMetadata: map[string]any{"sync": "refreshed"},
		},
	)
	updateIntegrationMetadataResp, err := testServer.App.Test(updateIntegrationMetadataReq, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, updateIntegrationMetadataResp.Body)
	updatedIntegration := commonfixture.AssertJSONResponse[integrationschema.InstanceIntegrationResource](t, updateIntegrationMetadataResp, http.StatusOK)
	require.Equal(t, map[string]any{"owner": "team-success"}, updatedIntegration.Metadata)
	require.Equal(t, map[string]any{"sync": "refreshed"}, getInstanceIntegration(t, created.Slug, adapter).Metadata)
}

func getInstanceIntegration(t *testing.T, instanceSlug, adapter string) instanceschema.InstanceIntegration {
	t.Helper()
	req := commonfixture.NewJSONRequest(
		t,
		http.MethodGet,
		"/api/instances/"+instanceSlug+"/integrations/"+adapter,
		nil,
	)
	resp, err := testServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)
	return commonfixture.AssertJSONResponse[instanceschema.InstanceIntegration](t, resp, http.StatusOK)
}

func timePointer(value time.Time) *time.Time {
	return &value
}
