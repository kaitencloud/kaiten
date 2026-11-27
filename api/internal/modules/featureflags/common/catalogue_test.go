package common_test

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/featureflag"
	deploymentzonecatalogue "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/catalogue"
	entitlementcatalogue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/catalogue"
	entitlementschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/common"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	licensecatalogue "github.com/kaitencloud/kaiten/api/internal/modules/licenses/catalogue"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
)

type entitlementPort struct {
	list []entitlementcatalogue.Entitlement
	err  error
}

func (p entitlementPort) List(context.Context, uuid.UUID) ([]entitlementcatalogue.Entitlement, error) {
	return p.list, p.err
}

type licensePort struct {
	catalogue licensecatalogue.Catalogue
	err       error
}

func (p licensePort) List(context.Context, uuid.UUID) (licensecatalogue.Catalogue, error) {
	return p.catalogue, p.err
}

type zonePort struct {
	list []deploymentzonecatalogue.Zone
	err  error
}

func (p zonePort) List(context.Context, uuid.UUID) ([]deploymentzonecatalogue.Zone, error) {
	return p.list, p.err
}

func TestReadFillsEveryPartOfTheCatalogue(t *testing.T) {
	t.Parallel()

	known := common.Catalogue{
		Entitlements: entitlementPort{list: []entitlementcatalogue.Entitlement{
			{Slug: "seats", Type: entitlementschema.Type("NUMBER")},
			{Slug: "sso", Type: entitlementschema.Boolean},
		}},
		Licenses: licensePort{catalogue: licensecatalogue.Catalogue{
			Plans: []licensecatalogue.Plan{{Slug: "bronze", Name: "Bronze"}},
			Versions: []licensecatalogue.Version{
				{Slug: "bronze-v1", Name: "Bronze", Number: 1, State: licenseschema.Archived},
				{Slug: "bronze-v2", Name: "Bronze", Number: 2, State: licenseschema.Published},
			},
		}},
		DeploymentZones: zonePort{list: []deploymentzonecatalogue.Zone{
			{Slug: "eu", Name: "Europe"},
			{Slug: "apac", Name: "Asia-Pacific"},
		}},
	}.Read(t.Context(), uuid.New())

	require.Len(t, known.Entitlements, 2)
	assert.Equal(t, featureflag.EntitlementBoolean, known.Entitlements[1].Type)

	assert.Equal(t, []featureflag.TargetingKnownValue{{Value: "bronze", Label: "Bronze"}}, known.Plans)

	// Every version is offered, the archived one included, each saying which
	// version of its plan it is.
	assert.Equal(t, []featureflag.TargetingKnownValue{
		{Value: "bronze-v1", Label: "Bronze", Description: "Version 1, archived"},
		{Value: "bronze-v2", Label: "Bronze", Description: "Version 2, published"},
	}, known.Licenses)

	assert.Equal(t, []featureflag.TargetingKnownValue{
		{Value: "apac", Label: "Asia-Pacific"},
		{Value: "eu", Label: "Europe"},
	}, known.DeploymentZones)
}

// A read that fails leaves its part nil — unknown, which skips that check and
// offers nothing — and never takes the others down with it.
func TestReadLeavesAFailedPartNil(t *testing.T) {
	t.Parallel()

	failure := errors.New("database is down")

	known := common.Catalogue{
		Entitlements:    entitlementPort{err: failure},
		Licenses:        licensePort{err: failure},
		DeploymentZones: zonePort{list: []deploymentzonecatalogue.Zone{{Slug: "eu", Name: "Europe"}}},
	}.Read(t.Context(), uuid.New())

	assert.Nil(t, known.Entitlements)
	assert.Nil(t, known.Plans)
	assert.Nil(t, known.Licenses)
	assert.Equal(t, []featureflag.TargetingKnownValue{{Value: "eu", Label: "Europe"}}, known.DeploymentZones)
}

// An organization with nothing yet is not an organization that is unknown: the
// lists are empty, not nil, so a rule naming a plan is refused rather than
// waved through.
func TestReadKeepsAnEmptyOrganizationEmptyRatherThanUnknown(t *testing.T) {
	t.Parallel()

	known := common.Catalogue{
		Entitlements:    entitlementPort{},
		Licenses:        licensePort{},
		DeploymentZones: zonePort{},
	}.Read(t.Context(), uuid.New())

	assert.NotNil(t, known.Plans)
	assert.NotNil(t, known.Licenses)
	assert.NotNil(t, known.DeploymentZones)
	assert.Error(t, featureflag.LintTargetingRule("__kaiten.license.familySlug == 'bronze'", known))
}

// The closed enums the lint checks are declared in the featureflag package,
// which cannot import the modules that own them. This pins each list to its
// owner, so a state added there fails here instead of being refused by the lint
// in a rule that is perfectly valid.
func TestClosedEnumsMatchTheirOwningModules(t *testing.T) {
	t.Parallel()

	facts := factsRoot(t)

	assert.ElementsMatch(t,
		[]string{
			string(licenseschema.Development), string(licenseschema.Trial),
			string(licenseschema.Paid), string(licenseschema.Community),
		},
		knownValuesOf(t, facts, featureflag.LicenseRoot, "type"))

	assert.ElementsMatch(t,
		[]string{
			string(instanceschema.InstanceStatusHealthy), string(instanceschema.InstanceStatusDegraded),
			string(instanceschema.InstanceStatusIncident), string(instanceschema.InstanceStatusMaintenance),
		},
		knownValuesOf(t, facts, featureflag.InstanceRoot, "status"))
}

func factsRoot(t *testing.T) featureflag.TargetingContextNode {
	t.Helper()

	for _, root := range featureflag.TargetingContextRoots(featureflag.TargetingCatalogue{}) {
		if root.Name == featureflag.FactsRoot {
			return root
		}
	}

	require.FailNow(t, "no facts root")

	return featureflag.TargetingContextNode{}
}

func knownValuesOf(t *testing.T, facts featureflag.TargetingContextNode, subroot, field string) []string {
	t.Helper()

	for _, sub := range facts.Fields {
		if sub.Name != subroot {
			continue
		}
		for _, f := range sub.Fields {
			if f.Name != field {
				continue
			}
			values := make([]string, 0, len(f.KnownValues))
			for _, v := range f.KnownValues {
				values = append(values, v.Value)
			}

			return values
		}
	}

	require.FailNow(t, "no such field", "%s.%s", subroot, field)

	return nil
}
