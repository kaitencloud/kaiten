package archivelicense

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

// Archiver is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Archiver interface {
	Archive(ctx context.Context, cl caller.OrganizationCaller, slug string) (*schema.License, error)
}

type Request struct {
	LicenseSlug string `path:"licenseSlug" doc:"License version slug" example:"enterprise-license-v2"`
}

type Response struct {
	Body *schema.License
}

func RegisterEndpoint(api huma.API, app Archiver) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "archive-license",
		Method:      http.MethodPost,
		Path:        "/licenses/{licenseSlug}/archive",
		Summary:     "Archive a license version",
		Description: "Withdraws a PUBLISHED license version from sale: its family stops resolving to it and no instance can be assigned to it any more, while instances already on it keep it. Only a published version can be archived (409 ArchiveLicense.NotPublished) -- a draft that was never on sale is deleted instead -- and not while it is its family's default (409 ArchiveLicense.DefaultMustBePublished): make another version the default, or unset it, first. Emits LICENSE_ARCHIVED.",
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

		license, err := app.Archive(ctx, cl, request.LicenseSlug)
		if err != nil {
			return nil, err
		}

		return &Response{Body: license}, nil
	})
}

// RegisterWebhook declares the LicenseArchived webhook contract in the OpenAPI
// document.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       events.LicenseArchived,
		Data:        (*schema.License)(nil),
		OperationID: "onLicenseArchived",
		Summary:     "License Archived Webhook",
		Description: "Triggered when a published license version is archived and withdrawn from sale.",
		Tags:        []string{"webhooks", "licenses"},
	})
}
