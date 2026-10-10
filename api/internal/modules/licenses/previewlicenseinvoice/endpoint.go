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
	BasePriceID  *uuid.UUID          `json:"basePriceId,omitempty" doc:"The FLAT_FEE price billed as the base (PreviewLicenseInvoice.PriceNotFound). Defaults to the version's default FLAT_FEE price (PreviewLicenseInvoice.NoBasePrice when it has none)."`
	InstanceSlug *string             `json:"instanceSlug,omitempty" doc:"Rate this instance's own usage, read from its journal over [P0, now): P0 of its live subscription, else one billing period back (PreviewLicenseInvoice.InstanceNotFound; .OutsideRetention when P0 is before the usage history). Not with sampleUsage."`
	SampleUsage  []SampleUsageAmount `json:"sampleUsage,omitempty" doc:"Usage of the metered entitlements over the period that ends, one entry per entitlement, rated against the version's grant and the listed add-ons'. An entitlement left out used nothing."`
	AddOns       []AddonAmount       `json:"addOns,omitempty" doc:"Add-on versions priced in: their fees for the base's period and their metered prices, and their grants for the sample (PreviewLicenseInvoice.AddonNotFound; .InvalidAddOns for a repeated one or a quantity below 1)."`
	VoucherCode  *string             `json:"voucherCode,omitempty" doc:"A PRICE voucher's discount, applied as a redemption would, consuming nothing (PreviewLicenseInvoice.VoucherNotFound; .VoucherInvalid when it is not an ACTIVE PRICE voucher)."`
}

// AddonAmount is an add-on version the preview prices in.
type AddonAmount struct {
	AddonSlug string `json:"addonSlug" example:"extra-seats-v1"`
	Quantity  int32  `json:"quantity" example:"3"`
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
		Description: "Composes the RENEWAL invoice a subscription to this licence version would be billed at a boundary now, without writing anything: an instance's usage or a sample, rated in arrears over the billing period that ends; the base price for the period that starts (or the one that ends, for an ARREARS base); the listed add-ons; a voucher's discount. Works on DRAFT versions, to check prices before publishing. Requires billing to be enabled for the organization.",
		Tags:        []string{"licenses"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		scenario := Scenario{
			BasePriceID: request.Body.BasePriceID, InstanceSlug: request.Body.InstanceSlug,
			SampleUsage: make([]Sample, len(request.Body.SampleUsage)), AddOns: make([]AddonQuantity, len(request.Body.AddOns)),
			VoucherCode: request.Body.VoucherCode,
		}
		for i, sample := range request.Body.SampleUsage {
			scenario.SampleUsage[i] = Sample(sample)
		}
		for i, addon := range request.Body.AddOns {
			scenario.AddOns[i] = AddonQuantity(addon)
		}
		preview, err := app.PreviewInvoice(ctx, cl, request.LicenseSlug, scenario)
		if err != nil {
			return nil, err
		}
		return &Response{Body: preview}, nil
	})
}
