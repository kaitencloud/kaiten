package unarchivemetadatafield

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

// Unarchiver is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Unarchiver interface {
	Unarchive(
		ctx context.Context, cl caller.OrganizationCaller, cmd *Command,
	) (*schema.MetadataField, error)
}

type Request struct {
	ID uuid.UUID `path:"id"`
}

type Response struct {
	Body *schema.MetadataField
}

func RegisterEndpoint(api huma.API, app Unarchiver) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "unarchive-metadata-field",
		Method:      http.MethodPost,
		Path:        "/metadata-fields/{id}/unarchive",
		Summary:     "Unarchive a metadata field",
		Description: "Restores a previously archived metadata field (clears its archived_at). The field re-enters the active schema composition. Returns 409 if an active field already uses the same key for this resource type, or 404 if the field does not exist or is not archived.",
		Tags:        []string{"metadataFields"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		field, err := app.Unarchive(ctx, cl, &Command{ID: request.ID})
		if err != nil {
			return nil, err
		}
		return &Response{Body: field}, nil
	})
}

// RegisterWebhook declares the MetadataFieldUnarchived webhook contract in
// the OpenAPI document.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       events.MetadataFieldUnarchived,
		Data:        (*schema.MetadataField)(nil),
		OperationID: "onMetadataFieldUnarchived",
		Summary:     "Metadata Field Unarchived Webhook",
		Description: "Triggered when an archived metadata field is restored to the active schema composition.",
		Tags:        []string{"webhooks", "metadataFields"},
	})
}
