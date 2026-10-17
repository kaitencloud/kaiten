package lookupvoucher

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Finder is the one facade method this operation calls.
type Finder interface {
	LookupVoucher(ctx context.Context, cl caller.OrganizationCaller, code string) (*catalogue.Voucher, error)
}

// VoucherCode is a code to look up.
type VoucherCode struct {
	Code string `json:"code" minLength:"1" maxLength:"64" example:"SUMMER-2026-LAUNCH"`
}
type Request struct {
	Body VoucherCode
}

type Response struct {
	Body *catalogue.Voucher
}

func RegisterEndpoint(api huma.API, app Finder) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "lookupVoucher",
		Method:      http.MethodPost,
		Path:        "/vouchers/lookup",
		Summary:     "Find a voucher by code",
		Description: "Finds the voucher a code names, matched without case or separators. The code travels in the body, never in a URL. Requires billing to be enabled for the organization.",
		Tags:        []string{"vouchers"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.LookupVoucher(ctx, cl, request.Body.Code)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
