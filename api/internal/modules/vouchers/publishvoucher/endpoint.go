package publishvoucher

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Publisher is the one facade method this operation calls.
type Publisher interface {
	PublishVoucher(ctx context.Context, cl caller.OrganizationCaller, voucherID uuid.UUID) (*catalogue.Voucher, error)
}

type Request struct {
	VoucherID uuid.UUID `path:"voucherId" doc:"Voucher id"`
}

type Response struct {
	Body *catalogue.Voucher
}

func RegisterEndpoint(api huma.API, app Publisher) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "publishVoucher",
		Method:      http.MethodPost,
		Path:        "/vouchers/{voucherId}/publish",
		Summary:     "Publish a voucher",
		Description: "Makes a DRAFT voucher redeemable (409 PublishVoucher.NotADraft otherwise). Emits VOUCHER_PUBLISHED. Requires billing to be enabled for the organization.",
		Tags:        []string{"vouchers"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.PublishVoucher(ctx, cl, request.VoucherID)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
