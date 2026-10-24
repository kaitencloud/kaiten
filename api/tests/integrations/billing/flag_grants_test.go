package billing_test

import (
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/openfeature/ofrep"
	ffschema "github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func newFlag(t *testing.T, slug string) {
	t.Helper()
	commonfixture.AssertJSONResponse[ffschema.FeatureFlag](t, call(t, "POST", "/api/feature-flags", ffschema.FeatureFlag{
		Name: slug, Slug: slug, Type: "boolean",
		Variants:       []ffschema.Variant{{Name: "on", Value: true}, {Name: "off", Value: false}},
		Targetings:     ffschema.Targetings{},
		DefaultVariant: &ffschema.DefaultVariant{Type: ffschema.BasicType, Value: ffschema.BasicVariant("off")},
		Metadata:       map[string]any{"team": "growth"}, Enabled: true, EventName: "ff." + slug,
	}), fiber.StatusCreated)
}

func evaluate(t *testing.T, flag string, context ofrep.Context) ofrep.EvaluationSuccess {
	t.Helper()
	return commonfixture.AssertJSONResponse[ofrep.EvaluationSuccess](t,
		call(t, "POST", "/api/ofrep/v1/evaluate/flags/"+flag, map[string]any{"context": context}), fiber.StatusOK)
}

// TestFlagGrants: a FLAG_GRANT voucher grants a flag's variant on the
// instance that redeems it, for its window (V32-03 c, §7.4 rules 5 and 6).
func TestFlagGrants(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	outer := t // a subtest's context is done by its cleanup
	newFlag(t, "new-dashboard")
	newFlag(t, "beta-api")
	version := newVersion(t, "Pro", licenseschema.Published)
	customer := newCustomer(t, "acme")
	oldest := newInstance(t, "Acme prod", customer.ID, version.ID)
	other := newInstance(t, "Acme staging", customer.ID, version.ID)

	flagGrant := func(grants ...map[string]any) map[string]any {
		return map[string]any{"name": "Beta", "voucherType": "FLAG_GRANT", "duration": "FOREVER", "flagGrants": grants}
	}
	t.Run("Refusals", func(t *testing.T) {
		for code, payload := range map[string]map[string]any{
			"CreateVoucher.FlagGrantsRequired": flagGrant(),
			"CreateVoucher.InvalidFlagGrant":   flagGrant(map[string]any{"flagSlug": "new-dashboard", "variant": "maybe"}),
			"CreateVoucher.DuplicateFlagGrant": flagGrant(map[string]any{"flagSlug": "new-dashboard", "variant": "on"},
				map[string]any{"flagSlug": "new-dashboard", "variant": "off"}),
			"CreateVoucher.InvalidDiscount": percentOff("10", map[string]any{
				"name": "x", "duration": "FOREVER",
				"flagGrants": []map[string]any{{"flagSlug": "new-dashboard", "variant": "on"}},
			}),
		} {
			require.Equal(t, code, problemCode(t, fiber.StatusUnprocessableEntity, "POST", "/api/vouchers", payload), code)
		}
		require.Equal(t, "CreateVoucher.FlagNotFound", problemCode(t, fiber.StatusNotFound, "POST", "/api/vouchers",
			flagGrant(map[string]any{"flagSlug": "no-such-flag", "variant": "on"})))
	})

	voucher := newVoucher(t, flagGrant(map[string]any{"flagSlug": "new-dashboard", "variant": "on"}))
	require.Equal(t, []catalogue.FlagGrant{{FlagSlug: "new-dashboard", Variant: "on"}}, voucher.FlagGrants)
	require.Empty(t, voucher.Grants)
	publish(t, voucher)
	redemption := redeem(t, oldest.Slug, *voucher.Code)
	require.Nil(t, redemption.EffectiveExpiresAt, "FOREVER")

	t.Run("TheGrantAnswersOnTheRedeemingInstance", func(t *testing.T) {
		answer := evaluate(t, "new-dashboard", ofrep.Context{"targetingKey": customer.Slug, "kaiten": map[string]any{"instanceSlug": oldest.Slug}})
		require.Equal(t, "VOUCHER_GRANT", answer.Reason)
		require.Equal(t, "on", answer.Variant)
		require.Equal(t, true, answer.Value)
		require.NotNil(t, answer.Metadata)
		metadata := *answer.Metadata
		require.Equal(t, voucher.ID.String(), metadata["voucherId"])
		require.Equal(t, redemption.ID.String(), metadata["redemptionId"])
		require.Equal(t, "growth", metadata["team"], "beside the flag's own metadata")

		// Without instanceSlug the subject is the customer's oldest instance.
		require.Equal(t, "VOUCHER_GRANT", evaluate(t, "new-dashboard", ofrep.Context{"targetingKey": customer.Slug}).Reason)
		// Another instance does not hold it, and an unknown slug is no subject.
		require.Equal(t, "off", evaluate(t, "new-dashboard", ofrep.Context{
			"targetingKey": customer.Slug,
			"kaiten":       map[string]any{"instanceSlug": other.Slug},
		}).Variant)
		unknown := evaluate(t, "new-dashboard", ofrep.Context{"targetingKey": customer.Slug, "kaiten": map[string]any{"instanceSlug": "no-such-instance"}})
		require.NotEqual(t, "VOUCHER_GRANT", unknown.Reason, "never the oldest instance in its place")
		require.Equal(t, "off", unknown.Variant)
		// The other flag is not granted.
		require.NotEqual(t, "VOUCHER_GRANT", evaluate(t, "beta-api", ofrep.Context{"targetingKey": customer.Slug}).Reason)
	})

	t.Run("AGrantOnAnotherInstanceAppliesOnlyWhenItIsNamed", func(t *testing.T) {
		beta := newVoucher(t, flagGrant(map[string]any{"flagSlug": "beta-api", "variant": "on"}))
		publish(t, beta)
		redeem(t, other.Slug, *beta.Code)
		require.NotEqual(t, "VOUCHER_GRANT", evaluate(t, "beta-api", ofrep.Context{"targetingKey": customer.Slug}).Reason,
			"the oldest instance is the subject")
		require.Equal(t, "VOUCHER_GRANT", evaluate(t, "beta-api", ofrep.Context{
			"targetingKey": customer.Slug,
			"kaiten":       map[string]any{"instanceSlug": other.Slug},
		}).Reason)
	})

	t.Run("TheBulkEvaluationReadsTheGrants", func(t *testing.T) {
		result := commonfixture.AssertJSONResponse[ofrep.BulkEvaluationSuccess](t, call(t, "POST", "/api/ofrep/v1/evaluate/flags",
			map[string]any{"context": ofrep.Context{"targetingKey": customer.Slug, "kaiten": map[string]any{"instanceSlug": oldest.Slug}}}), fiber.StatusOK)
		reasons := map[string]string{}
		for _, raw := range result.Flags {
			flag, _ := raw.(map[string]any)
			key, _ := flag["key"].(string)
			reason, _ := flag["reason"].(string)
			reasons[key] = reason
		}
		require.Equal(t, "VOUCHER_GRANT", reasons["new-dashboard"])
		require.NotEqual(t, "VOUCHER_GRANT", reasons["beta-api"])
	})

	t.Run("AGrantedFlagCannotBeDeleted", func(t *testing.T) {
		require.Equal(t, "DeleteFeatureFlag.InUseConflict", problemCode(t, fiber.StatusConflict, "DELETE", "/api/feature-flags/new-dashboard", nil))
	})

	t.Run("TheKillSwitchWins", func(t *testing.T) {
		exec(t, `UPDATE feature_flags SET enabled = false WHERE slug = 'new-dashboard'`)
		t.Cleanup(func() { exec(outer, `UPDATE feature_flags SET enabled = true WHERE slug = 'new-dashboard'`) })
		answer := evaluate(t, "new-dashboard", ofrep.Context{"targetingKey": customer.Slug})
		require.Equal(t, "DISABLED", answer.Reason)
		require.Equal(t, "off", answer.Variant)
	})

	t.Run("AVariantTheFlagLostIsSkipped", func(t *testing.T) {
		exec(t, `UPDATE feature_flags SET variants = '[{"name":"off","value":false},{"name":"maybe","value":true}]'::jsonb WHERE slug = 'new-dashboard'`)
		t.Cleanup(func() {
			exec(outer, `UPDATE feature_flags SET variants = '[{"name":"on","value":true},{"name":"off","value":false}]'::jsonb WHERE slug = 'new-dashboard'`)
		})
		answer := evaluate(t, "new-dashboard", ofrep.Context{"targetingKey": customer.Slug})
		require.NotEqual(t, "VOUCHER_GRANT", answer.Reason)
		require.Equal(t, "off", answer.Variant)
	})

	t.Run("RevocationEndsItAtOnce", func(t *testing.T) {
		commonfixture.AssertJSONResponse[catalogue.Redemption](t, call(t, "POST",
			"/api/instances/"+oldest.Slug+"/vouchers/"+redemption.ID.String()+"/revoke", map[string]any{"reason": "ended"}), fiber.StatusOK)
		require.NotEqual(t, "VOUCHER_GRANT", evaluate(t, "new-dashboard", ofrep.Context{"targetingKey": customer.Slug}).Reason)
	})
}
