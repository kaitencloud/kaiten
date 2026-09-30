package createmetadatafield

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Creator is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Creator interface {
	Create(
		ctx context.Context, cl caller.OrganizationCaller,
		cmd *CreateMetadataFieldInput,
	) (*schema.MetadataField, error)
}

type Request struct {
	Body schema.MetadataField
}

type Response struct {
	Body *schema.MetadataField
}

func RegisterEndpoint(api huma.API, app Creator) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "create-metadata-field",
		Method:        http.MethodPost,
		Path:          "/metadata-fields",
		Summary:       "Create a metadata field",
		Description:   "Declares a typed metadata field for a given resource type (DEPLOYMENT_ZONE, INSTANCE). The json_schema is validated against JSON Schema 2020-12 before insertion. Restricted to write:metadata_fields scope (admin-only policy).",
		Tags:          []string{"metadataFields"},
		DefaultStatus: http.StatusCreated,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		command := &CreateMetadataFieldInput{
			ResourceType: request.Body.ResourceType,
			Key:          request.Body.Key,
			Label:        request.Body.Label,
			JSONSchema:   request.Body.JSONSchema,
			DisplayOrder: request.Body.DisplayOrder,
		}

		field, err := app.Create(ctx, cl, command)
		if err != nil {
			return nil, err
		}
		return &Response{Body: field}, nil
	})
}

// RegisterWebhook declares the MetadataFieldCreated webhook contract in the
// OpenAPI document.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       events.MetadataFieldCreated,
		Data:        (*schema.MetadataField)(nil),
		OperationID: "onMetadataFieldCreated",
		Summary:     "Metadata Field Created Webhook",
		Description: "Triggered when a metadata field is declared for a resource type.",
		Tags:        []string{"webhooks", "metadataFields"},
	})
}
