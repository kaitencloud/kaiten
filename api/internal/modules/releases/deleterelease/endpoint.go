package deleterelease

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	releaseEvents "github.com/kaitencloud/kaiten/api/internal/modules/releases/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Deleter is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Deleter interface {
	Delete(ctx context.Context, cl caller.OrganizationCaller, slug string) error
}

type Request struct {
	ReleaseSlug string `path:"releaseSlug" doc:"Release slug" example:"release-slug"`
}

func RegisterEndpoint(api huma.API, app Deleter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "delete-release",
		Method:      http.MethodDelete,
		Path:        "/releases/{releaseSlug}",
		Summary:     "Delete a release",
		Description: "Delete a release by their slug. Since a release is immutable, this plus a fresh create is the only way to change one -- and it discards the deployment history recorded against the old release. A release still deployed to a zone cannot be deleted (409).",
		Tags:        []string{"releases"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*struct{}, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		if err := app.Delete(ctx, cl, request.ReleaseSlug); err != nil {
			return nil, err
		}
		return nil, nil
	})
}

// RegisterWebhook declares the ReleaseDeleted webhook contract in the
// OpenAPI document.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       releaseEvents.ReleaseDeleted,
		Data:        (*schema.Release)(nil),
		OperationID: "onReleaseDeleted",
		Summary:     "Release Deleted Webhook",
		Description: "Triggered when a release is deleted.",
		Tags:        []string{"webhooks", "releases"},
	})
}
