package archivemetadatafield

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

// Archiver is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Archiver interface {
	Archive(
		ctx context.Context, cl caller.OrganizationCaller, cmd *Command,
	) (*schema.MetadataField, error)
}

type Request struct {
	ID uuid.UUID `path:"id"`
}

type Response struct {
	Body *schema.MetadataField
}

func RegisterEndpoint(api huma.API, app Archiver) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "archive-metadata-field",
		Method:      http.MethodPost,
		Path:        "/metadata-fields/{id}/archive",
		Summary:     "Archive a metadata field",
		Description: "Soft-deletes a metadata field. The row stays in the DB (its archived_at is set) so historic metadata is still interpretable; the field stops appearing in the active schema composition.",
		Tags:        []string{"metadataFields"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		field, err := app.Archive(ctx, cl, &Command{ID: request.ID})
		if err != nil {
			return nil, err
		}
		return &Response{Body: field}, nil
	})
}

// RegisterWebhook declares the MetadataFieldArchived webhook contract in
// the OpenAPI document.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       events.MetadataFieldArchived,
		Data:        (*schema.MetadataField)(nil),
		OperationID: "onMetadataFieldArchived",
		Summary:     "Metadata Field Archived Webhook",
		Description: "Triggered when a metadata field is archived and leaves the active schema composition.",
		Tags:        []string{"webhooks", "metadataFields"},
	})
}
