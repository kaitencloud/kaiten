package addentitlementtogroup

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Adder is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Adder interface {
	AddToGroup(
		ctx context.Context, cl caller.OrganizationCaller, groupSlug string, cmd *Command,
	) error
}

// Request represents the HTTP request for adding an entitlement to a group.
type Request struct {
	GroupSlug string `path:"entitlementGroupSlug"`
	Body      Command
}

// RegisterEndpoint registers the HTTP endpoint for adding an entitlement to a group.
func RegisterEndpoint(api huma.API, app Adder) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "add-entitlement-to-group",
		Method:        http.MethodPost,
		Path:          "/entitlement-groups/{entitlementGroupSlug}/entitlements",
		Summary:       "Add an entitlement to a group",
		Description:   "Add an existing entitlement as a member of an entitlement group",
		Tags:          []string{"entitlement-groups"},
		DefaultStatus: http.StatusCreated,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*struct{}, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		if err := app.AddToGroup(ctx, cl, request.GroupSlug, &request.Body); err != nil {
			return nil, err
		}

		return nil, nil
	})
}
