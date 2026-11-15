package common

import (
	"context"
	"log/slog"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/featureflag"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/catalogue"
	entitlementschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
)

// KnownEntitlements lists what the organization actually has, and the shape
// each one reads in, so a targeting rule naming an entitlement that does not
// exist — or reading one the wrong way, `.limit` on a BOOLEAN — is refused at
// write time rather than discovered as a feature that is silently never
// enabled.
//
// Shared by every handler that lints or describes a rule: a rule is linted
// against the same catalogue whichever way it enters, and the reasoning below
// lives in one place rather than in copies free to drift apart.
func KnownEntitlements(ctx context.Context, entitlements catalogue.Port, orgID uuid.UUID) []featureflag.KnownEntitlement {
	declared, err := entitlements.List(ctx, orgID)
	if err != nil {
		// The catalogue is a nicety, not a gate: without it the rest of the
		// linting still runs. Refusing a valid flag because a read failed would
		// be the worse trade.
		slog.WarnContext(ctx, "feature flag: could not read the entitlement catalogue for linting",
			"organization_id", orgID, "error", err)
		return nil
	}

	known := make([]featureflag.KnownEntitlement, 0, len(declared))
	for _, entitlement := range declared {
		known = append(known, featureflag.KnownEntitlement{
			DeclaredType: string(entitlement.Type),
			Slug:         entitlement.Slug,
			Type:         entitlementType(entitlement.Type),
		})
	}

	return known
}

// entitlementType maps a declared type onto the shape it reads in. The whole
// NUMBER family reads as a quantity.
func entitlementType(t entitlementschema.Type) featureflag.EntitlementType {
	switch {
	case entitlementschema.IsNumberFamily(t):
		return featureflag.EntitlementNumber
	case t == entitlementschema.Boolean:
		return featureflag.EntitlementBoolean
	default:
		return featureflag.EntitlementConfig
	}
}
