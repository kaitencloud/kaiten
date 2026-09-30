package createentitlementgroup

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	entitlementEvents "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Creator is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Creator interface {
	CreateGroup(
		ctx context.Context, cl caller.OrganizationCaller, cmd *Command,
	) (*schema.EntitlementGroup, error)
}

// Request represents the HTTP request body for creating an entitlement group.
type Request struct {
	Body schema.EntitlementGroup
}

// Response represents the HTTP response body after creating an entitlement group.
type Response struct {
	Body *schema.EntitlementGroup
}

// RegisterEndpoint registers the HTTP endpoint for creating an entitlement group.
func RegisterEndpoint(api huma.API, app Creator) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "create-entitlement-group",
		Method:        http.MethodPost,
		Path:          "/entitlement-groups",
		Summary:       "Create a new entitlement group",
		Description:   "Create a new entitlement group to aggregate entitlements",
		Tags:          []string{"entitlement-groups"},
		DefaultStatus: http.StatusCreated,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		var slug *string
		if request.Body.Slug != "" {
			slug = &request.Body.Slug
		}
		command := &Command{
			Name:        request.Body.Name,
			Description: request.Body.Description,
			Slug:        slug,
		}

		group, err := app.CreateGroup(ctx, cl, command)
		if err != nil {
			return nil, err
		}

		return &Response{
			Body: group,
		}, nil
	})
}

// RegisterWebhook declares the EntitlementGroupCreated webhook contract in
// the OpenAPI document.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       entitlementEvents.EntitlementGroupCreated,
		Data:        (*schema.EntitlementGroup)(nil),
		OperationID: "onEntitlementGroupCreated",
		Summary:     "Entitlement Group Created Webhook",
		Description: "Triggered when a new entitlement group is created.",
		Tags:        []string{"webhooks", "entitlement-groups"},
	})
}
