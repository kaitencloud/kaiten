package listvouchers

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Lister is the one facade method this operation calls.
type Lister interface {
	ListVouchers(ctx context.Context, cl caller.OrganizationCaller, status, voucherType, restrictedCustomerSlug string) ([]catalogue.Voucher, error)
}

type Request struct {
	Status                 string `query:"status" enum:"DRAFT,ACTIVE,EXPIRED,EXHAUSTED,ARCHIVED"`
	VoucherType            string `query:"voucherType" enum:"PRICE,ENTITLEMENT_BOOST"`
	RestrictedCustomerSlug string `query:"restrictedCustomerSlug"`
}

type Response struct {
	Body []catalogue.Voucher `nullable:"false"`
}

func RegisterEndpoint(api huma.API, app Lister) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "listVouchers",
		Method:      http.MethodGet,
		Path:        "/vouchers",
		Summary:     "List vouchers",
		Description: "The organization's vouchers, newest first, with their codes. Requires billing to be enabled for the organization.",
		Tags:        []string{"vouchers"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.ListVouchers(ctx, cl, request.Status, request.VoucherType, request.RestrictedCustomerSlug)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
