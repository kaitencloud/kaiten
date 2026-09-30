package dryrunmetadatafield

import (
	"context"
	"encoding/json"

	deploymentzonedryrunlist "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/dryrunlist"
	instancedryrunlist "github.com/kaitencloud/kaiten/api/internal/modules/instances/dryrunlist"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/validator"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
)

const maxSamples = 5

// Deps lists exactly what this handler needs, instead of the full
// services.Container. DeploymentZoneLister and InstanceLister are each the
// owning module's own public read port -- this handler never imports
// either module's generated db package directly.
type Deps struct {
	UserProvider         currentuser.Provider
	Queries              *db.Queries
	DeploymentZoneLister *deploymentzonedryrunlist.Lister
	InstanceLister       *instancedryrunlist.Lister
}

type UseCase struct {
	deps       Deps
	repository *QueryRepository
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{
		deps:       deps,
		repository: NewQueryRepository(deps.Queries, deps.DeploymentZoneLister, deps.InstanceLister),
	}
}

// Execute computes the impact of applying command.JSONSchema to the field
// identified by command.ID: it counts (and samples) the resources whose stored
// value under the field's key would no longer satisfy the candidate schema.
//
// This is the server-side equivalent of the former client-side dry-run, which
// pulled every resource's metadata over GraphQL. The client now sends only the
// candidate schema and receives the aggregated impact.
func (h *UseCase) Execute(ctx context.Context, command *Command) (*Impact, error) {
	u, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	field, err := h.repository.GetField(ctx, command.ID, u.OrganizationID)
	if err != nil {
		return nil, err
	}

	schemaBytes, err := json.Marshal(command.JSONSchema)
	if err != nil {
		return nil, err
	}
	// Reject a malformed candidate schema up front (422) — same gate as
	// POST/PATCH — so the preview can't silently mislead with a broken schema.
	if err := validator.ValidateSchemaShape(schemaBytes); err != nil {
		return nil, err
	}
	valueValidator, err := validator.CompileValueValidator(schemaBytes)
	if err != nil {
		return nil, err
	}

	resources, err := h.repository.ListResourceMetadata(ctx, field.ResourceType, u.OrganizationID)
	if err != nil {
		return nil, err
	}

	impact := &Impact{Samples: make([]ImpactSample, 0, maxSamples)}
	for _, resource := range resources {
		if len(resource.Metadata) == 0 {
			continue
		}
		var metadata map[string]any
		if err := json.Unmarshal(resource.Metadata, &metadata); err != nil {
			// Non-object / corrupted jsonb — skip rather than fail the whole
			// preview over one bad row.
			continue
		}
		value, present := metadata[field.Key]
		if !present {
			continue
		}
		if valueValidator.Valid(value) {
			continue
		}
		impact.Count++
		if len(impact.Samples) < maxSamples {
			impact.Samples = append(impact.Samples, ImpactSample{Name: resource.Name, Slug: resource.Slug})
		}
	}
	return impact, nil
}
