package validatesessionvoucher

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// FacadeValidator is the one facade method this operation calls.
type FacadeValidator interface {
	ValidateSessionVoucher(ctx context.Context, cl caller.CustomerSessionCaller, request SessionVoucherCheck) (*SessionVoucherValidity, error)
}

type Request struct {
	Body SessionVoucherCheck
}

type Response struct {
	Body *SessionVoucherValidity
}

func RegisterEndpoint(api huma.API, app FacadeValidator) {
	kaitenhuma.RegisterSession(api, huma.Operation{
		OperationID: "validateSessionVoucher",
		Method:      http.MethodPost,
		Path:        "/public/session/vouchers/validate",
		Summary:     "Check a voucher code",
		Description: "Says whether a code would apply to the session's customer -- and its instance, and the price about to be checked out when given -- with what it gives. " +
			"Every reason it would not gets the same {valid: false}. Nothing is redeemed: checkout redeems. " +
			"429 .RateLimited, with Retry-After, past 10 checks per 10 minutes per session or 30 an hour per customer.",
		Tags: []string{"public"},
		Errors: []int{
			http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden,
			http.StatusUnprocessableEntity, http.StatusTooManyRequests, http.StatusInternalServerError, http.StatusServiceUnavailable,
		},
	}, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.CustomerSession(ctx)
		if err != nil {
			return nil, err
		}
		validity, err := app.ValidateSessionVoucher(ctx, cl, request.Body)
		if err != nil {
			return nil, err
		}
		return &Response{Body: validity}, nil
	})
}
