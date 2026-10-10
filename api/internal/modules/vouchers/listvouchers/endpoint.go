package listvouchers

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

// Lister is the one facade method this operation calls.
type Lister interface {
	ListVouchers(ctx context.Context, cl caller.OrganizationCaller, status, voucherType, restrictedCustomerSlug, cursor string, limit int32) (pagination.Page[catalogue.Voucher], error)
}

type Request struct {
	Status                 string `query:"status" enum:"DRAFT,ACTIVE,EXPIRED,EXHAUSTED,ARCHIVED"`
	VoucherType            string `query:"voucherType" enum:"PRICE,ENTITLEMENT_BOOST"`
	RestrictedCustomerSlug string `query:"restrictedCustomerSlug"`
	Cursor                 string `query:"cursor" doc:"Opaque pagination cursor from a previous response's nextCursor"`
	Limit                  int32  `query:"limit" minimum:"1" maximum:"200" doc:"Maximum number of entries to return (default 50, max 200)"`
}

type Response struct {
	Body pagination.Page[catalogue.Voucher]
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
		result, err := app.ListVouchers(ctx, cl, request.Status, request.VoucherType, request.RestrictedCustomerSlug, request.Cursor, request.Limit)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
