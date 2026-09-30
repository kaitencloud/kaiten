package updatemetadatafield

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Updater is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Updater interface {
	Update(
		ctx context.Context, cl caller.OrganizationCaller,
		cmd *UpdateMetadataFieldInput,
	) (*schema.MetadataField, error)
}

type Request struct {
	ID   uuid.UUID `path:"id"`
	Body schema.MetadataField
}

type Response struct {
	Body *schema.MetadataField
}

func RegisterEndpoint(api huma.API, app Updater) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "update-metadata-field",
		Method:      http.MethodPatch,
		Path:        "/metadata-fields/{id}",
		Summary:     "Update a metadata field",
		Description: "Updates label and json_schema. `key` and `resourceType` are immutable, and `displayOrder` belongs to POST /metadata-fields/reorder. The new json_schema is validated against JSON Schema 2020-12 and the transition rules: type changes, cardinality changes, and free-string ↔ enum toggles are rejected with 422.",
		Tags:        []string{"metadataFields"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		command := &UpdateMetadataFieldInput{
			ID:           request.ID,
			Label:        request.Body.Label,
			JSONSchema:   request.Body.JSONSchema,
			ResourceType: request.Body.ResourceType,
			Key:          request.Body.Key,
			DisplayOrder: request.Body.DisplayOrder,
		}
		field, err := app.Update(ctx, cl, command)
		if err != nil {
			return nil, err
		}
		return &Response{Body: field}, nil
	})
}

// RegisterWebhook declares the MetadataFieldUpdated webhook contract in the
// OpenAPI document.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       events.MetadataFieldUpdated,
		Data:        (*schema.MetadataField)(nil),
		OperationID: "onMetadataFieldUpdated",
		Summary:     "Metadata Field Updated Webhook",
		Description: "Triggered when a metadata field's label or JSON schema changes. A reordering emits METADATA_FIELD_REORDERED instead.",
		Tags:        []string{"webhooks", "metadataFields"},
	})
}
