package billing_test

import (
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"
)

// Appendix A names a domain code for these refusals; the request schema used
// to answer first, with Huma's generic 422, or a 500 (CEO review of #16, low
// list). The schema keeps publishing the bounds (C-5, C-6, C-7), and the
// refusal still carries the code.
func TestRefusalsAnswerTheirDomainCodes(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	s := newSold(t, flatFee("2900", "MONTHLY"))
	draft := newVersion(t, "Draft", "DRAFT")
	price := createPrice(t, draft.Slug, flatFee("100", "MONTHLY"))
	require.Less(t, call(t, "POST", "/api/licenses/"+draft.Slug+"/prices/"+price.ID.String()+"/deprecate", nil).StatusCode, 300)
	license := func(extra map[string]any) map[string]any {
		body := map[string]any{"name": "Pro", "description": "d", "type": "PAID", "isDefault": false}
		for k, v := range extra {
			body[k] = v
		}
		return body
	}
	unknown := "00000000-0000-4000-8000-000000000000"

	for _, tc := range []struct {
		code, method, path string
		status             int
		body               any
	}{
		{"UpdateLicensePrice.PriceDeprecated", "PATCH", "/api/licenses/" + draft.Slug + "/prices/" + price.ID.String(), fiber.StatusConflict, map[string]any{"isDefault": true}},
		{"UpdateLicense.InvalidTrialPeriodDays", "PUT", "/api/licenses/" + s.version.Slug, fiber.StatusUnprocessableEntity, license(map[string]any{"trialPeriodDays": -1})},
		{
			"UpdateLicense.InvalidSelfServeCtaUrl", "PUT", "/api/licenses/" + s.version.Slug, fiber.StatusUnprocessableEntity,
			license(map[string]any{"selfServeCtaUrl": "https://a.test/" + strings.Repeat("x", 2040)}),
		},
		{"WriteOffInvoice.ReasonRequired", "POST", "/api/invoices/" + unknown + "/write-off", fiber.StatusUnprocessableEntity, map[string]any{}},
		{"VoidInvoice.ReasonRequired", "POST", "/api/invoices/" + unknown + "/void", fiber.StatusUnprocessableEntity, map[string]any{}},
		{"VoidInvoice.ReasonRequired", "POST", "/api/invoices/" + unknown + "/void", fiber.StatusUnprocessableEntity, map[string]any{"reason": ""}},
		{"VoidInvoice.ReasonRequired", "POST", "/api/invoices/" + unknown + "/void", fiber.StatusUnprocessableEntity, map[string]any{"reason": strings.Repeat("x", 501)}},
		{"CreateLicense.InvalidTrialPeriodDays", "POST", "/api/licenses", fiber.StatusUnprocessableEntity, license(map[string]any{"trialPeriodDays": -1})},
		{
			"CreateLicense.InvalidSelfServeCtaUrl", "POST", "/api/licenses", fiber.StatusUnprocessableEntity,
			license(map[string]any{"selfServeCtaUrl": "https://a.test/" + strings.Repeat("x", 2040)}),
		},
		{"ReleaseInvoiceHold.ReasonRequired", "POST", "/api/invoices/" + unknown + "/release-hold", fiber.StatusUnprocessableEntity, map[string]any{}},
		{"ClaimHandoff.InvalidLimit", "POST", "/api/billing/handoff/claim", fiber.StatusUnprocessableEntity, map[string]any{"limit": 0}},
		{"ListHandoff.InvalidStatus", "GET", "/api/billing/handoff?status=NOPE", fiber.StatusUnprocessableEntity, nil},
		{"ListInvoiceLineReports.NotFound", "GET", "/api/invoices/" + unknown + "/lines/" + unknown + "/reports", fiber.StatusNotFound, nil},
	} {
		require.Equal(t, tc.code, problemCode(t, tc.status, tc.method, tc.path, tc.body), tc.code)
	}
}
