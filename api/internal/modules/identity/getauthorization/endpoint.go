// Package getauthorization exposes only the current request's resolved identity
// and grants. Core's authentication, JIT and authorization middleware must run
// before this endpoint, for human and machine credentials alike.
package getauthorization

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/pkg/externalid"
)

type Request struct{}

type Authorization struct {
	Kind                   string    `json:"kind"`
	UserID                 uuid.UUID `json:"userId"`
	OrganizationID         uuid.UUID `json:"organizationId"`
	ExternalOrganizationID string    `json:"externalOrganizationId"`
	Subject                string    `json:"subject"`
	Scopes                 []string  `json:"scopes" nullable:"false"`
}

type Response struct {
	CacheControl string `header:"Cache-Control"`
	Body         Authorization
}

func RegisterEndpoint(api huma.API) {
	kaitenhuma.RegisterAuthorizationIntrospection(api, huma.Operation{
		OperationID: "GetAuthorization", Method: http.MethodGet, Path: "/authorization",
		Summary:     "Read current caller authorization",
		Description: "Returns current stored grants for an active human or service-token caller, not JWT permissions. No permission is required. Credentials and token identifiers are never returned. Responses must not be cached.",
		Tags:        []string{"identity"}, Errors: []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusInternalServerError},
	}, func(ctx context.Context, _ *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		p, _ := principal.FromContext(ctx)
		if cl.UserID() == uuid.Nil || cl.OrganizationID() == uuid.Nil || p.Provisioning.Subject == "" || p.Provisioning.ExternalOrganizationID == "" || externalid.DeriveOrganizationID(p.Provisioning.ExternalOrganizationID) != cl.OrganizationID() {
			return nil, kaitenerrors.Unauthorized("Auth.MissingClaims", "Resolved caller identity is incomplete")
		}
		grants := cl.Scopes()
		if grants == nil {
			grants = []string{}
		}
		return &Response{CacheControl: "no-store", Body: Authorization{
			Kind: string(principal.KindOrganization), UserID: cl.UserID(), OrganizationID: cl.OrganizationID(),
			ExternalOrganizationID: p.Provisioning.ExternalOrganizationID, Subject: p.Provisioning.Subject,
			Scopes: grants,
		}}, nil
	})
}
