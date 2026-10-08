package revokeinstancevoucher

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Revoker is the one facade method this operation calls.
type Revoker interface {
	RevokeInstanceVoucher(ctx context.Context, cl caller.OrganizationCaller, instanceSlug string, instanceVoucherID uuid.UUID, reason string) (*catalogue.Redemption, error)
}

// RevocationReason is why a redemption is revoked.
type RevocationReason struct {
	Reason string `json:"reason" maxLength:"500" example:"Granted by mistake"`
}
type Request struct {
	InstanceSlug      string    `path:"instanceSlug" doc:"Instance slug" example:"acme-prod"`
	InstanceVoucherID uuid.UUID `path:"instanceVoucherId" doc:"Redemption id"`
	Body              RevocationReason
}

type Response struct {
	Body *catalogue.Redemption
}

func RegisterEndpoint(api huma.API, app Revoker) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "revokeInstanceVoucher",
		Method:      http.MethodPost,
		Path:        "/instances/{instanceSlug}/vouchers/{instanceVoucherId}/revoke",
		Summary:     "Revoke a redemption",
		Description: "Stops a redemption from applying: a boost ends at once, a discount applies to no further invoice. Invoices already issued are untouched. Emits INSTANCE_VOUCHER_REVOKED. Requires billing to be enabled for the organization.",
		Tags:        []string{"vouchers"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.RevokeInstanceVoucher(ctx, cl, request.InstanceSlug, request.InstanceVoucherID, request.Body.Reason)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
