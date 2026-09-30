package seedkit

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
	"github.com/kaitencloud/kaiten/api/internal/seeder"
	pgerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// SeedFeatureFlags creates the given flags, and CONVERGES the ones already
// there onto the definition passed in.
func SeedFeatureFlags(ctx context.Context, sc *seeder.SeederContext, flags []schema.FeatureFlag, ignoreUnique bool) error {
	for i := range flags {
		flag := flags[i]
		if _, err := sc.FeatureFlags.CreateFeatureFlag.Execute(ctx, &flag); err != nil {
			// Both shapes mean "already there": a raw Postgres unique violation
			// and the domain conflict the create handler returns instead. Testing
			// only the first is why convergence silently never ran.
			if ignoreUnique && (pgerrors.IsUniqueViolation(err) || pgerrors.IsConflict(err)) {
				if err := updateFeatureFlagDefinition(ctx, sc, &flag); err != nil {
					return err
				}
				continue
			}
			return fmt.Errorf("create feature flag %q: %w", flag.Slug, err)
		}
	}
	return nil
}

func updateFeatureFlagDefinition(
	ctx context.Context,
	sc *seeder.SeederContext,
	flag *schema.FeatureFlag,
) error {
	variants, err := json.Marshal(flag.Variants)
	if err != nil {
		return fmt.Errorf("encode variants for %q: %w", flag.Slug, err)
	}
	defaultVariant, err := json.Marshal(flag.DefaultVariant)
	if err != nil {
		return fmt.Errorf("encode default variant for %q: %w", flag.Slug, err)
	}
	// A nil slice must reach the column as SQL NULL, not as the string "null":
	// the evaluator reads no rules from NULL, and "null" would decode to a rule
	// set of one broken entry.
	var targetingRules any
	if len(flag.Targetings) > 0 {
		encoded, err := json.Marshal(flag.Targetings)
		if err != nil {
			return fmt.Errorf("encode targeting rules for %q: %w", flag.Slug, err)
		}
		targetingRules = string(encoded)
	}

	if err := sc.Exec(
		ctx, `
		UPDATE feature_flags
		   SET enabled         = $1,
		       variants        = $2::jsonb,
		       targeting_rules = $3::jsonb,
		       default_variant = $4::jsonb,
		       name            = $5,
		       description     = $6
		 WHERE slug            = $7
		   AND organization_id = $8
	`, flag.Enabled, string(variants), targetingRules, string(defaultVariant),
		flag.Name, flag.Description, flag.Slug, sc.OrganizationID,
	); err != nil {
		return fmt.Errorf("converge feature flag %q: %w", flag.Slug, err)
	}

	return nil
}
