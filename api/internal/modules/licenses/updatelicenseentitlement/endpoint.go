package updatelicenseentitlement

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Updater is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Updater interface {
	UpdateEntitlement(
		ctx context.Context, cl caller.OrganizationCaller,
		licenseSlug, entitlementSlug string, cmd *Command,
	) error
}

// Request's Body is schema.LicenseEntitlement, the same type
// associate-entitlement-with-license and any read of a license's
// entitlements use. entitlementSlug is structurally writable too, but both
// the license and the entitlement are already named in the path here --
// rejected below if it differs from the path's.
type Request struct {
	LicenseSlug     string `path:"licenseSlug"`
	EntitlementSlug string `path:"entitlementSlug"`
	Body            schema.LicenseEntitlement
}

func RegisterEndpoint(api huma.API, app Updater) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "update-license-entitlement",
		Method:      http.MethodPut,
		Path:        "/licenses/{licenseSlug}/entitlements/{entitlementSlug}",
		Summary:     "Update an license entitlement",
		Description: "Update an license entitlement with the provided details",
		Tags:        []string{"licenses"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*struct{}, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		if request.Body.EntitlementSlug != "" && request.Body.EntitlementSlug != request.EntitlementSlug {
			return nil, kaitenerrors.UnprocessableEntity(
				"UpdateLicenseEntitlement.EntitlementSlugMismatch",
				"entitlementSlug cannot be changed through this endpoint; omit it or send the current entitlementSlug",
			)
		}

		command := &Command{
			Value:                          request.Body.Value,
			LimitCapExceededOveragePercent: request.Body.LimitCapExceededOveragePercent,
		}

		err = app.UpdateEntitlement(
			ctx, cl, request.LicenseSlug, request.EntitlementSlug, command)
		if err != nil {
			return nil, err
		}

		return nil, nil
	})
}

// RegisterWebhook declares the LicenseEntitlementUpdated webhook contract
// in the OpenAPI document.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       events.LicenseEntitlementUpdated,
		Data:        (*schema.LicenseEntitlement)(nil),
		OperationID: "onLicenseEntitlementUpdated",
		Summary:     "License Entitlement Updated Webhook",
		Description: "Triggered when a license entitlement is updated.",
		Tags:        []string{"webhooks", "licenses"},
	})
}
