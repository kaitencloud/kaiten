package deleteentitlementgroup

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

// Deleter is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Deleter interface {
	DeleteGroup(ctx context.Context, cl caller.OrganizationCaller, slug string) error
}

// Request represents the HTTP request for deleting an entitlement group.
type Request struct {
	Slug string `path:"entitlementGroupSlug"`
}

// RegisterEndpoint registers the HTTP endpoint for deleting an entitlement group.
func RegisterEndpoint(api huma.API, app Deleter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "delete-entitlement-group",
		Method:      http.MethodDelete,
		Path:        "/entitlement-groups/{entitlementGroupSlug}",
		Summary:     "Delete an entitlement group",
		Description: "Delete an entitlement group by its slug. This does not delete the member entitlements.",
		Tags:        []string{"entitlement-groups"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*struct{}, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		if err := app.DeleteGroup(ctx, cl, request.Slug); err != nil {
			return nil, err
		}

		return nil, nil
	})
}

// RegisterWebhook declares the EntitlementGroupDeleted webhook contract in
// the OpenAPI document.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       entitlementEvents.EntitlementGroupDeleted,
		Data:        (*schema.EntitlementGroup)(nil),
		OperationID: "onEntitlementGroupDeleted",
		Summary:     "Entitlement Group Deleted Webhook",
		Description: "Triggered when an entitlement group is deleted.",
		Tags:        []string{"webhooks", "entitlement-groups"},
	})
}
