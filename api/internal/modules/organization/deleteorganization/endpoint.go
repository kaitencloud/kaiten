package deleteorganization

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Deleter is the one facade method this operation calls, declared here rather
// than imported: internal/kaiten holds this use case, so naming it would close a
// cycle.
type Deleter interface {
	DeleteOrganization(ctx context.Context, cl caller.PlatformCaller, target uuid.UUID) error
}

type Request struct {
	// orgId, not id: kaitenhuma.TargetOrganizationParam is the single spelling the
	// Platform API's target-organization namespace uses, and the value passed to
	// the facade as the target below.
	OrganizationID uuid.UUID `path:"orgId" format:"uuid" doc:"Organization ID"`
}

// RegisterEndpoint publishes this operation on the Platform API only. Deleting a
// tenant by UUID, authorized by a scope rather than by owning the tenant, is a
// platform operation; on the Core API it was reachable by any organization
// credential holding delete:organizations.
func RegisterEndpoint(api huma.API, app Deleter) {
	kaitenhuma.RegisterPlatformForOrganization(api, huma.Operation{
		OperationID:   "delete-organization",
		Method:        http.MethodDelete,
		Path:          "/platform/organizations/{orgId}",
		Summary:       "Delete an organization",
		Description:   "Permanently deletes an organization and everything it owns — customers, licenses, feature flags, entitlements, instances, releases, memberships, service accounts and their tokens, and its audit trail. This cannot be undone, and the organization's usage history cannot be rebuilt. Platform API: requires a Kaiten platform token (`ksm_...`) with delete:organizations.",
		Tags:          []string{"organizations"},
		DefaultStatus: http.StatusNoContent,
		Errors:        []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*struct{}, error) {
		cl, err := caller.Platform(ctx)
		if err != nil {
			return nil, err
		}

		if err := app.DeleteOrganization(ctx, cl, request.OrganizationID); err != nil {
			return nil, err
		}
		return nil, nil
	})
}
