package revokeentitlementexception

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
	RevokeException(ctx context.Context, cl caller.OrganizationCaller, instanceSlug string, id uuid.UUID) error
}

type Request struct {
	InstanceSlug string    `path:"instanceSlug" doc:"Instance slug" example:"acme-prod"`
	ExceptionID  uuid.UUID `path:"exceptionId" doc:"Exception id"`
}

func RegisterEndpoint(api huma.API, app Revoker) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "revokeEntitlementException",
		Method:        http.MethodDelete,
		Path:          "/instances/{instanceSlug}/entitlement-exceptions/{exceptionId}",
		Summary:       "Revoke an entitlement exception",
		Description:   "Revokes an exception and keeps it, readable with filter=all: a scheduled one never starts, an active one ends at once. Revoking one already revoked or ended changes nothing. Emits INSTANCE_ENTITLEMENT_EXCEPTION_REVOKED. Works whether or not billing is enabled.",
		Tags:          []string{"instances"},
		DefaultStatus: http.StatusNoContent,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*struct{}, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		if err := app.RevokeException(ctx, cl, request.InstanceSlug, request.ExceptionID); err != nil {
			return nil, err
		}
		return &struct{}{}, nil
	})
}
