package getvoucher

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Getter is the one facade method this operation calls.
type Getter interface {
	GetVoucher(ctx context.Context, cl caller.OrganizationCaller, voucherID uuid.UUID) (*catalogue.Voucher, error)
}

type Request struct {
	VoucherID uuid.UUID `path:"voucherId" doc:"Voucher id"`
}

type Response struct {
	Body *catalogue.Voucher
}

func RegisterEndpoint(api huma.API, app Getter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "getVoucher",
		Method:      http.MethodGet,
		Path:        "/vouchers/{voucherId}",
		Summary:     "Get a voucher",
		Description: "One voucher, with its code. Requires billing to be enabled for the organization.",
		Tags:        []string{"vouchers"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.GetVoucher(ctx, cl, request.VoucherID)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
