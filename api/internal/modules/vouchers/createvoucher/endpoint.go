package createvoucher

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Creator is the one facade method this operation calls.
type Creator interface {
	CreateVoucher(ctx context.Context, cl caller.OrganizationCaller, draft catalogue.VoucherDraft) (*catalogue.Voucher, error)
}

type Request struct {
	Body catalogue.VoucherDraft
}

type Response struct {
	Body *catalogue.Voucher
}

func RegisterEndpoint(api huma.API, app Creator) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "createVoucher",
		Method:        http.MethodPost,
		Path:          "/vouchers",
		Summary:       "Create a voucher",
		Description:   "Creates a DRAFT voucher: a PRICE discount or an ENTITLEMENT_BOOST. The code is generated when none is given, and returned. Emits VOUCHER_CREATED, without the code. Requires billing to be enabled for the organization.",
		Tags:          []string{"vouchers"},
		DefaultStatus: http.StatusCreated,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.CreateVoucher(ctx, cl, request.Body)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
