package billing_test

import (
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestLicenseFamilyVisibility(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	newVersion(t, "Pro", licenseschema.Published)
	families := commonfixture.AssertJSONResponse[pagination.Page[licenseschema.LicenseFamilyView]](t,
		call(t, "GET", "/api/license-families", nil), fiber.StatusOK)
	require.Len(t, families.Items, 1)
	family := families.Items[0]
	require.False(t, family.IsPublic, "private by default")

	made := commonfixture.AssertJSONResponse[licenseschema.LicenseFamilyView](t,
		call(t, "PATCH", "/api/license-families/"+family.Slug, map[string]any{"isPublic": true}), fiber.StatusOK)
	require.True(t, made.IsPublic)
	read := commonfixture.AssertJSONResponse[licenseschema.LicenseFamilyView](t,
		call(t, "GET", "/api/license-families/"+family.Slug, nil), fiber.StatusOK)
	require.True(t, read.IsPublic)
	require.Equal(t, "UpdateLicenseFamily.NotFound", problemCode(t, fiber.StatusNotFound, "PATCH",
		"/api/license-families/nope", map[string]any{"isPublic": true}))
}

// TestLicenseFamilySettings: the family's fallback (V31-66), trial end
// without a payment method (V31-65) and trial reminder lead (V32-07), each
// kept when absent; a fallback names another FREE family, which then stays
// FREE.
func TestLicenseFamilySettings(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	growth := newDefaultVersion(t, "Growth", "PAID")
	starter := newDefaultVersion(t, "Starter", "FREE")
	path := "/api/license-families/" + growth.FamilySlug

	fresh := commonfixture.AssertJSONResponse[licenseschema.LicenseFamilyView](t, call(t, "GET", path, nil), fiber.StatusOK)
	require.Nil(t, fresh.FallbackLicenseFamilySlug)
	require.Equal(t, "CANCEL", fresh.TrialEndWithoutPaymentMethod)
	require.EqualValues(t, 3, fresh.TrialReminderDays)

	set := commonfixture.AssertJSONResponse[licenseschema.LicenseFamilyView](t, call(t, "PATCH", path, map[string]any{
		"fallbackLicenseFamilySlug": starter.FamilySlug, "trialEndWithoutPaymentMethod": "CONVERT", "trialReminderDays": 2,
	}), fiber.StatusOK)
	require.Equal(t, starter.FamilySlug, *set.FallbackLicenseFamilySlug)
	require.Equal(t, "CONVERT", set.TrialEndWithoutPaymentMethod)
	require.EqualValues(t, 2, set.TrialReminderDays)
	require.False(t, set.IsPublic)

	kept := commonfixture.AssertJSONResponse[licenseschema.LicenseFamilyView](t,
		call(t, "PATCH", path, map[string]any{"isPublic": true}), fiber.StatusOK)
	require.True(t, kept.IsPublic)
	require.Equal(t, starter.FamilySlug, *kept.FallbackLicenseFamilySlug, "an absent member keeps the stored value")
	require.Equal(t, "CONVERT", kept.TrialEndWithoutPaymentMethod)
	require.EqualValues(t, 2, kept.TrialReminderDays)
	listed := commonfixture.AssertJSONResponse[pagination.Page[licenseschema.LicenseFamilyView]](t,
		call(t, "GET", "/api/license-families", nil), fiber.StatusOK)
	for _, family := range listed.Items {
		if family.Slug == growth.FamilySlug {
			require.Equal(t, starter.FamilySlug, *family.FallbackLicenseFamilySlug, "the list reads it too")
		}
	}

	for name, body := range map[string]map[string]any{
		"itself":  {"fallbackLicenseFamilySlug": growth.FamilySlug},
		"paid":    {"fallbackLicenseFamilySlug": newDefaultVersion(t, "Scale", "PAID").FamilySlug},
		"unknown": {"fallbackLicenseFamilySlug": "nope"},
	} {
		require.Equal(t, "UpdateLicenseFamily.InvalidFallback", problemCode(t, fiber.StatusUnprocessableEntity, "PATCH", path, body), name)
	}
	require.Equal(t, "UpdateLicenseFamily.InvalidTrialEndBehavior", problemCode(t, fiber.StatusUnprocessableEntity, "PATCH", path,
		map[string]any{"trialEndWithoutPaymentMethod": "EXTEND"}))
	for _, days := range []any{0, 31, -1, 2.5} {
		require.Equal(t, "UpdateLicenseFamily.InvalidTrialReminderDays", problemCode(t, fiber.StatusUnprocessableEntity, "PATCH", path,
			map[string]any{"trialReminderDays": days}), days)
	}

	// The fallback stays FREE while it is one.
	require.Equal(t, "CreateLicense.FallbackMustBeFree", problemCode(t, fiber.StatusUnprocessableEntity, "POST", "/api/licenses", map[string]any{
		"name": "Starter", "description": "d", "type": "PAID", "familySlug": starter.FamilySlug, "isDefault": false,
		"lifecycleState": licenseschema.Draft, "pricingType": "PAID",
	}))
	require.Equal(t, "UpdateLicense.FallbackMustBeFree", problemCode(t, fiber.StatusUnprocessableEntity, "PUT", "/api/licenses/"+starter.Slug, map[string]any{
		"name": "Starter", "description": "d", "type": "PAID", "isDefault": true, "pricingType": "PAID",
	}))

	cleared := commonfixture.AssertJSONResponse[licenseschema.LicenseFamilyView](t,
		call(t, "PATCH", path, map[string]any{"fallbackLicenseFamilySlug": ""}), fiber.StatusOK)
	require.Nil(t, cleared.FallbackLicenseFamilySlug, `"" removes the fallback`)
	require.Equal(t, fiber.StatusCreated, call(t, "POST", "/api/licenses", map[string]any{
		"name": "Starter", "description": "d", "type": "PAID", "familySlug": starter.FamilySlug, "isDefault": false,
		"lifecycleState": licenseschema.Draft, "pricingType": "PAID",
	}).StatusCode, "no longer a fallback, no longer bound to FREE")
}
