package redeemvoucher

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Redeemer is the one facade method this operation calls.
type Redeemer interface {
	RedeemVoucher(ctx context.Context, cl caller.OrganizationCaller, instanceSlug, code string) (*catalogue.Redemption, error)
}

// RedeemableCode is the code to redeem.
type RedeemableCode struct {
	Code string `json:"code" minLength:"1" maxLength:"64" example:"SUMMER-2026-LAUNCH"`
}
type Request struct {
	InstanceSlug string `path:"instanceSlug" doc:"Instance slug" example:"acme-prod"`
	Body         RedeemableCode
}

type Response struct {
	Body *catalogue.Redemption
}

func RegisterEndpoint(api huma.API, app Redeemer) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "redeemVoucher",
		Method:        http.MethodPost,
		Path:          "/instances/{instanceSlug}/vouchers/redeem",
		Summary:       "Redeem a voucher",
		Description:   "Redeems a voucher for an instance. A boost applies from the next read or report, for its duration; a PRICE voucher discounts the subscription's next invoices. Emits INSTANCE_VOUCHER_REDEEMED, and VOUCHER_EXHAUSTED with the last redemption. Requires billing to be enabled for the organization.",
		Tags:          []string{"vouchers"},
		DefaultStatus: http.StatusCreated,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.RedeemVoucher(ctx, cl, request.InstanceSlug, request.Body.Code)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
