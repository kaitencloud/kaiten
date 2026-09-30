package reordermetadatafields

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/events"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Reorderer is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Reorderer interface {
	Reorder(
		ctx context.Context, cl caller.OrganizationCaller,
		cmd *ReorderMetadataFieldsInput,
	) error
}

type Request struct {
	Body ReorderMetadataFieldsInput
}

func RegisterEndpoint(api huma.API, app Reorderer) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "reorder-metadata-fields",
		Method:        http.MethodPost,
		Path:          "/metadata-fields/reorder",
		Summary:       "Reorder metadata fields",
		Description:   "Sets the displayOrder of the listed fields to their position in the array (0-indexed). All ids must belong to the same organization, resource type, and be non-archived; the entire reorder is applied in a single transaction.",
		Tags:          []string{"metadataFields"},
		DefaultStatus: http.StatusNoContent,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*struct{}, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		if err := app.Reorder(ctx, cl, &request.Body); err != nil {
			return nil, err
		}
		return nil, nil
	})
}

// RegisterWebhook declares the MetadataFieldReordered webhook contract in
// the OpenAPI document.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       events.MetadataFieldReordered,
		Data:        (*MetadataFieldReordered)(nil),
		OperationID: "onMetadataFieldReordered",
		Summary:     "Metadata Fields Reordered Webhook",
		Description: "Triggered when the display order of a resource type's metadata fields is rewritten.",
		Tags:        []string{"webhooks", "metadataFields"},
	})
}
