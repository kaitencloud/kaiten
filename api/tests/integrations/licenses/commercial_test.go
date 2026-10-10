package licenses_test

import (
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// licenseCall sends payload to path and decodes the license or the problem it answers with.
func licenseCall(t *testing.T, method, path string, payload map[string]any) *http.Response {
	t.Helper()
	req := commonfixture.NewJSONRequest(t, method, path, payload)
	resp, err := testServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	t.Cleanup(func() { commonfixture.MustCloseBody(t, resp.Body) })
	return resp
}

func getLicense(t *testing.T, slug string) schema.License {
	t.Helper()
	resp := licenseCall(t, "GET", "/api/licenses/"+slug, nil)
	return commonfixture.AssertJSONResponse[schema.License](t, resp, fiber.StatusOK)
}

func basePayload(name string) map[string]any {
	return map[string]any{"name": name, "description": "d", "type": "PAID", "isDefault": false}
}

func TestLicenseCommercialFields(t *testing.T) {
	t.Run("WhenOmittedOnCreate_TheyTakeTheirDefaults", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		created := commonfixture.AssertJSONResponse[schema.License](t,
			licenseCall(t, "POST", "/api/licenses", basePayload("Plain")), fiber.StatusCreated)

		require.Equal(t, schema.PricingTypeCustom, created.PricingType)
		require.Nil(t, created.TrialPeriodDays)
		require.NotNil(t, created.RequiresPaymentMethod)
		require.False(t, *created.RequiresPaymentMethod)
		require.Nil(t, created.SelfServeCtaURL)
	})

	t.Run("WhenSetOnCreate_TheyAreStoredAndReadBack", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		payload := basePayload("Growth")
		payload["pricingType"] = "PAID"
		payload["trialPeriodDays"] = 14
		payload["requiresPaymentMethod"] = true
		payload["selfServeCtaUrl"] = "https://example.com/contact-sales"
		created := commonfixture.AssertJSONResponse[schema.License](t,
			licenseCall(t, "POST", "/api/licenses", payload), fiber.StatusCreated)

		read := getLicense(t, created.Slug)
		require.Equal(t, schema.PricingTypePaid, read.PricingType)
		require.EqualValues(t, 14, *read.TrialPeriodDays)
		require.True(t, *read.RequiresPaymentMethod)
		require.Equal(t, "https://example.com/contact-sales", *read.SelfServeCtaURL)
	})

	t.Run("WhenOmittedOnUpdate_TheyAreKept_AndZeroOrEmptyClears", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		payload := basePayload("Growth")
		payload["pricingType"] = "PAID"
		payload["trialPeriodDays"] = 14
		payload["requiresPaymentMethod"] = true
		payload["selfServeCtaUrl"] = "https://example.com/contact-sales"
		created := commonfixture.AssertJSONResponse[schema.License](t,
			licenseCall(t, "POST", "/api/licenses", payload), fiber.StatusCreated)
		path := "/api/licenses/" + created.Slug

		// A client that predates the commercial fields updates the licence.
		resp := licenseCall(t, "PUT", path, basePayload("Growth renamed"))
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
		read := getLicense(t, created.Slug)
		require.Equal(t, "Growth renamed", read.Name)
		require.Equal(t, schema.PricingTypePaid, read.PricingType)
		require.EqualValues(t, 14, *read.TrialPeriodDays)
		require.True(t, *read.RequiresPaymentMethod)
		require.NotNil(t, read.SelfServeCtaURL)

		cleared := basePayload("Growth renamed")
		cleared["trialPeriodDays"] = 0
		cleared["selfServeCtaUrl"] = ""
		cleared["requiresPaymentMethod"] = false
		cleared["pricingType"] = "FREE"
		require.Equal(t, fiber.StatusNoContent, licenseCall(t, "PUT", path, cleared).StatusCode)
		read = getLicense(t, created.Slug)
		require.Nil(t, read.TrialPeriodDays)
		require.Nil(t, read.SelfServeCtaURL)
		require.False(t, *read.RequiresPaymentMethod)
		require.Equal(t, schema.PricingTypeFree, read.PricingType)
	})

	t.Run("WhenInvalid_TheyAreRefused", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		problem := func(resp *http.Response, code string) {
			t.Helper()
			got := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, resp, fiber.StatusUnprocessableEntity)
			require.Equal(t, code, got.Code)
		}

		bad := basePayload("Bad")
		bad["trialPeriodDays"] = 0
		problem(licenseCall(t, "POST", "/api/licenses", bad), "CreateLicense.InvalidTrialPeriodDays")
		bad = basePayload("Bad")
		bad["selfServeCtaUrl"] = "ftp://example.com"
		problem(licenseCall(t, "POST", "/api/licenses", bad), "CreateLicense.InvalidSelfServeCtaUrl")
		bad["selfServeCtaUrl"] = "https://exa mple.com"
		problem(licenseCall(t, "POST", "/api/licenses", bad), "CreateLicense.InvalidSelfServeCtaUrl")

		created := commonfixture.AssertJSONResponse[schema.License](t,
			licenseCall(t, "POST", "/api/licenses", basePayload("Good")), fiber.StatusCreated)
		bad = basePayload("Good")
		bad["trialPeriodDays"] = -3
		resp := licenseCall(t, "PUT", "/api/licenses/"+created.Slug, bad)
		require.Equal(t, fiber.StatusUnprocessableEntity, resp.StatusCode, "negative days are refused by the schema")
		bad = basePayload("Good")
		bad["selfServeCtaUrl"] = "not a url"
		problem(licenseCall(t, "PUT", "/api/licenses/"+created.Slug, bad), "UpdateLicense.InvalidSelfServeCtaUrl")
	})
}
