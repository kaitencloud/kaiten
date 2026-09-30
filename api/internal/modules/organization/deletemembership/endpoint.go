package deletemembership

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
	DeleteMembership(ctx context.Context, cl caller.PlatformCaller, target, userID uuid.UUID) error
}

type Request struct {
	// Both parameters are read here and both are passed on: orgId as the target the
	// facade resolves, userId as the membership to remove inside it. orgId is spelled
	// the way kaitenhuma.TargetOrganizationParam spells it, which is what registration
	// asserts on.
	OrganizationID uuid.UUID `path:"orgId" format:"uuid" doc:"Organization ID"`
	UserID         uuid.UUID `path:"userId" format:"uuid" doc:"User ID"`
}

// RegisterEndpoint publishes this operation on the Platform API only. It already
// named its organization orgId, so the move was a change of prefix and registrar.
func RegisterEndpoint(api huma.API, app Deleter) {
	kaitenhuma.RegisterPlatformForOrganization(api, huma.Operation{
		OperationID:   "delete-membership",
		Method:        http.MethodDelete,
		Path:          "/platform/organizations/{orgId}/memberships/{userId}",
		Summary:       "Remove a user's membership on an organization",
		Description:   "Soft-deletes a single membership. Platform API: requires a Kaiten platform token (`ksm_...`) with delete:memberships. The system:kaiten membership cannot be removed — the database refuses it, and this answers 403.",
		Tags:          []string{"organizations"},
		DefaultStatus: http.StatusNoContent,
		Errors:        []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*struct{}, error) {
		cl, err := caller.Platform(ctx)
		if err != nil {
			return nil, err
		}

		if err := app.DeleteMembership(ctx, cl, request.OrganizationID, request.UserID); err != nil {
			return nil, err
		}
		return nil, nil
	})
}
