package listinstancevouchers

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
	ListInstanceVouchers(ctx context.Context, cl caller.OrganizationCaller, instanceSlug, status string) ([]catalogue.Redemption, error)
}

type Request struct {
	InstanceSlug string `path:"instanceSlug" doc:"Instance slug" example:"acme-prod"`
	Status       string `query:"status" enum:"ACTIVE,EXPIRED,REVOKED"`
}

type Response struct {
	Body []catalogue.Redemption `nullable:"false"`
}

func RegisterEndpoint(api huma.API, app Lister) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "listInstanceVouchers",
		Method:      http.MethodGet,
		Path:        "/instances/{instanceSlug}/vouchers",
		Summary:     "List an instance's vouchers",
		Description: "The vouchers an instance redeemed, newest first. Requires billing to be enabled for the organization.",
		Tags:        []string{"vouchers"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.ListInstanceVouchers(ctx, cl, request.InstanceSlug, request.Status)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
