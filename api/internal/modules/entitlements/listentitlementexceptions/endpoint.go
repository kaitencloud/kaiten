package listentitlementexceptions

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/exceptions"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Lister is the one facade method this operation calls.
type Lister interface {
	ListExceptions(ctx context.Context, cl caller.OrganizationCaller, instanceSlug string, all bool) ([]exceptions.EntitlementException, error)
}

type Request struct {
	InstanceSlug string `path:"instanceSlug" doc:"Instance slug" example:"acme-prod"`
	Filter       string `query:"filter" enum:"active,all" default:"active" doc:"active: neither revoked nor ended, scheduled ones included; all: every exception of the instance"`
}

type Response struct {
	Body []exceptions.EntitlementException `nullable:"false"`
}

func RegisterEndpoint(api huma.API, app Lister) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "listEntitlementExceptions",
		Method:      http.MethodGet,
		Path:        "/instances/{instanceSlug}/entitlement-exceptions",
		Summary:     "List an instance's entitlement exceptions",
		Description: "The instance's exceptions, latest start first, each with its status at the read. Works whether or not billing is enabled.",
		Tags:        []string{"instances"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.ListExceptions(ctx, cl, request.InstanceSlug, request.Filter == FilterAll)
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
