package common

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
	"strings"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/featureflag"
	deploymentzonecatalogue "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/catalogue"
	entitlementcatalogue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/catalogue"
	entitlementschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	licensecatalogue "github.com/kaitencloud/kaiten/api/internal/modules/licenses/catalogue"
)

// Catalogue reads what the organization actually has, through the read port of
// each module that owns it, so a targeting rule naming something that does not
// exist is refused at write time rather than discovered as a feature that is
// silently never enabled, and the editor can offer what does exist.
//
// Shared by every handler that lints or describes a rule: a rule is linted
// against the same catalogue whichever way it enters, and the reasoning below
// lives in one place rather than in copies free to drift apart.
type Catalogue struct {
	Entitlements    entitlementcatalogue.Port
	Licenses        licensecatalogue.Port
	DeploymentZones deploymentzonecatalogue.Port
}

// Read lists the entitlements the organization declares, with the shape each
// reads in — a rule reading one the wrong way, `.limit` on a BOOLEAN, is
// refused too — and its plans, license versions and deployment zones.
//
// Each part is read on its own. A read that fails leaves that part nil, which
// the lint and the schema both read as "unknown" and the rest of the linting
// goes on without: the catalogue is a nicety, not a gate, and refusing a valid
// flag because a read failed would be the worse trade.
func (c Catalogue) Read(ctx context.Context, orgID uuid.UUID) featureflag.TargetingCatalogue {
	var known featureflag.TargetingCatalogue

	known.Entitlements = c.entitlements(ctx, orgID)

	if licenses, err := c.Licenses.List(ctx, orgID); err != nil {
		warn(ctx, orgID, "plans and license versions", err)
	} else {
		known.Plans = plans(licenses.Plans)
		known.Licenses = versions(licenses.Versions)
	}

	if zones, err := c.DeploymentZones.List(ctx, orgID); err != nil {
		warn(ctx, orgID, "deployment zones", err)
	} else {
		known.DeploymentZones = deploymentZones(zones)
	}

	return known
}

func warn(ctx context.Context, orgID uuid.UUID, what string, err error) {
	slog.WarnContext(ctx, "feature flag: could not read the catalogue for linting",
		"what", what, "organization_id", orgID, "error", err)
}

func (c Catalogue) entitlements(ctx context.Context, orgID uuid.UUID) []featureflag.KnownEntitlement {
	declared, err := c.Entitlements.List(ctx, orgID)
	if err != nil {
		warn(ctx, orgID, "entitlements", err)
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

// plans offers each family under its slug, named by the version it serves.
func plans(families []licensecatalogue.Plan) []featureflag.TargetingKnownValue {
	values := make([]featureflag.TargetingKnownValue, 0, len(families))
	for _, family := range families {
		values = append(values, featureflag.TargetingKnownValue{Value: family.Slug, Label: family.Name})
	}

	return values
}

// versions offers every license version, archived ones included, under its own
// slug with the version number and state an author needs to tell two of the
// same plan apart.
func versions(all []licensecatalogue.Version) []featureflag.TargetingKnownValue {
	values := make([]featureflag.TargetingKnownValue, 0, len(all))
	for _, version := range all {
		values = append(values, featureflag.TargetingKnownValue{
			Value:       version.Slug,
			Label:       version.Name,
			Description: fmt.Sprintf("Version %d, %s", version.Number, strings.ToLower(string(version.State))),
		})
	}

	return values
}

func deploymentZones(zones []deploymentzonecatalogue.Zone) []featureflag.TargetingKnownValue {
	values := make([]featureflag.TargetingKnownValue, 0, len(zones))
	for _, zone := range zones {
		values = append(values, featureflag.TargetingKnownValue{Value: zone.Slug, Label: zone.Name})
	}
	sort.Slice(values, func(i, j int) bool { return values[i].Value < values[j].Value })

	return values
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
