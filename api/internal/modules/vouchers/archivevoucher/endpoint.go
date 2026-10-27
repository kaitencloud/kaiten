package archivevoucher

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Archiver is the one facade method this operation calls.
type Archiver interface {
	ArchiveVoucher(ctx context.Context, cl caller.OrganizationCaller, voucherID uuid.UUID) (*catalogue.Voucher, error)
}

type Request struct {
	VoucherID uuid.UUID `path:"voucherId" doc:"Voucher id"`
}

type Response struct {
	Body *catalogue.Voucher
}

func RegisterEndpoint(api huma.API, app Archiver) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "archiveVoucher",
		Method:      http.MethodPost,
		Path:        "/vouchers/{voucherId}/archive",
		Summary:     "Archive a voucher",
		Description: "Stops a voucher from being redeemed. Redemptions already made keep applying until revoked. Emits VOUCHER_ARCHIVED. Requires billing to be enabled for the organization.",
		Tags:        []string{"vouchers"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.ArchiveVoucher(ctx, cl, request.VoucherID)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
