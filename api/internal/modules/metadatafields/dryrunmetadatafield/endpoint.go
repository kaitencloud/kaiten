package dryrunmetadatafield

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// DryRunner is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type DryRunner interface {
	DryRun(
		ctx context.Context, cl caller.OrganizationCaller, cmd *Command,
	) (*Impact, error)
}

// MetadataFieldSchemaProposal is the candidate schema a dry-run evaluates
// existing values against. It is a named type rather than an anonymous struct
// because Huma derives a component name from the Go type: left anonymous, this
// published as `RequestBody` — the HTTP concept, not the domain one.
type MetadataFieldSchemaProposal struct {
	JSONSchema map[string]any `json:"jsonSchema" doc:"Candidate JSON Schema 2020-12 document to evaluate existing values against."`
}

type Request struct {
	ID   uuid.UUID `path:"id"`
	Body MetadataFieldSchemaProposal
}

type Response struct {
	Body *Impact
}

func RegisterEndpoint(api huma.API, app DryRunner) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "dry-run-metadata-field",
		Method:      http.MethodPost,
		Path:        "/metadata-fields/{id}/dry-run",
		Summary:     "Preview the impact of a metadata field schema change",
		Description: "Computes, server-side, how many existing resources of this field's resource type carry a value under this field's key that would NOT satisfy the supplied candidate JSON Schema, plus a small sample. Read-only — does not mutate the field. Replaces the former client-side dry-run that pulled every resource's metadata.",
		Tags:        []string{"metadataFields"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		impact, err := app.DryRun(ctx, cl, &Command{
			ID:         request.ID,
			JSONSchema: request.Body.JSONSchema,
		})
		if err != nil {
			return nil, err
		}
		return &Response{Body: impact}, nil
	})
}
