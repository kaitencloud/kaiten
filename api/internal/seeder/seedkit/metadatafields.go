package seedkit

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"

	metadatafieldsdb "github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/seeder"
)

// SeedMetadataFields inserts typed metadata fields via the raw query (the
// metadata-field use case is intentionally bypassed here, as both full and
// sample do, because seeding pins an explicit UserID). Accepts multiple groups so
// callers can pass deployment-zone and instance field sets in one call.
func SeedMetadataFields(ctx context.Context, sc *seeder.SeederContext, orgID, userID uuid.UUID, groups ...[]MetadataFieldDef) error {
	for _, fields := range groups {
		for _, f := range fields {
			jsonSchema, err := json.Marshal(f.JSONSchema)
			if err != nil {
				return fmt.Errorf("marshal json_schema for metadata_field %q: %w", f.Key, err)
			}
			if _, err := metadatafieldsdb.New(sc.Pool()).InsertMetadataField(ctx, metadatafieldsdb.InsertMetadataFieldParams{
				OrganizationID: orgID,
				ResourceType:   f.ResourceType,
				Key:            f.Key,
				Label:          f.Label,
				JsonSchema:     jsonSchema,
				DisplayOrder:   f.DisplayOrder,
				UserID:         userID,
			}); err != nil {
				return fmt.Errorf("insert metadata_field %q: %w", f.Key, err)
			}
		}
	}
	return nil
}
