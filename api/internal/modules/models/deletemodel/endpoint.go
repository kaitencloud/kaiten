package deletemodel

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

type Deleter interface {
	Delete(ctx context.Context, cl caller.OrganizationCaller, slug string) error
}

type Request struct {
	ModelSlug string `path:"modelSlug"`
}

func RegisterEndpoint(api huma.API, app Deleter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "deleteModel", Method: http.MethodDelete, Path: "/models/{modelSlug}",
		Summary: "Delete a model", Tags: []string{"models"},
		DefaultStatus: http.StatusNoContent,
		Errors:        []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*struct{}, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		if err := app.Delete(ctx, cl, request.ModelSlug); err != nil {
			return nil, err
		}
		return nil, nil
	})
}

func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{Event: events.ModelDeleted, Data: (*schema.Model)(nil), OperationID: "onModelDeleted", Summary: "Model Deleted Webhook", Description: "Triggered when a catalogue model is deleted.", Tags: []string{"webhooks", "models"}})
}
