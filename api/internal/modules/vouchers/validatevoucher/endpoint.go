package validatevoucher

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Validator is the one facade method this operation calls.
type Validator interface {
	ValidateVoucher(ctx context.Context, cl caller.OrganizationCaller, command VoucherCheck) (*Validity, error)
}

type Request struct {
	Body VoucherCheck
}

type Response struct {
	Body *Validity
}

func RegisterEndpoint(api huma.API, app Validator) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "validateVoucher",
		Method:      http.MethodPost,
		Path:        "/vouchers/validate",
		Summary:     "Validate a voucher code",
		Description: "Runs the redemption checks without redeeming: the voucher's own, and, with instanceSlug, the instance's. Answers 200 with valid, and the first failing reason (and eligibility rule) otherwise. Requires billing to be enabled for the organization.",
		Tags:        []string{"vouchers"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.ValidateVoucher(ctx, cl, request.Body)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
