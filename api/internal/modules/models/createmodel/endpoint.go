package createmodel

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

type Creator interface {
	Create(ctx context.Context, cl caller.OrganizationCaller, cmd *Command) (*schema.Model, error)
}

type Request struct {
	Body schema.Model
}

type Response struct{ Body *schema.Model }

func RegisterEndpoint(api huma.API, app Creator) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "createModel", Method: http.MethodPost, Path: "/models",
		Summary: "Create a model", Tags: []string{"models"},
		DefaultStatus: http.StatusCreated,
		Errors:        []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		model, err := app.Create(ctx, cl, &request.Body)
		if err != nil {
			return nil, err
		}
		return &Response{Body: model}, nil
	})
}

func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{Event: events.ModelCreated, Data: (*schema.Model)(nil), OperationID: "onModelCreated", Summary: "Model Created Webhook", Description: "Triggered when a catalogue model is created.", Tags: []string{"webhooks", "models"}})
}
