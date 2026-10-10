package createlicenseprice

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Creator is the one facade method this operation calls.
type Creator interface {
	CreatePrice(ctx context.Context, cl caller.OrganizationCaller, licenseSlug string, draft prices.Draft) (*prices.Price, error)
}

// NewLicensePrice is a new price. Currency and unitAmountDecimal are checked by the
// handler rather than by schema patterns, so a refusal carries its documented
// reason.
type NewLicensePrice struct {
	BillingModel           string  `json:"billingModel" enum:"FLAT_FEE,USAGE_BASED,OVERAGE" doc:"FLAT_FEE: an amount per billing period. USAGE_BASED: per sale unit of usage. OVERAGE: per sale unit of usage above the licence's limit."`
	BillingTiming          string  `json:"billingTiming,omitempty" enum:"ADVANCE,ARREARS" doc:"Defaults to ADVANCE for a FLAT_FEE price and ARREARS for a metered one, which must be ARREARS (CreateLicensePrice.InvalidTiming)."`
	BillingPeriod          *string `json:"billingPeriod,omitempty" enum:"MONTHLY,QUARTERLY,SEMI_ANNUAL,ANNUAL" doc:"Required on a FLAT_FEE price, refused on a metered one (CreateLicensePrice.InvalidPeriod)."`
	Currency               string  `json:"currency" doc:"ISO 4217 code, upper case (CreateLicensePrice.InvalidCurrency). One currency per licence version (CreateLicensePrice.CurrencyMismatch)." example:"EUR"`
	UnitAmountDecimal      string  `json:"unitAmountDecimal" doc:"Amount in minor units: per period for FLAT_FEE, per sale unit for metered prices. A non-negative decimal of at most 12 integer digits and 12 decimal places (CreateLicensePrice.InvalidAmount)." example:"2900"`
	MeteredEntitlementSlug string  `json:"meteredEntitlementSlug,omitempty" doc:"The entitlement a metered price measures: granted by the version, with a reset period, SUM or COUNT, NUMBER or NUMBER_AI_CREDIT, and metered by no other active price of the version." example:"tokens"`
	DisplayLabel           *string `json:"displayLabel,omitempty" maxLength:"200" doc:"The invoice line's label."`
	DisplayOrder           int32   `json:"displayOrder,omitempty" minimum:"0" doc:"Order among the version's prices."`
	IsDefault              bool    `json:"isDefault,omitempty" doc:"Makes this FLAT_FEE price the default of its billing period (CreateLicensePrice.DefaultConflict when another is)."`
}

type Request struct {
	LicenseSlug string `path:"licenseSlug" doc:"License version slug" example:"pro-v2"`
	Body        NewLicensePrice
}

type Response struct {
	Body *prices.Price
}

// ToDraft turns a request body into the draft the rules check.
func (b NewLicensePrice) ToDraft() prices.Draft {
	return prices.Draft{
		BillingModel:           b.BillingModel,
		BillingTiming:          b.BillingTiming,
		BillingPeriod:          b.BillingPeriod,
		Currency:               b.Currency,
		UnitAmountDecimal:      b.UnitAmountDecimal,
		MeteredEntitlementSlug: b.MeteredEntitlementSlug,
		DisplayLabel:           b.DisplayLabel,
		DisplayOrder:           b.DisplayOrder,
		IsDefault:              b.IsDefault,
	}
}

func RegisterEndpoint(api huma.API, app Creator) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "createLicensePrice",
		Method:        http.MethodPost,
		Path:          "/licenses/{licenseSlug}/prices",
		Summary:       "Create a license price",
		Description:   "Adds a price to a licence version. A metered price's sale-unit factor is captured from its entitlement now and never changes. Requires billing to be enabled for the organization.",
		Tags:          []string{"licenses"},
		DefaultStatus: http.StatusCreated,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		price, err := app.CreatePrice(ctx, cl, request.LicenseSlug, request.Body.ToDraft())
		if err != nil {
			return nil, err
		}
		return &Response{Body: price}, nil
	})
}

// RegisterWebhook declares the LicensePriceCreated webhook contract.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       events.LicensePriceCreated,
		Data:        (*prices.LicensePriceEvent)(nil),
		OperationID: "onLicensePriceCreated",
		Summary:     "License Price Created Webhook",
		Description: "Triggered when a price is added to a licence version.",
		Tags:        []string{"webhooks", "licenses"},
	})
}
