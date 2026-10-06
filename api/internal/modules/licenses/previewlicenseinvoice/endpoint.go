package previewlicenseinvoice

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Previewer is the one facade method this operation calls.
type Previewer interface {
	PreviewInvoice(ctx context.Context, cl caller.OrganizationCaller, licenseSlug string, scenario Scenario) (*rating.InvoicePreview, error)
}

// InvoicePreviewScenario is what to preview.
type InvoicePreviewScenario struct {
	BasePriceID *uuid.UUID          `json:"basePriceId,omitempty" doc:"The FLAT_FEE price billed as the base (PreviewLicenseInvoice.PriceNotFound). Defaults to the version's default FLAT_FEE price (PreviewLicenseInvoice.NoBasePrice when it has none)."`
	SampleUsage []SampleUsageAmount `json:"sampleUsage,omitempty" doc:"Usage of the metered entitlements over the period that ends, one entry per entitlement. An entitlement left out used nothing."`
}

// SampleUsageAmount is a quantity of one metered entitlement.
type SampleUsageAmount struct {
	EntitlementSlug string `json:"entitlementSlug" doc:"An entitlement an ACTIVE price of the version meters" example:"tokens"`
	Quantity        string `json:"quantity" doc:"Usage in the entitlement's measured units, a non-negative decimal string. Rated as one reset window against the version's grant: usage above limit × (1 + overage percent / 100) would be rejected, so it is capped, and the line says capped." example:"130500"`
}

type Request struct {
	LicenseSlug string `path:"licenseSlug" doc:"License version slug" example:"pro-v2"`
	Body        InvoicePreviewScenario
}

type Response struct {
	Body *rating.InvoicePreview
}

func RegisterEndpoint(api huma.API, app Previewer) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "previewLicenseInvoice",
		Method:      http.MethodPost,
		Path:        "/licenses/{licenseSlug}/invoice-preview",
		Summary:     "Preview a license invoice",
		Description: "Composes the RENEWAL invoice a subscription to this licence version would be billed at a boundary now, without writing anything: the sample usage rated in arrears over the billing period that ends, and the base price for the period that starts (or the one that ends, for an ARREARS base). Works on DRAFT versions, to check prices before publishing. Requires billing to be enabled for the organization.",
		Tags:        []string{"licenses"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		scenario := Scenario{BasePriceID: request.Body.BasePriceID, SampleUsage: make([]Sample, len(request.Body.SampleUsage))}
		for i, sample := range request.Body.SampleUsage {
			scenario.SampleUsage[i] = Sample(sample)
		}
		preview, err := app.PreviewInvoice(ctx, cl, request.LicenseSlug, scenario)
		if err != nil {
			return nil, err
		}
		return &Response{Body: preview}, nil
	})
}
