package ofrep_test

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/featureflag"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/openfeature"
	customertargetingfacts "github.com/kaitencloud/kaiten/api/internal/modules/customers/targetingfacts"
	deploymentzonetargetingfacts "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/targetingfacts"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/openfeature/ofrep"
	instancetargetingfacts "github.com/kaitencloud/kaiten/api/internal/modules/instances/targetingfacts"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	"github.com/kaitencloud/kaiten/api/pkg/dogfoodingctx"
)

type stubReader struct {
	rows []customertargetingfacts.TargetingFact
	err  error
}

func (s stubReader) GetOneCustomerBySlug(context.Context, uuid.UUID, string) (*customertargetingfacts.Customer, error) {
	return nil, pgx.ErrNoRows
}

func (s stubReader) GetTargetingFactsByCustomerSlug(context.Context, uuid.UUID, string) ([]customertargetingfacts.TargetingFact, error) {
	return s.rows, s.err
}

func slug(s string) *string { return &s }

// Values are stored as the JSON the entitlement module writes.
func threshold(v string) []byte { return []byte(`{"type":"number","value":` + v + `}`) }

func growthReader() stubReader {
	return stubReader{rows: []customertargetingfacts.TargetingFact{
		{
			LicenseSlug: "growth-v2", LicenseFamilySlug: "growth", LicenseType: "PAID",
			EntitlementSlug: slug("customers"),
			LimitValue:      threshold("44"), UsageValue: threshold("24"),
		},
		{
			LicenseSlug: "growth-v2", LicenseFamilySlug: "growth", LicenseType: "PAID",
			EntitlementSlug: slug("customers-read"),
			LimitValue:      threshold("-1"), UsageValue: threshold("9000"),
		},
	}}
}

// kaitenFacts reads back the nested facts namespace — the shape every real
// caller (evaluateflag/bulkevaluateflags handlers) actually sees, since
// ResetKaitenFacts+Enrich* is what they always run together.
func kaitenFacts(ec openfeature.EvaluationContext) map[string]any {
	facts, _ := ec.Inputs[ofrep.KaitenFactsNamespace].(map[string]any)
	return facts
}

// enrichServerFacts replicates exactly what a real handler does: reset the
// facts namespace, then enrich. Tests that want to simulate a caller-forged
// request body populate `inputs` with that forged content before calling
// this — the reset+enrich pipeline is what must defeat it, not the
// individual function in isolation, because both handlers always call them
// together, in this order.
func enrichServerFacts(reader customertargetingfacts.Port, targetingKey string, inputs map[string]any) openfeature.EvaluationContext {
	ec := openfeature.EvaluationContext{TargetingKey: targetingKey, Inputs: inputs}
	ofrep.ResetKaitenFacts(&ec)
	ofrep.EnrichWithServerFacts(context.Background(), reader, uuid.New(), &ec)
	return ec
}

func TestEnrichWithServerFacts(t *testing.T) {
	// The version and the product it is a version of: a rule on the product
	// reads familySlug, and keeps matching once a new version is published.
	t.Run("injects the licence the server resolved, with its family", func(t *testing.T) {
		ec := enrichServerFacts(growthReader(), "dogfooding-abc", map[string]any{})

		assert.Equal(t,
			map[string]any{"slug": "growth-v2", "familySlug": "growth", "type": "PAID"},
			kaitenFacts(ec)[ofrep.LicenseInput])
	})

	// The whole point: a client that claims to be on Scale must not become one.
	t.Run("overwrites a licence the client claimed", func(t *testing.T) {
		ec := enrichServerFacts(growthReader(), "dogfooding-abc", map[string]any{
			ofrep.KaitenFactsNamespace: map[string]any{
				ofrep.LicenseInput:      map[string]any{"slug": "scale", "familySlug": "scale", "type": "PAID"},
				ofrep.EntitlementsInput: map[string]any{"customers": map[string]any{"percentage": 0.0}},
			},
		})

		license := kaitenFacts(ec)[ofrep.LicenseInput].(map[string]any)
		assert.Equal(t, "growth-v2", license["slug"])
		assert.Equal(t, "growth", license["familySlug"])

		facts := kaitenFacts(ec)[ofrep.EntitlementsInput].(map[string]any)
		customers := facts["customers"].(map[string]any)
		assert.InDelta(t, 24.0/44.0, customers["percentage"], 0.001)
	})

	// "Who is about to run out" is the question a plan-aware gate is asked, so
	// the fraction is computed here rather than left to a division in CEL.
	t.Run("reports how full each entitlement is", func(t *testing.T) {
		ec := enrichServerFacts(growthReader(), "dogfooding-abc", map[string]any{})
		facts := kaitenFacts(ec)[ofrep.EntitlementsInput].(map[string]any)
		customers := facts["customers"].(map[string]any)

		assert.Equal(t, 44.0, customers["limit"])
		assert.Equal(t, 24.0, customers["used"])
		assert.Equal(t, 20.0, customers["remaining"])
		assert.InDelta(t, 0.545, customers["percentage"], 0.001)
		assert.Equal(t, false, customers["unlimited"])
	})

	// An unlimited grant has no ceiling to be near. The fields stay PRESENT —
	// a rule reading a key the context omits fails, which is the failure mode
	// this whole enrichment exists to remove — and report a quantity no usage
	// can reach, so the comparison a rule makes comes out the way it reads.
	t.Run("reports unlimited entitlements as unreachably large", func(t *testing.T) {
		ec := enrichServerFacts(growthReader(), "dogfooding-abc", map[string]any{})
		facts := kaitenFacts(ec)[ofrep.EntitlementsInput].(map[string]any)
		read := facts["customers-read"].(map[string]any)

		assert.Equal(t, true, read["unlimited"])
		assert.Equal(t, featureflag.UnlimitedQuantity, read["limit"])
		assert.Equal(t, featureflag.UnlimitedQuantity, read["remaining"])
		assert.Equal(t, 0.0, read["percentage"])
		assert.Equal(t, 9000.0, read["used"])
	})

	// The facts exist to be compared, so this asserts on the comparison rather
	// than on the map. `remaining < 5` is the rule someone writes to catch a
	// customer running out of quota; reporting 0 for a grant with no ceiling
	// made it match for exactly the customers who never can, and `> 1000` —
	// the rule that rewards an uncapped plan — never matched at all.
	t.Run("an unlimited entitlement satisfies the rules it should", func(t *testing.T) {
		ec := enrichServerFacts(growthReader(), "dogfooding-abc", map[string]any{})

		for rule, want := range map[string]bool{
			"__kaiten.entitlements['customers-read'].remaining < 5":     false,
			"__kaiten.entitlements['customers-read'].remaining > 1000":  true,
			"__kaiten.entitlements['customers-read'].limit > 1000":      true,
			"__kaiten.entitlements['customers-read'].percentage >= 0.9": false,
			"__kaiten.entitlements['customers-read'].unlimited":         true,
			// The capped entitlement on the same licence still behaves.
			"__kaiten.entitlements['customers'].remaining < 5":     false,
			"__kaiten.entitlements['customers'].percentage >= 0.5": true,
		} {
			t.Run(rule, func(t *testing.T) {
				engine, err := featureflag.NewEngine(ec)
				require.NoError(t, err)

				match, err := engine.EvaluateRule(t.Context(), rule)
				require.NoError(t, err)
				assert.Equal(t, want, match)
			})
		}
	})

	t.Run("leaves the facts namespace empty when nothing resolves", func(t *testing.T) {
		ec := enrichServerFacts(stubReader{err: errors.New("no rows")}, "dogfooding-abc", map[string]any{})

		// ResetKaitenFacts always installs the namespace — empty, not absent,
		// even when nothing resolved. Functionally identical for a rule: a
		// missing key and an empty map both fail `__kaiten.license.slug` the
		// same way, falling through to the flag's default variant.
		assert.Equal(t, map[string]any{}, kaitenFacts(ec))
	})

	t.Run("does nothing without a targeting key", func(t *testing.T) {
		ec := enrichServerFacts(growthReader(), "", map[string]any{})

		assert.Equal(t, map[string]any{}, kaitenFacts(ec))
	})

	// The two below are the cases the overwrite test above does NOT cover: a
	// claim that survives BECAUSE the resolution did not happen. Clearing only on
	// the success path made a failure to resolve the way to be believed, and a
	// caller picks its own targeting key — so it also picks whether we resolve.
	t.Run("drops a claimed licence when nothing resolves", func(t *testing.T) {
		ec := enrichServerFacts(stubReader{err: errors.New("no rows")}, "dogfooding-abc", map[string]any{
			ofrep.KaitenFactsNamespace: map[string]any{
				ofrep.LicenseInput:      map[string]any{"slug": "scale", "familySlug": "scale", "type": "PAID"},
				ofrep.EntitlementsInput: map[string]any{"customers": map[string]any{"percentage": 0.0}},
			},
		})

		assert.Equal(t, map[string]any{}, kaitenFacts(ec))
	})

	t.Run("drops a claimed licence without a targeting key", func(t *testing.T) {
		ec := enrichServerFacts(growthReader(), "", map[string]any{
			ofrep.KaitenFactsNamespace: map[string]any{
				ofrep.LicenseInput: map[string]any{"slug": "scale", "familySlug": "scale", "type": "PAID"},
			},
			"user": map[string]any{"cohort": "beta"},
		})

		assert.Equal(t, map[string]any{}, kaitenFacts(ec))
		// A host's own attributes are none of our business — only the facts
		// namespace is reserved.
		assert.Contains(t, ec.Inputs, "user")
	})

	// The internal marker is reserved too, and it is the one reserved name that
	// lives at the top level rather than inside the facts namespace, so the reset
	// has to name it: a caller that sends it gets it dropped.
	t.Run("drops a forged platform-internal marker", func(t *testing.T) {
		ec := enrichServerFacts(growthReader(), "dogfooding-abc", map[string]any{
			dogfoodingctx.InternalEvaluationContextKey: true,
		})

		assert.NotContains(t, ec.Inputs, dogfoodingctx.InternalEvaluationContextKey)
	})
}

// instanceFactsStub backs the instance/customer/deployment-zone targeting
// ports with in-memory fixtures keyed the same way the real queries are:
// instance by slug or by id, customer and deployment zone by their own slug
// (as returned on the instance row). It implements all three ports so a
// single value can stand in for all of EnrichWithInstanceFacts's three
// port parameters.
type instanceFactsStub struct {
	bySlug    map[string]instancetargetingfacts.Instance
	byID      map[uuid.UUID]instancetargetingfacts.Instance
	customers map[string]customertargetingfacts.Customer
	zones     map[string]deploymentzonetargetingfacts.DeploymentZone
}

func (s instanceFactsStub) GetOneBySlug(_ context.Context, _ uuid.UUID, slug string) (*instancetargetingfacts.Instance, error) {
	if row, ok := s.bySlug[slug]; ok {
		return &row, nil
	}
	return nil, pgx.ErrNoRows
}

func (s instanceFactsStub) GetByIDs(_ context.Context, _ uuid.UUID, ids []uuid.UUID) ([]instancetargetingfacts.Instance, error) {
	var rows []instancetargetingfacts.Instance
	for _, id := range ids {
		if row, ok := s.byID[id]; ok {
			rows = append(rows, row)
		}
	}
	return rows, nil
}

func (s instanceFactsStub) GetOneCustomerBySlug(_ context.Context, _ uuid.UUID, slug string) (*customertargetingfacts.Customer, error) {
	if row, ok := s.customers[slug]; ok {
		return &row, nil
	}
	return nil, pgx.ErrNoRows
}

func (s instanceFactsStub) GetTargetingFactsByCustomerSlug(context.Context, uuid.UUID, string) ([]customertargetingfacts.TargetingFact, error) {
	return nil, pgx.ErrNoRows
}

func (s instanceFactsStub) GetOneBySlugZone(_ context.Context, _ uuid.UUID, slug string) (*deploymentzonetargetingfacts.DeploymentZone, error) {
	if row, ok := s.zones[slug]; ok {
		return &row, nil
	}
	return nil, pgx.ErrNoRows
}

// deploymentZonePort adapts instanceFactsStub to
// deploymentzonetargetingfacts.Port -- GetOneBySlug's name collides with the
// instance port's own method of the same name, so the zone lookup is
// exposed under GetOneBySlugZone above and wrapped here.
type deploymentZonePort struct{ instanceFactsStub }

func (s deploymentZonePort) GetOneBySlug(ctx context.Context, orgID uuid.UUID, slug string) (*deploymentzonetargetingfacts.DeploymentZone, error) {
	return s.GetOneBySlugZone(ctx, orgID, slug)
}

var (
	fixtureInstanceID = uuid.MustParse("00000000-0000-0000-0000-0000000000aa")
	fixtureReleaseID  = uuid.MustParse("00000000-0000-0000-0000-0000000000bb")
)

// fullInstanceStub is an instance with both a customer and a deployment zone
// resolvable — the common case.
func fullInstanceStub() instanceFactsStub {
	customerSlug, zoneSlug := "acme", "prod-eu"
	instance := instancetargetingfacts.Instance{
		ID: fixtureInstanceID, Slug: "instance-slug-1", Name: "Acme Prod",
		Status: "HEALTHY", Metadata: []byte(`{"demo":true}`),
		CustomerSlug: &customerSlug, DeploymentZoneSlug: &zoneSlug,
	}
	return instanceFactsStub{
		bySlug: map[string]instancetargetingfacts.Instance{instance.Slug: instance},
		byID: map[uuid.UUID]instancetargetingfacts.Instance{
			instance.ID: instance,
		},
		customers: map[string]customertargetingfacts.Customer{
			customerSlug: {ID: uuid.New(), Name: "Acme Inc", Slug: customerSlug, Domain: ptr.To("acme.com")},
		},
		zones: map[string]deploymentzonetargetingfacts.DeploymentZone{
			zoneSlug: {ID: uuid.New(), Name: "EU Production", Slug: zoneSlug, Type: "production", Metadata: []byte(`{}`), ReleaseID: fixtureReleaseID},
		},
	}
}

// enrichInstanceFacts mirrors enrichServerFacts: reset first, then enrich,
// so every test exercises the same pipeline a real handler runs.
// callerInput seeds the untrusted kaiten.* namespace (what the caller is
// asking for); forgedFacts seeds __kaiten.* BEFORE the reset, to prove a
// caller can't plant a fact that survives.
func enrichInstanceFacts(reader instanceFactsStub, callerInput, forgedFacts map[string]any) openfeature.EvaluationContext {
	inputs := map[string]any{}
	if callerInput != nil {
		inputs[ofrep.KaitenInput] = callerInput
	}
	if forgedFacts != nil {
		inputs[ofrep.KaitenFactsNamespace] = forgedFacts
	}
	ec := openfeature.EvaluationContext{Inputs: inputs}
	ofrep.ResetKaitenFacts(&ec)
	ofrep.EnrichWithInstanceFacts(context.Background(), reader, reader, deploymentZonePort{reader}, uuid.New(), &ec)
	return ec
}

func TestEnrichWithInstanceFacts(t *testing.T) {
	t.Run("resolves instance, customer, and deployment zone via kaiten.instanceSlug", func(t *testing.T) {
		ec := enrichInstanceFacts(fullInstanceStub(), map[string]any{"instanceSlug": "instance-slug-1"}, nil)

		facts := kaitenFacts(ec)
		instance := facts[ofrep.InstanceInput].(map[string]any)
		assert.Equal(t, "instance-slug-1", instance["slug"])
		assert.Equal(t, map[string]any{"demo": true}, instance["metadata"])

		customer := facts[ofrep.CustomerInput].(map[string]any)
		assert.Equal(t, "acme", customer["slug"])
		assert.Equal(t, "acme.com", customer["domain"])

		zone := facts[ofrep.DeploymentZoneInput].(map[string]any)
		assert.Equal(t, "production", zone["type"])
		assert.Equal(t, fixtureReleaseID.String(), zone["currentReleaseId"])
	})

	t.Run("resolves the same instance via kaiten.instanceId", func(t *testing.T) {
		ec := enrichInstanceFacts(fullInstanceStub(), map[string]any{"instanceId": fixtureInstanceID.String()}, nil)

		instance := kaitenFacts(ec)[ofrep.InstanceInput].(map[string]any)
		assert.Equal(t, "instance-slug-1", instance["slug"])
	})

	t.Run("a malformed kaiten.instanceId does not error, just resolves nothing", func(t *testing.T) {
		ec := enrichInstanceFacts(fullInstanceStub(), map[string]any{"instanceId": "not-a-uuid"}, nil)

		assert.NotContains(t, kaitenFacts(ec), ofrep.InstanceInput)
	})

	t.Run("neither identifier set — normal for most evaluations, not an error", func(t *testing.T) {
		ec := enrichInstanceFacts(fullInstanceStub(), map[string]any{}, nil)

		assert.Equal(t, map[string]any{}, kaitenFacts(ec))
	})

	t.Run("instance with no deployment zone omits deploymentZone but keeps instance/customer", func(t *testing.T) {
		reader := fullInstanceStub()
		noZone := reader.bySlug["instance-slug-1"]
		noZone.DeploymentZoneSlug = nil
		reader.bySlug["instance-slug-1"] = noZone

		ec := enrichInstanceFacts(reader, map[string]any{"instanceSlug": "instance-slug-1"}, nil)

		facts := kaitenFacts(ec)
		assert.Contains(t, facts, ofrep.InstanceInput)
		assert.Contains(t, facts, ofrep.CustomerInput)
		assert.NotContains(t, facts, ofrep.DeploymentZoneInput)
	})

	// The whole point of ResetKaitenFacts: a caller putting "__kaiten": {...}
	// in its own request body must never survive, whether or not a real
	// instance ends up resolving in the same call.
	t.Run("drops a forged instance fact even when nothing resolves", func(t *testing.T) {
		ec := enrichInstanceFacts(fullInstanceStub(), map[string]any{}, map[string]any{
			ofrep.InstanceInput: map[string]any{"metadata": map[string]any{"demo": true}},
		})

		assert.Equal(t, map[string]any{}, kaitenFacts(ec))
	})

	t.Run("drops a forged instance fact and replaces it with the real one", func(t *testing.T) {
		ec := enrichInstanceFacts(fullInstanceStub(), map[string]any{"instanceSlug": "instance-slug-1"}, map[string]any{
			ofrep.InstanceInput: map[string]any{"slug": "not-the-real-instance"},
		})

		instance := kaitenFacts(ec)[ofrep.InstanceInput].(map[string]any)
		assert.Equal(t, "instance-slug-1", instance["slug"])
	})
}
