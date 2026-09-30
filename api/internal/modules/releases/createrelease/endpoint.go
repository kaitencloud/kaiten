package createrelease

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

// Creator is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Creator interface {
	Create(ctx context.Context, cl caller.OrganizationCaller, cmd *Command) (*schema.Release, error)
}

type Request struct {
	Body schema.Release
}

type Response struct {
	Body *schema.Release
}

func RegisterEndpoint(api huma.API, app Creator) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "create-release",
		Method:        http.MethodPost,
		Path:          "/releases",
		Summary:       "Create a new release",
		Description:   "Create a new release with the provided details and link the requested components. A release is immutable: there is no update endpoint, and the component list cannot change afterwards. Correcting one means deleting it and creating a new one, which starts a new deployment history.",
		Tags:          []string{"releases"},
		DefaultStatus: http.StatusCreated,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		var slug *string
		if request.Body.Slug != "" {
			slug = &request.Body.Slug
		}
		command := &Command{
			Version:      request.Body.Version,
			Slug:         slug,
			Description:  request.Body.Description,
			ComponentIDs: request.Body.ComponentIDs,
		}

		release, err := app.Create(ctx, cl, command)
		if err != nil {
			return nil, err
		}
		return &Response{
			Body: release,
		}, nil
	})
}

// RegisterWebhook declares the ReleaseCreated webhook contract in the
// OpenAPI document.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       releaseEvents.ReleaseCreated,
		Data:        (*schema.Release)(nil),
		OperationID: "onReleaseCreated",
		Summary:     "Release Created Webhook",
		Description: "Triggered when a new release is created.",
		Tags:        []string{"webhooks", "releases"},
	})
}
