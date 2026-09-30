package ensureorganization

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Ensurer is the one facade method this operation calls, declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Ensurer interface {
	EnsureOrganization(
		ctx context.Context, cl caller.PlatformCaller, cmd *Command,
	) (*schema.Organization, error)
}

type Request struct {
	Body EnsureOrganizationBody
}

// EnsureOrganizationBody is what a client sends, as opposed to the Organization
// response DTO: the id is derived from the external id rather than supplied, so it
// is not part of the payload and cannot be chosen.
//
// The request spells it externalId and the response spells it external_id, which is
// not a slip and is not fixable here. schema.Organization is the response of
// get-organization and list-organizations as well, so renaming its field would be a
// breaking change to two published operations and to every generated client, to
// settle a naming question this operation did not open. New request bodies in this
// codebase are camelCase (createcomponent, upsertintegration), so this one is, and
// the mismatch is recorded rather than propagated.
type EnsureOrganizationBody struct {
	ExternalID string `json:"externalId" example:"org_2abcDEF" doc:"The identity provider's id for the organization. The row's id is derived from this value, so the same external id always converges on the same organization." minLength:"1" maxLength:"255"`
	Name       string `json:"name,omitempty" example:"Kaiten" doc:"Display name for a newly created organization. Never replaces an existing one's name; omitted, a new organization is named after its external id." maxLength:"255"`
}

type Response struct {
	Body *schema.Organization
}

// RegisterEndpoint publishes this operation on the Platform API only.
//
// It sits outside the /platform/organizations/{orgId} namespace, and has to:
// every operation in that namespace resolves its target before acting, and this
// one is how the target comes to exist. There is nothing for the target-binding
// registrar to bind.
//
// 200 rather than 201, on both paths. The upsert returns the row without saying
// whether it inserted it, and inventing that distinction here would mean a second
// read whose only purpose is to pick a status code -- while a caller that wanted to
// know already knows, because it chose the external id.
func RegisterEndpoint(api huma.API, app Ensurer) {
	kaitenhuma.RegisterPlatform(api, huma.Operation{
		OperationID: "ensure-organization",
		Method:      http.MethodPost,
		Path:        "/platform/organizations",
		Summary:     "Create an organization if it does not already exist",
		Description: "Converges on the organization an external identity provider describes, " +
			"creating it if it is not already there and returning it either way. The " +
			"internal id is derived from the external id, so the operation is idempotent: " +
			"a re-run returns the same organization instead of creating a second tenant, " +
			"and an organization that already exists -- including one provisioned on a " +
			"first login -- is returned unchanged apart from acquiring a name if it had " +
			"none. Platform API: requires a Kaiten platform token (`ksm_...`) with " +
			"write:organizations.",
		Tags:          []string{"organizations"},
		DefaultStatus: http.StatusOK,
		Errors: []int{
			http.StatusBadRequest,
			http.StatusUnauthorized,
			http.StatusForbidden,
			http.StatusUnprocessableEntity,
			http.StatusInternalServerError,
		},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Platform(ctx)
		if err != nil {
			return nil, err
		}

		organization, err := app.EnsureOrganization(ctx, cl, &Command{
			ExternalID: request.Body.ExternalID,
			Name:       request.Body.Name,
		})
		if err != nil {
			return nil, err
		}

		return &Response{Body: organization}, nil
	})
}
