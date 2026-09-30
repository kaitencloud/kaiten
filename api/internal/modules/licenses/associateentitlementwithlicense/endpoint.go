package associateentitlementwithlicense

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

// Associator is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Associator interface {
	AssociateEntitlement(
		ctx context.Context, cl caller.OrganizationCaller, licenseSlug string, cmd *Command,
	) error
}

type Request struct {
	LicenseSlug string `path:"licenseSlug" doc:"License slug" example:"license-slug"`
	Body        schema.LicenseEntitlement
}

func RegisterEndpoint(api huma.API, app Associator) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "associate-entitlement-with-license",
		Method:      http.MethodPost,
		Path:        "/licenses/{licenseSlug}/entitlements",
		Summary:     "Associate an entitlement with a license",
		Description: "Associate an entitlement with a license by providing the license slug and entitlement details",
		Tags:        []string{"licenses"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*struct{}, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		command := &Command{
			EntitlementSlug:                request.Body.EntitlementSlug,
			Value:                          request.Body.Value,
			LimitCapExceededOveragePercent: request.Body.LimitCapExceededOveragePercent,
		}

		err = app.AssociateEntitlement(ctx, cl, request.LicenseSlug, command)
		if err != nil {
			return nil, err
		}

		return nil, nil
	})
}

// RegisterWebhook declares the LicenseEntitlementAssigned webhook contract
// in the OpenAPI document.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       events.LicenseEntitlementAssigned,
		Data:        (*schema.LicenseEntitlement)(nil),
		OperationID: "onLicenseEntitlementAssigned",
		Summary:     "License Entitlement Assigned Webhook",
		Description: "Triggered when an entitlement is assigned to a license.",
		Tags:        []string{"webhooks", "licenses"},
	})
}
