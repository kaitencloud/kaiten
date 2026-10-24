package featureflags_test

import (
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/openfeature/ofrep"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// The subject of the licence facts is the instance kaiten.instanceSlug names,
// else the targeting key's customer's oldest instance; a slug that names no
// instance yields no facts, never the oldest instance's (§7.4 rule 5).
func TestOFREPSubjectIsTheNamedInstance(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	customer := newTargetingCustomer(t, "Subject Co")
	starter := newTargetingLicense(t, "Subject Starter")
	scale := newTargetingLicense(t, "Subject Scale")
	oldest := newTargetingInstance(t, "Subject Oldest", customer, starter)
	later := newTargetingInstance(t, "Subject Later", customer, scale)
	backdateInstance(t, oldest.ID, time.Now().Add(-48*time.Hour))
	backdateInstance(t, later.ID, time.Now().Add(-1*time.Hour))

	resp, err := testServer.App.Test(commonfixture.NewJSONRequest(t, "POST", "/api/feature-flags", schema.FeatureFlag{
		Name: "Scale only", Slug: "scale-only", Type: "boolean",
		Variants:       []schema.Variant{{Name: "on", Value: true}, {Name: "off", Value: false}},
		Targetings:     schema.Targetings{schema.NewBasicTargeting("Scale", "__kaiten.license.slug == '"+scale.Slug+"'", "on")},
		DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant("off")},
		Metadata:       map[string]any{}, Enabled: true, EventName: "ff.scale_only",
	}), fiber.TestConfig{})
	require.NoError(t, err)
	commonfixture.MustCloseBody(t, resp.Body)
	require.Equal(t, fiber.StatusCreated, resp.StatusCode)

	variant := func(context ofrep.Context) string {
		t.Helper()
		resp, err := testServer.App.Test(commonfixture.NewJSONRequest(t, "POST", "/api/ofrep/v1/evaluate/flags/scale-only",
			map[string]any{"context": context}), fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		return commonfixture.AssertJSONResponse[ofrep.EvaluationSuccess](t, resp, fiber.StatusOK).Variant
	}
	require.Equal(t, "off", variant(ofrep.Context{"targetingKey": customer.Slug}), "the oldest instance is on starter")
	require.Equal(t, "on", variant(ofrep.Context{"targetingKey": customer.Slug, "kaiten": map[string]any{"instanceSlug": later.Slug}}))
	require.Equal(t, "on", variant(ofrep.Context{"targetingKey": "anyone", "kaiten": map[string]any{"instanceId": later.ID.String()}}),
		"whatever customer the targeting key names")
	require.Equal(t, "off", variant(ofrep.Context{"targetingKey": customer.Slug, "kaiten": map[string]any{"instanceSlug": "no-such-instance"}}))
}
