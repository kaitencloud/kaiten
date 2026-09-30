package removeentitlementfromgroup

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Remover is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Remover interface {
	RemoveFromGroup(
		ctx context.Context, cl caller.OrganizationCaller, groupSlug, entitlementSlug string,
	) error
}

// Request represents the HTTP request for removing an entitlement from a group.
type Request struct {
	GroupSlug       string `path:"entitlementGroupSlug"`
	EntitlementSlug string `path:"entitlementSlug"`
}

// RegisterEndpoint registers the HTTP endpoint for removing an entitlement from a group.
func RegisterEndpoint(api huma.API, app Remover) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "remove-entitlement-from-group",
		Method:      http.MethodDelete,
		Path:        "/entitlement-groups/{entitlementGroupSlug}/entitlements/{entitlementSlug}",
		Summary:     "Remove an entitlement from a group",
		Description: "Remove an entitlement from an entitlement group. The entitlement itself is not deleted.",
		Tags:        []string{"entitlement-groups"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*struct{}, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		err = app.RemoveFromGroup(ctx, cl, request.GroupSlug, request.EntitlementSlug)
		if err != nil {
			return nil, err
		}

		return nil, nil
	})
}
