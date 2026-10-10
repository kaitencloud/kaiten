package listvoucherredemptions

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

// Lister is the one facade method this operation calls.
type Lister interface {
	ListVoucherRedemptions(ctx context.Context, cl caller.OrganizationCaller, voucherID uuid.UUID, cursor string, limit int32) (pagination.Page[catalogue.Redemption], error)
}

type Request struct {
	VoucherID uuid.UUID `path:"voucherId" doc:"Voucher id"`
	Cursor    string    `query:"cursor" doc:"Opaque pagination cursor from a previous response's nextCursor"`
	Limit     int32     `query:"limit" minimum:"1" maximum:"200" doc:"Maximum number of entries to return (default 50, max 200)"`
}

type Response struct {
	Body pagination.Page[catalogue.Redemption]
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
		result, err := app.ListVoucherRedemptions(ctx, cl, request.VoucherID, request.Cursor, request.Limit)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
