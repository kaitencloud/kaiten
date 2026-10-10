package revokecustomersession

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Revoker is the one facade method this operation calls.
type Revoker interface {
	RevokeCustomerSession(ctx context.Context, cl caller.OrganizationCaller, sessionID uuid.UUID) error
}

type Request struct {
	SessionID uuid.UUID `path:"sessionId" doc:"Customer session id"`
}

func RegisterEndpoint(api huma.API, app Revoker) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "revokeCustomerSession",
		Method:        http.MethodPost,
		Path:          "/customer-sessions/{sessionId}/revoke",
		Summary:       "Revoke a customer session",
		Description:   "The session stops authenticating on the next request: on sign-out, or when the customer's access changes. Idempotent.",
		Tags:          []string{"customer-sessions"},
		DefaultStatus: http.StatusNoContent,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*struct{}, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		return nil, app.RevokeCustomerSession(ctx, cl, request.SessionID)
	})
}
