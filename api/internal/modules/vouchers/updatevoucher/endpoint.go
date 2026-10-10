package updatevoucher

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Updater is the one facade method this operation calls.
type Updater interface {
	UpdateVoucher(ctx context.Context, cl caller.OrganizationCaller, voucherID uuid.UUID, draft catalogue.VoucherDraft) (*catalogue.Voucher, error)
}

type Request struct {
	VoucherID uuid.UUID `path:"voucherId" doc:"Voucher id"`
	Body      catalogue.VoucherDraft
}

type Response struct {
	Body *catalogue.Voucher
}

func RegisterEndpoint(api huma.API, app Updater) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "updateVoucher",
		Method:      http.MethodPut,
		Path:        "/vouchers/{voucherId}",
		Summary:     "Update a voucher",
		Description: "Replaces a DRAFT voucher, but its type. An ACTIVE voucher takes a new name, description, expiresAt and maxRedemptions (at least redemptionsCount); its other members must stay as they are (409 UpdateVoucher.NotEditable). Emits VOUCHER_UPDATED. Requires billing to be enabled for the organization.",
		Tags:        []string{"vouchers"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.UpdateVoucher(ctx, cl, request.VoucherID, request.Body)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
