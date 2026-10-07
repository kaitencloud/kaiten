package listvoucherredemptions

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Lister is the one facade method this operation calls.
type Lister interface {
	ListVoucherRedemptions(ctx context.Context, cl caller.OrganizationCaller, voucherID uuid.UUID) ([]catalogue.Redemption, error)
}

type Request struct {
	VoucherID uuid.UUID `path:"voucherId" doc:"Voucher id"`
}

type Response struct {
	Body []catalogue.Redemption `nullable:"false"`
}

func RegisterEndpoint(api huma.API, app Lister) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "listVoucherRedemptions",
		Method:      http.MethodGet,
		Path:        "/vouchers/{voucherId}/redemptions",
		Summary:     "List a voucher's redemptions",
		Description: "Every redemption of a voucher, newest first. Requires billing to be enabled for the organization.",
		Tags:        []string{"vouchers"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.ListVoucherRedemptions(ctx, cl, request.VoucherID)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
