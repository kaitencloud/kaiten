package deletelicense

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
	Delete(ctx context.Context, cl caller.OrganizationCaller, slug string) error
}

type Request struct {
	LicenseSlug string `path:"licenseSlug" doc:"License slug" example:"license-slug"`
}

func RegisterEndpoint(api huma.API, app Deleter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "delete-license",
		Method:      http.MethodDelete,
		Path:        "/licenses/{licenseSlug}",
		Summary:     "Delete a license",
		Description: "Delete a license with the provided details. Deleting the last version of a license family also deletes the family, and frees its slug for a new product to take. A deleted version's number is not reused by the next version of its family.",
		Tags:        []string{"licenses"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*struct{}, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		if err := app.Delete(ctx, cl, request.LicenseSlug); err != nil {
			return nil, err
		}

		return nil, nil
	})
}

// RegisterWebhook declares the LicenseDeleted webhook contract in the
// OpenAPI document.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       events.LicenseDeleted,
		Data:        (*schema.License)(nil),
		OperationID: "onLicenseDeleted",
		Summary:     "License Deleted Webhook",
		Description: "Triggered when a license is deleted.",
		Tags:        []string{"webhooks", "licenses"},
	})
}
