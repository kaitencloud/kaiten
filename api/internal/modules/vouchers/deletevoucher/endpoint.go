package deletevoucher

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Deleter is the one facade method this operation calls.
type Deleter interface {
	DeleteVoucher(ctx context.Context, cl caller.OrganizationCaller, voucherID uuid.UUID) error
}

type Request struct {
	VoucherID uuid.UUID `path:"voucherId" doc:"Voucher id"`
}

func RegisterEndpoint(api huma.API, app Deleter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "deleteVoucher",
		Method:        http.MethodDelete,
		Path:          "/vouchers/{voucherId}",
		Summary:       "Delete a voucher",
		Description:   "Deletes a voucher no instance ever redeemed, whatever its status, with its grants and flag grants: the entitlements and flags they held can be deleted again, and its code can be given to another voucher. A voucher redeemed at least once, or one a checkout waiting for its payment applies, is history (409 DeleteVoucher.Redeemed): archive it instead. Emits VOUCHER_DELETED. Requires billing to be enabled for the organization.",
		Tags:          []string{"vouchers"},
		DefaultStatus: http.StatusNoContent,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*struct{}, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		if err := app.DeleteVoucher(ctx, cl, request.VoucherID); err != nil {
			return nil, err
		}
		return &struct{}{}, nil
	})
}
