package deletelicenseentitlement

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Deleter is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Deleter interface {
	DeleteEntitlement(
		ctx context.Context, cl caller.OrganizationCaller, licenseSlug, entitlementSlug string,
	) error
}

type Request struct {
	LicenseSlug     string `path:"licenseSlug"`
	EntitlementSlug string `path:"entitlementSlug"`
}

func RegisterEndpoint(api huma.API, app Deleter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "delete-license-entitlement",
		Method:      http.MethodDelete,
		Path:        "/licenses/{licenseSlug}/entitlements/{entitlementSlug}",
		Summary:     "Delete a license entitlement",
		Description: "Delete a license entitlement with the provided details",
		Tags:        []string{"licenses"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*struct{}, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		err = app.DeleteEntitlement(ctx, cl, request.LicenseSlug, request.EntitlementSlug)
		if err != nil {
			return nil, err
		}

		return nil, nil
	})
}

// RegisterWebhook declares the LicenseEntitlementUnassigned webhook
// contract in the OpenAPI document.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       events.LicenseEntitlementUnassigned,
		Data:        (*schema.LicenseEntitlement)(nil),
		OperationID: "onLicenseEntitlementUnassigned",
		Summary:     "License Entitlement Unassigned Webhook",
		Description: "Triggered when an entitlement is unassigned from a license.",
		Tags:        []string{"webhooks", "licenses"},
	})
}
