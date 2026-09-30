package dryrunmetadatafield

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	deploymentzonedryrunlist "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/dryrunlist"
	instancedryrunlist "github.com/kaitencloud/kaiten/api/internal/modules/instances/dryrunlist"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/dbmap"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/schema"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// ResourceMetadata is the minimal projection the dry-run needs from a resource
// row: a display identity plus its raw metadata jsonb.
type ResourceMetadata struct {
	Name     string
	Slug     string
	Metadata []byte
}

type QueryRepository struct {
	queries              *db.Queries
	deploymentZoneLister *deploymentzonedryrunlist.Lister
	instanceLister       *instancedryrunlist.Lister
}

func NewQueryRepository(queries *db.Queries, deploymentZoneLister *deploymentzonedryrunlist.Lister, instanceLister *instancedryrunlist.Lister) *QueryRepository {
	return &QueryRepository{queries: queries, deploymentZoneLister: deploymentZoneLister, instanceLister: instanceLister}
}

func (r *QueryRepository) GetField(ctx context.Context, id, orgID uuid.UUID) (*schema.MetadataField, error) {
	row, err := r.queries.GetMetadataField(ctx, db.GetMetadataFieldParams{
		ID:             id,
		OrganizationID: orgID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.NotFound(
				"DryRunMetadataField.NotFound",
				fmt.Sprintf("metadata field %s not found", id),
			)
		}
		return nil, err
	}
	return dbmap.ToMetadataField(row)
}

// ListResourceMetadata loads the (name, slug, metadata) of every resource of
// the given type for the org. The dry-run reuses the existing resource list
// queries rather than a bespoke jsonb-filtered query: the computation moves
// off the client (the point of this endpoint) without adding a new sqlc
// query. A future optimization could push a `jsonb_exists(metadata, key)`
// filter into SQL to skip rows that don't carry the key at all.
func (r *QueryRepository) ListResourceMetadata(
	ctx context.Context,
	resourceType db.MetadataFieldResourceType,
	orgID uuid.UUID,
) ([]ResourceMetadata, error) {
	switch resourceType {
	case db.MetadataFieldResourceTypeDEPLOYMENTZONE:
		entries, err := r.deploymentZoneLister.List(ctx, orgID)
		if err != nil {
			return nil, err
		}
		out := make([]ResourceMetadata, 0, len(entries))
		for _, entry := range entries {
			out = append(out, ResourceMetadata{Name: entry.Name, Slug: entry.Slug, Metadata: entry.Metadata})
		}
		return out, nil
	case db.MetadataFieldResourceTypeINSTANCE:
		entries, err := r.instanceLister.List(ctx, orgID)
		if err != nil {
			return nil, err
		}
		out := make([]ResourceMetadata, 0, len(entries))
		for _, entry := range entries {
			out = append(out, ResourceMetadata{Name: entry.Name, Slug: entry.Slug, Metadata: entry.Metadata})
		}
		return out, nil
	default:
		return nil, fmt.Errorf("dry-run: unsupported resource type %q", resourceType)
	}
}
