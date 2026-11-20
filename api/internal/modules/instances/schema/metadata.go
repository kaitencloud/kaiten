package schema

import (
	"context"

	"github.com/google/uuid"

	metadatafieldsdb "github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/validator"
)

// ValidateMetadata checks an instance's metadata against the organization's
// declared INSTANCE fields and returns the map to persist, which callers must
// assign: archived keys the payload omitted are merged back into it. INSTANCE
// is tolerant (additionalProperties: true): instance metadata is reported by
// the SaaS itself, so undeclared keys pass while declared ones are type-checked.
// stored is what the instance holds today, nil on create. Every writer of an
// instance's metadata goes through here; see the metadatafields README.
func ValidateMetadata(
	ctx context.Context, lister validator.MetadataFieldsLister, organizationID uuid.UUID,
	metadata, stored map[string]any,
) (map[string]any, error) {
	return validator.ValidateMetadataForResource(
		ctx, lister, organizationID,
		metadatafieldsdb.MetadataFieldResourceTypeINSTANCE,
		false, // tolerant
		metadata, stored,
	)
}
