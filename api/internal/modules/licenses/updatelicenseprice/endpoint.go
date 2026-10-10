package updatelicenseprice

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Updater is the one facade method this operation calls.
type Updater interface {
	UpdatePrice(ctx context.Context, cl caller.OrganizationCaller, licenseSlug string, priceID uuid.UUID, patch Patch) (*prices.Price, error)
}

// LicensePriceChanges is a partial price: an absent member keeps its value.
type LicensePriceChanges struct {
	BillingTiming          *string `json:"billingTiming,omitempty" enum:"ADVANCE,ARREARS" doc:"See createLicensePrice."`
	BillingPeriod          *string `json:"billingPeriod,omitempty" enum:"MONTHLY,QUARTERLY,SEMI_ANNUAL,ANNUAL" doc:"See createLicensePrice."`
	UnitAmountDecimal      *string `json:"unitAmountDecimal,omitempty" doc:"See createLicensePrice."`
	MeteredEntitlementSlug *string `json:"meteredEntitlementSlug,omitempty" doc:"See createLicensePrice."`
	DisplayLabel           *string `json:"displayLabel,omitempty" maxLength:"200"`
	DisplayOrder           *int32  `json:"displayOrder,omitempty" minimum:"0"`
	IsDefault              *bool   `json:"isDefault,omitempty"`
}

type Request struct {
	LicenseSlug string    `path:"licenseSlug" doc:"License version slug" example:"pro-v2"`
	PriceID     uuid.UUID `path:"priceId" doc:"Price identifier"`
	Body        LicensePriceChanges
}

type Response struct {
	Body *prices.Price
}

func RegisterEndpoint(api huma.API, app Updater) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "updateLicensePrice",
		Method:      http.MethodPatch,
		Path:        "/licenses/{licenseSlug}/prices/{priceId}",
		Summary:     "Update a license price",
		Description: "Edits a price of a DRAFT licence version; the prices of a published version are immutable (UpdateLicensePrice.VersionNotDraft). Currency and billing model cannot change. Requires billing to be enabled for the organization.",
		Tags:        []string{"licenses"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		price, err := app.UpdatePrice(ctx, cl, request.LicenseSlug, request.PriceID, Patch(request.Body))
		if err != nil {
			return nil, err
		}
		return &Response{Body: price}, nil
	})
}

// RegisterWebhook declares the LicensePriceUpdated webhook contract.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       events.LicensePriceUpdated,
		Data:        (*prices.LicensePriceUpdatedEvent)(nil),
		OperationID: "onLicensePriceUpdated",
		Summary:     "License Price Updated Webhook",
		Description: "Triggered when a price of a DRAFT licence version is edited.",
		Tags:        []string{"webhooks", "licenses"},
	})
}
