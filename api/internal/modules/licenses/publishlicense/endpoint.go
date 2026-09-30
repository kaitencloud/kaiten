package publishlicense

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

// Publisher is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Publisher interface {
	Publish(ctx context.Context, cl caller.OrganizationCaller, slug string) (*schema.License, error)
}

type Request struct {
	LicenseSlug string `path:"licenseSlug" doc:"License version slug" example:"enterprise-license-v2"`
}

type Response struct {
	Body *schema.License
}

func RegisterEndpoint(api huma.API, app Publisher) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "publish-license",
		Method:      http.MethodPost,
		Path:        "/licenses/{licenseSlug}/publish",
		Summary:     "Publish a license version",
		Description: "Puts a DRAFT license version on sale: it becomes PUBLISHED, so it can be made its family's default, and its family resolves to it when the family has no default and this is its highest published version. Only a draft can be published (409 PublishLicense.NotADraft); an archived version goes back on sale with unarchive-license. Emits LICENSE_PUBLISHED.",
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

		license, err := app.Publish(ctx, cl, request.LicenseSlug)
		if err != nil {
			return nil, err
		}

		return &Response{Body: license}, nil
	})
}

// RegisterWebhook declares the LicensePublished webhook contract in the OpenAPI
// document.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       events.LicensePublished,
		Data:        (*schema.License)(nil),
		OperationID: "onLicensePublished",
		Summary:     "License Published Webhook",
		Description: "Triggered when a draft license version is published and goes on sale.",
		Tags:        []string{"webhooks", "licenses"},
	})
}
