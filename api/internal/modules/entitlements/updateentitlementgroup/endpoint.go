package updateentitlementgroup

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	entitlementEvents "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Updater is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Updater interface {
	UpdateGroup(
		ctx context.Context, cl caller.OrganizationCaller, slug string, cmd *Command,
	) error
}

// Request represents the HTTP request for updating an entitlement group.
// Body is schema.EntitlementGroup, the same type create-entitlement-group
// and get-entitlement-group use. Slug is structurally writable too, but this
// endpoint has never supported renaming a group -- rejected below if it
// differs from the path's.
type Request struct {
	Slug string `path:"entitlementGroupSlug"`
	Body schema.EntitlementGroup
}

// RegisterEndpoint registers the HTTP endpoint for updating an entitlement group.
func RegisterEndpoint(api huma.API, app Updater) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "update-entitlement-group",
		Method:      http.MethodPut,
		Path:        "/entitlement-groups/{entitlementGroupSlug}",
		Summary:     "Update an entitlement group",
		Description: "Update an existing entitlement group with the provided details",
		Tags:        []string{"entitlement-groups"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*struct{}, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		if request.Body.Slug != "" && request.Body.Slug != request.Slug {
			return nil, kaitenerrors.UnprocessableEntity(
				"UpdateEntitlementGroup.SlugNotRenameable",
				"slug cannot be changed through this endpoint; omit it or send the current slug",
			)
		}

		command := &Command{
			Name:        request.Body.Name,
			Description: request.Body.Description,
		}

		if err := app.UpdateGroup(ctx, cl, request.Slug, command); err != nil {
			return nil, err
		}

		return nil, nil
	})
}

// RegisterWebhook declares the EntitlementGroupUpdated webhook contract in
// the OpenAPI document.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       entitlementEvents.EntitlementGroupUpdated,
		Data:        (*schema.EntitlementGroup)(nil),
		OperationID: "onEntitlementGroupUpdated",
		Summary:     "Entitlement Group Updated Webhook",
		Description: "Triggered when an entitlement group is updated.",
		Tags:        []string{"webhooks", "entitlement-groups"},
	})
}
