package updatemodel

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

type Updater interface {
	Update(ctx context.Context, cl caller.OrganizationCaller, slug string, cmd *Command) (*schema.Model, error)
}

type Request struct {
	ModelSlug string `path:"modelSlug"`
	Body      schema.Model
}

type Response struct{ Body *schema.Model }

func RegisterEndpoint(api huma.API, app Updater) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "updateModel", Method: http.MethodPut, Path: "/models/{modelSlug}",
		Summary: "Update a model", Tags: []string{"models"},
		Errors: []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		model, err := app.Update(ctx, cl, request.ModelSlug, &request.Body)
		if err != nil {
			return nil, err
		}
		return &Response{Body: model}, nil
	})
}

func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{Event: events.ModelUpdated, Data: (*schema.ModelUpdated)(nil), OperationID: "onModelUpdated", Summary: "Model Updated Webhook", Description: "Triggered when a catalogue model is updated.", Tags: []string{"webhooks", "models"}})
}
