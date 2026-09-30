package common

import (
	"context"
	"log/slog"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/catalogue"
)

// EntitlementSlugs lists what the organization actually has, so a targeting rule
// naming an entitlement that does not exist is refused at write time rather than
// discovered as a feature that is silently never enabled.
//
// Shared by createfeatureflag and updatefeatureflag: a rule is linted against
// the same catalogue whichever way it enters, and the reasoning below lives in
// one place rather than in two copies free to drift apart.
func EntitlementSlugs(ctx context.Context, entitlements catalogue.Port, orgID uuid.UUID) []string {
	slugs, err := entitlements.ListSlugs(ctx, orgID)
	if err != nil {
		// The catalogue is a nicety, not a gate: without it the rest of the
		// linting still runs. Refusing a valid flag because a read failed would
		// be the worse trade.
		slog.WarnContext(ctx, "feature flag: could not read the entitlement catalogue for linting",
			"organization_id", orgID, "error", err)
		return nil
	}

	return slugs
}
