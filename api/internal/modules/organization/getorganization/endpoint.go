package getorganization

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Reader is the one facade method this operation calls.
//
// Declared here rather than imported because internal/kaiten holds this use case:
// naming that package from here would close a cycle. Declaring the method instead
// means the dependency points the way the layering does, and the interface is one
// method wide, so it says exactly what this endpoint is allowed to do.
type Reader interface {
	GetOrganization(ctx context.Context, cl caller.PlatformCaller, target uuid.UUID) (*schema.Organization, error)
}

type Request struct {
	// The parameter is named orgId, not id, because it is the Platform API's
	// target-organization parameter: kaitenhuma.TargetOrganizationParam is the
	// one spelling registration asserts on, and it is the value passed to the
	// facade as the target below.
	OrganizationID uuid.UUID `path:"orgId" format:"uuid" doc:"Organization ID"`
}

type Response struct {
	Body schema.Organization
}

// RegisterEndpoint publishes this operation on the Platform API only.
func RegisterEndpoint(api huma.API, app Reader) {
	kaitenhuma.RegisterPlatformForOrganization(api, huma.Operation{
		OperationID: "get-organization",
		Method:      http.MethodGet,
		Path:        "/platform/organizations/{orgId}",
		Summary:     "Get an organization by ID",
		Description: "Retrieve an organization by their unique identifier. Platform API: requires a Kaiten platform token (`ksm_...`).",
		Tags:        []string{"organizations"},
		Errors:      []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Platform(ctx)
		if err != nil {
			return nil, err
		}

		organization, err := app.GetOrganization(ctx, cl, request.OrganizationID)
		if err != nil {
			return nil, err
		}

		return &Response{
			Body: *organization,
		}, nil
	})
}
