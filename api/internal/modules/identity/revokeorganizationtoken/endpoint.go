package revokeorganizationtoken

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Revoker is the one facade method this operation calls, declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Revoker interface {
	RevokeOrganizationToken(ctx context.Context, cl caller.PlatformCaller,
		target uuid.UUID, tokenSlug string) error
}

// Request declares orgId because huma requires a field per path placeholder. This
// endpoint passes it to the facade as the target; the handler beneath reads the
// resolved value from targetorg, for the reason written in mintorganizationtoken's
// Request.
type Request struct {
	OrganizationID uuid.UUID `path:"orgId" format:"uuid" doc:"Organization the credential acts inside"`
	TokenSlug      string    `path:"tokenSlug" format:"text" doc:"Slug returned when the credential was minted" example:"system-kaiten-a1b2c3"`
}

// RegisterEndpoint publishes the revocation. It takes write:tokens rather than a
// delete scope, matching the Core API's own token revocation
// (delete-service-account-token): retiring a credential is part of managing the
// credentials you issued, not a separate authority.
func RegisterEndpoint(api huma.API, app Revoker) {
	kaitenhuma.RegisterPlatformForOrganization(api, huma.Operation{
		OperationID: "revoke-organization-token",
		Method:      http.MethodDelete,
		Path:        "/platform/organizations/{orgId}/tokens/{tokenSlug}",
		Summary:     "Revoke an organization credential minted for the platform identity",
		Description: "Retires a credential this platform credential minted in the named organization, " +
			"before the platform credential itself is retired. Only credentials issued by the " +
			"calling platform credential, in the named organization, can be revoked here.",
		Tags:          []string{"platform"},
		DefaultStatus: http.StatusNoContent,
		Errors: []int{
			http.StatusUnauthorized,
			http.StatusForbidden,
			http.StatusNotFound,
			http.StatusInternalServerError,
		},
	}, RequiredScope, func(ctx context.Context, request *Request) (*struct{}, error) {
		cl, err := caller.Platform(ctx)
		if err != nil {
			return nil, err
		}

		if err := app.RevokeOrganizationToken(ctx, cl, request.OrganizationID, request.TokenSlug); err != nil {
			return nil, err
		}
		return nil, nil
	})
}
