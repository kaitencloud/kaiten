package getlicensevalidation

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

type Getter interface {
	GetLicenseValidation(context.Context, caller.OrganizationCaller, string) (*schema.LicenseValidation, error)
}

type Request struct {
	InstanceSlug string `path:"instanceSlug" doc:"Instance slug" example:"restaurant-prod"`
}

type Response struct{ Body *schema.LicenseValidation }

func RegisterEndpoint(api huma.API, app Getter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "getInstanceLicenseValidation",
		Method:      http.MethodGet,
		Path:        "/instances/{instanceSlug}/license-validation",
		Summary:     "Validate an instance's assigned license term",
		Description: "Evaluate the assigned license term using UTC database time. The start is inclusive and the end exclusive. Catalog DRAFT/ARCHIVED state, operational status and commercial lifecycle stage do not invalidate an existing assignment. This point-in-time decision does not change feature evaluation or usage reporting; consumers enforce it before protected actions.",
		Tags:        []string{"instances"},
		Errors:      []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		validation, err := app.GetLicenseValidation(ctx, cl, request.InstanceSlug)
		if err != nil {
			return nil, err
		}
		return &Response{Body: validation}, nil
	})
}
