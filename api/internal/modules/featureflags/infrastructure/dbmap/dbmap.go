// Package dbmap translates between the featureflags module's sqlc row types and
// its schema DTOs.
//
// It exists so the translation has a home that is allowed to know both, and
// schema does not. A wire type that imports infrastructure/db inverts the
// dependency the schema package is for: the DTO is what the contract promises
// and the row is what storage happens to hold today, so a schema package that
// names a generated type makes every regeneration a potential contract change.
// The mapping still has to name both -- that is what mapping is -- so it lives
// here, under infrastructure/, where naming a row type is the point rather than
// a leak.
//
// Direction: dbmap imports db and schema; neither imports dbmap. Repositories
// are the callers, which is where a row already exists.
package dbmap

import (
	"encoding/json"
	"fmt"

	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
)

// ToFeatureFlag converts a feature_flag row into the DTO the API returns.
//
// Four of the row's columns are jsonb, so this is the one place the stored
// bytes are given their declared shape. An unmarshal failure means the row
// disagrees with the type this build expects, which is a corrupt row rather
// than bad input -- hence a plain error the caller can log and abort on.
func ToFeatureFlag(sqlcFlag db.FeatureFlag) (*schema.FeatureFlag, error) {
	var variants []schema.Variant
	if err := json.Unmarshal(sqlcFlag.Variants, &variants); err != nil {
		return nil, fmt.Errorf("failed to unmarshal variants: %w", err)
	}

	var targetings schema.Targetings
	if err := json.Unmarshal(sqlcFlag.TargetingRules, &targetings); err != nil {
		return nil, fmt.Errorf("failed to unmarshal targeting rules: %w", err)
	}

	var metadata map[string]any
	if err := json.Unmarshal(sqlcFlag.Metadata, &metadata); err != nil {
		return nil, fmt.Errorf("failed to unmarshal metadata: %w", err)
	}
	// The contract declares metadata a required object, but rows written before
	// MetadataColumn hold the JSON null (every flag of the demo seed), which
	// json.Unmarshal turns into a nil map and the response back into null.
	if metadata == nil {
		metadata = map[string]any{}
	}

	var defaultVariant schema.DefaultVariant
	if err := json.Unmarshal(sqlcFlag.DefaultVariant, &defaultVariant); err != nil {
		return nil, fmt.Errorf("failed to unmarshal default variant: %w", err)
	}

	return &schema.FeatureFlag{
		ID:             sqlcFlag.ID,
		Type:           sqlcFlag.Type,
		Variants:       variants,
		Targetings:     targetings,
		Name:           sqlcFlag.Name,
		Description:    sqlcFlag.Description,
		Slug:           sqlcFlag.Slug,
		Metadata:       metadata,
		Enabled:        sqlcFlag.Enabled,
		EventName:      sqlcFlag.EventName,
		DefaultVariant: &defaultVariant,
	}, nil
}

// MetadataColumn encodes a flag's metadata for the jsonb column the create and
// update repositories write. A nil map is stored as {} rather than the null
// json.Marshal makes of it. HTTP input always carries an object, since the
// schema requires one, but in-process callers such as the seeder build flags
// with no metadata at all.
func MetadataColumn(metadata map[string]any) ([]byte, error) {
	if metadata == nil {
		return []byte(`{}`), nil
	}
	return json.Marshal(metadata)
}
