package customers_test

import (
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	customerschema "github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	integrationschema "github.com/kaitencloud/kaiten/api/internal/modules/integrations/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/integrations/upsertintegration"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// TestUpsertCustomerIntegrationSeparatesEntityAndIntegrationMetadata mirrors
// tests/integrations/instances/upsertintegration_test.go's coverage for the
// customer side of the same endpoint family -- this endpoint had no
// integration test coverage despite composing customers' own create/update use
// cases, and this closes that gap.
func TestUpsertCustomerIntegrationSeparatesEntityAndIntegrationMetadata(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	const (
		adapter    = "crm.attio"
		externalID = "rec_customer_123"
	)

	webURL := "https://app.attio.com/w/acme/company/rec_customer_123"
	createBody := upsertintegration.CustomerBody{
		Domain: ptr.To("acme.example.com"),
		IntegrationMetadata: map[string]any{
			"sync": "initial",
		},
		Name:   ptr.To("Acme Corp"),
		WebURL: &webURL,
	}
	createReq := commonfixture.NewJSONRequest(
		t,
		http.MethodPatch,
		"/api/integration/"+adapter+"/customer/"+externalID,
		createBody,
	)
	createResp, err := testServer.App.Test(createReq, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, createResp.Body)

	created := commonfixture.AssertJSONResponse[integrationschema.CustomerIntegrationResource](t, createResp, http.StatusOK)
	require.Equal(t, "Acme Corp", created.Name)
	require.NotNil(t, created.Domain)
	require.Equal(t, "acme.example.com", *created.Domain)
	require.NotNil(t, created.WebURL)
	require.Equal(t, webURL, *created.WebURL)

	integration := getCustomerIntegration(t, created.Slug, adapter)
	require.Equal(t, map[string]any{"sync": "initial"}, integration.Metadata)

	// Updating the customer's own domain must not touch integration metadata.
	updateEntityReq := commonfixture.NewJSONRequest(
		t,
		http.MethodPatch,
		"/api/integration/"+adapter+"/customer/"+externalID,
		upsertintegration.CustomerBody{
			Domain: ptr.To("acme-corp.example.com"),
		},
	)
	updateEntityResp, err := testServer.App.Test(updateEntityReq, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, updateEntityResp.Body)
	updatedEntity := commonfixture.AssertJSONResponse[integrationschema.CustomerIntegrationResource](t, updateEntityResp, http.StatusOK)
	require.NotNil(t, updatedEntity.Domain)
	require.Equal(t, "acme-corp.example.com", *updatedEntity.Domain)
	require.Equal(t, map[string]any{"sync": "initial"}, getCustomerIntegration(t, created.Slug, adapter).Metadata)

	// Updating integration metadata must not touch the customer's own fields.
	updateIntegrationReq := commonfixture.NewJSONRequest(
		t,
		http.MethodPatch,
		"/api/integration/"+adapter+"/customer/"+externalID,
		upsertintegration.CustomerBody{
			IntegrationMetadata: map[string]any{"sync": "refreshed"},
		},
	)
	updateIntegrationResp, err := testServer.App.Test(updateIntegrationReq, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, updateIntegrationResp.Body)
	updatedIntegration := commonfixture.AssertJSONResponse[integrationschema.CustomerIntegrationResource](t, updateIntegrationResp, http.StatusOK)
	require.NotNil(t, updatedIntegration.Domain)
	require.Equal(t, "acme-corp.example.com", *updatedIntegration.Domain)
	require.Equal(t, map[string]any{"sync": "refreshed"}, getCustomerIntegration(t, created.Slug, adapter).Metadata)
}

func getCustomerIntegration(t *testing.T, customerSlug, adapter string) customerschema.CustomerIntegration {
	t.Helper()
	// The customer-integration lookup endpoint takes the fully-qualified
	// integration name (including the "kaiten.integration." prefix
	// NormalizeAdapter adds when writing), unlike the upsert-by-external-ref
	// PATCH path, which takes the short adapter name.
	req := commonfixture.NewJSONRequest(
		t,
		http.MethodGet,
		"/api/customers/"+customerSlug+"/integrations/kaiten.integration."+adapter,
		nil,
	)
	resp, err := testServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)
	return commonfixture.AssertJSONResponse[customerschema.CustomerIntegration](t, resp, http.StatusOK)
}
