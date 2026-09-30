package unarchivelicense

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

// Unarchiver is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Unarchiver interface {
	Unarchive(ctx context.Context, cl caller.OrganizationCaller, slug string) (*schema.License, error)
}

type Request struct {
	LicenseSlug string `path:"licenseSlug" doc:"License version slug" example:"enterprise-license-v2"`
}

type Response struct {
	Body *schema.License
}

func RegisterEndpoint(api huma.API, app Unarchiver) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "unarchive-license",
		Method:      http.MethodPost,
		Path:        "/licenses/{licenseSlug}/unarchive",
		Summary:     "Unarchive a license version",
		Description: "Puts an ARCHIVED license version back on sale: it is PUBLISHED again, can be assigned to instances, and can be what its family resolves to. Only an archived version can be unarchived (409 UnarchiveLicense.NotArchived). Emits LICENSE_UNARCHIVED.",
		Tags:        []string{"licenses"},
		// The errors are raised by lifecycletransition, which checkapierrors
		// does not follow, so the list is kept complete by hand: 404 for a
		// missing version, 409 for one in another state.
		Errors: []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		license, err := app.Unarchive(ctx, cl, request.LicenseSlug)
		if err != nil {
			return nil, err
		}

		return &Response{Body: license}, nil
	})
}

// RegisterWebhook declares the LicenseUnarchived webhook contract in the OpenAPI
// document.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       events.LicenseUnarchived,
		Data:        (*schema.License)(nil),
		OperationID: "onLicenseUnarchived",
		Summary:     "License Unarchived Webhook",
		Description: "Triggered when an archived license version is put back on sale.",
		Tags:        []string{"webhooks", "licenses"},
	})
}
