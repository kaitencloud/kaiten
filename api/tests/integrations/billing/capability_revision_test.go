package billing_test

import (
	"encoding/json"
	"fmt"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func capabilityDefinitions(t *testing.T, sourceSlug string) {
	t.Helper()
	for _, slug := range []string{"vouchers", "addons"} {
		commonfixture.AssertJSONResponse[map[string]any](t, call(t, "POST", "/api/entitlements", map[string]any{
			"name": slug, "slug": slug, "description": slug, "type": "BOOLEAN",
		}), fiber.StatusCreated)
		response := call(t, "POST", "/api/licenses/"+sourceSlug+"/entitlements", map[string]any{
			"entitlementSlug": slug, "value": map[string]any{"type": "boolean", "value": false},
		})
		require.Contains(t, []int{fiber.StatusOK, fiber.StatusCreated, fiber.StatusNoContent}, response.StatusCode)
	}
}

func revisionSnapshot(t *testing.T, query string, args ...any) string {
	t.Helper()
	var raw string
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), query, args...).Scan(&raw))
	return raw
}

func TestStartupCapabilityRevisionPreservesSoldContractAndDiscounts(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	sold := newSold(t, flatFee("2900", "MONTHLY"))
	capabilityDefinitions(t, sold.version.Slug)
	newEntitlement(t, "tokens", 10)
	grant(t, sold.version.Slug, "tokens", 30, 25)
	meter := createPrice(t, sold.version.Slug, metered("USAGE_BASED", "tokens", "0.015625"))
	// Today's definition must not replace the original captured price factor.
	_, err := testServer.Dependencies.DB.Exec(t.Context(), "UPDATE entitlement SET sale_unit_factor = 20 WHERE slug = 'tokens' AND organization_id = $1", testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
	voucher := newVoucher(t, percentOff("10", map[string]any{
		"code": "CAPS-REVISION", "priceAppliesTo": "SELECTED_PRICES", "applicableLicensePriceIds": []uuid.UUID{sold.monthly.ID},
	}))
	publish(t, voucher)
	subscribe(t, sold.instance.Slug, map[string]any{"basePriceId": sold.monthly.ID, "voucherCode": "CAPS-REVISION"})
	beforeBilling := revisionSnapshot(t, "SELECT (to_jsonb(ib) - 'base_license_price_id')::text FROM instance_billing ib WHERE instance_id = $1", sold.instance.ID)
	beforeInstance := revisionSnapshot(t, "SELECT (to_jsonb(i) - 'license_id')::text FROM instance i WHERE id = $1", sold.instance.ID)
	beforeInvoices := revisionSnapshot(t, "SELECT COALESCE(jsonb_agg(to_jsonb(ii) ORDER BY ii.id), '[]'::jsonb)::text FROM instance_invoice ii")
	beforeRedemptions := revisionSnapshot(t, "SELECT COALESCE(jsonb_agg(to_jsonb(iv) ORDER BY iv.id), '[]'::jsonb)::text FROM instance_voucher iv")
	beforeContract := revisionSnapshot(t, "SELECT license_capability_contract($1,$2)::text", testDb.DefaultData.OrganizationID, sold.version.ID)
	plan := database.CapabilityRevisionPlan{OrganizationID: testDb.DefaultData.OrganizationID,
		Families: []database.CapabilityRevisionFamily{{FamilyID: sold.version.FamilyID, Vouchers: new(true), Addons: new(true)}}}
	require.NoError(t, database.RunMigrations(testDb.ConnectionString, plan))
	var target uuid.UUID
	var mappingRaw []byte
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), "SELECT target_license_id, price_map FROM license_capability_revision WHERE source_license_id = $1", sold.version.ID).Scan(&target, &mappingRaw))
	var prices map[string]string
	require.NoError(t, json.Unmarshal(mappingRaw, &prices))
	require.Len(t, prices, 2)
	require.JSONEq(t, beforeContract, revisionSnapshot(t, "SELECT license_capability_contract($1,$2)::text", testDb.DefaultData.OrganizationID, target))
	require.JSONEq(t, beforeBilling, revisionSnapshot(t, "SELECT (to_jsonb(ib) - 'base_license_price_id')::text FROM instance_billing ib WHERE instance_id = $1", sold.instance.ID))
	require.JSONEq(t, beforeInstance, revisionSnapshot(t, "SELECT (to_jsonb(i) - 'license_id')::text FROM instance i WHERE id = $1", sold.instance.ID))
	require.JSONEq(t, beforeInvoices, revisionSnapshot(t, "SELECT COALESCE(jsonb_agg(to_jsonb(ii) ORDER BY ii.id), '[]'::jsonb)::text FROM instance_invoice ii"))
	require.JSONEq(t, beforeRedemptions, revisionSnapshot(t, "SELECT COALESCE(jsonb_agg(to_jsonb(iv) ORDER BY iv.id), '[]'::jsonb)::text FROM instance_voucher iv"))
	var captured string
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), "SELECT sale_unit_factor::text FROM license_price WHERE id = $1", prices[meter.ID.String()]).Scan(&captured))
	require.Equal(t, "10", captured)
	var eligible bool
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), "SELECT $1::uuid = ANY(applicable_license_price_ids) AND $2::uuid = ANY(applicable_license_price_ids) FROM voucher WHERE id = $3", sold.monthly.ID, prices[sold.monthly.ID.String()], voucher.ID).Scan(&eligible))
	require.True(t, eligible, "selected-price discount lost its exact equivalent scope")
	// A restarted existing runner must not create another revision or reset periods.
	require.NoError(t, database.RunMigrations(testDb.ConnectionString, plan))
	var revisions int
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), "SELECT count(*) FROM license_capability_revision WHERE source_license_id = $1", sold.version.ID).Scan(&revisions))
	require.Equal(t, 1, revisions)
	require.JSONEq(t, beforeBilling, revisionSnapshot(t, "SELECT (to_jsonb(ib) - 'base_license_price_id')::text FROM instance_billing ib WHERE instance_id = $1", sold.instance.ID))
	// The normal database freeze is still active outside the migration transaction.
	_, err = testServer.Dependencies.DB.Exec(t.Context(), "UPDATE instance SET license_id = $1 WHERE id = $2", sold.version.ID, sold.instance.ID)
	var pgErr *pgconn.PgError
	require.ErrorAs(t, err, &pgErr)
	require.Equal(t, "instance_billing_freeze", pgErr.ConstraintName)
}

func TestCapabilityRevisionPreparationFailureRollsBackCopiedContract(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	sold := newSold(t, flatFee("2900", "MONTHLY"))
	capabilityDefinitions(t, sold.version.Slug)
	// A synthetic storage failure after the successor/its grants have been inserted.
	_, err := testServer.Dependencies.DB.Exec(t.Context(), `CREATE FUNCTION refuse_revision_price() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic revision price failure'; END $$;
 CREATE TRIGGER refuse_revision_price BEFORE INSERT ON license_price FOR EACH ROW EXECUTE FUNCTION refuse_revision_price();`)
	require.NoError(t, err)
	before := revisionSnapshot(t, "SELECT to_jsonb(f)::text FROM license_family f WHERE id = $1", sold.version.FamilyID)
	plan := database.CapabilityRevisionPlan{OrganizationID: testDb.DefaultData.OrganizationID,
		Families: []database.CapabilityRevisionFamily{{FamilyID: sold.version.FamilyID, Vouchers: new(true), Addons: new(true)}}}
	require.ErrorContains(t, database.RunMigrations(testDb.ConnectionString, plan), "synthetic revision price failure")
	require.JSONEq(t, before, revisionSnapshot(t, "SELECT to_jsonb(f)::text FROM license_family f WHERE id = $1", sold.version.FamilyID))
	var revisions, versions int
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), "SELECT count(*) FROM license_capability_revision").Scan(&revisions))
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), "SELECT count(*) FROM license WHERE family_id = $1", sold.version.FamilyID).Scan(&versions))
	require.Zero(t, revisions)
	require.Equal(t, 1, versions)
}

func TestCapabilityRevisionRetainsTrialDebtCancellationAndPendingReferences(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	sold := newSold(t, flatFee("2900", "MONTHLY"))
	capabilityDefinitions(t, sold.version.Slug)
	annual := createPrice(t, sold.version.Slug, flatFee("29000", "ANNUAL"))
	free := createPrice(t, sold.version.Slug, flatFee("0", "MONTHLY"))
	type held struct {
		id    uuid.UUID
		slug  string
		state string
	}
	clients := []held{{sold.instance.ID, sold.instance.Slug, "ACTIVE"}}
	for _, state := range []string{"TRIAL", "PAST_DUE", "INCOMPLETE", "PENDING"} {
		customer := newCustomer(t, fmt.Sprintf("state-%d", len(clients)))
		instance := newInstance(t, state, customer.ID, sold.version.ID)
		clients = append(clients, held{instance.ID, instance.Slug, state})
	}
	before := map[uuid.UUID]string{}
	for _, client := range clients {
		price := sold.monthly.ID
		if client.state == "PENDING" {
			price = free.ID
		}
		command := map[string]any{"basePriceId": price}
		if client.state == "TRIAL" {
			command["trialDays"] = 7
		}
		subscribe(t, client.slug, command)
		var err error
		switch client.state {
		case "ACTIVE":
			_, err = testServer.Dependencies.DB.Exec(t.Context(), "UPDATE instance_billing SET cancel_at_period_end = true, cancel_requested_at = clock_timestamp() WHERE instance_id = $1", client.id)
		case "PAST_DUE":
			_, err = testServer.Dependencies.DB.Exec(t.Context(), "UPDATE instance_billing SET status = 'PAST_DUE', past_due_since = clock_timestamp() - interval '30 days', current_period_start = clock_timestamp() - interval '60 days', current_period_end = clock_timestamp() - interval '30 days', scheduled_license_price_id = $2, scheduled_at = clock_timestamp() WHERE instance_id = $1", client.id, annual.ID)
		case "INCOMPLETE":
			_, err = testServer.Dependencies.DB.Exec(t.Context(), `UPDATE instance_billing SET status = 'INCOMPLETE', pending_license_id = $2,
    pending_selection = '{"addOns":[],"voucher":null}', incomplete_expires_at = anchor_at + interval '23 hours' WHERE instance_id = $1`, client.id, sold.version.ID)
		case "PENDING":
			_, err = testServer.Dependencies.DB.Exec(t.Context(), `UPDATE instance_billing SET pending_license_id = $2,
    pending_selection = jsonb_build_object('licensePriceId', $3::text, 'addOns', '[]'::jsonb, 'voucher', NULL),
    incomplete_expires_at = anchor_at + interval '23 hours' WHERE instance_id = $1`, client.id, sold.version.ID, annual.ID.String())
		}
		require.NoError(t, err)
		before[client.id] = revisionSnapshot(t, `SELECT (to_jsonb(ib) - ARRAY['base_license_price_id','scheduled_license_price_id','pending_license_id','pending_selection'])::text
   FROM instance_billing ib WHERE instance_id = $1`, client.id)
	}
	trials := revisionSnapshot(t, "SELECT COALESCE(jsonb_agg(to_jsonb(ct) ORDER BY ct.customer_id), '[]'::jsonb)::text FROM customer_trial ct")
	plan := database.CapabilityRevisionPlan{OrganizationID: testDb.DefaultData.OrganizationID,
		Families: []database.CapabilityRevisionFamily{{FamilyID: sold.version.FamilyID, Vouchers: new(true), Addons: new(true)}}}
	require.NoError(t, database.RunMigrations(testDb.ConnectionString, plan))
	var target uuid.UUID
	var annualTarget string
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), "SELECT target_license_id, price_map ->> $2 FROM license_capability_revision WHERE source_license_id = $1", sold.version.ID, annual.ID.String()).Scan(&target, &annualTarget))
	for _, client := range clients {
		require.JSONEq(t, before[client.id], revisionSnapshot(t, `SELECT (to_jsonb(ib) - ARRAY['base_license_price_id','scheduled_license_price_id','pending_license_id','pending_selection'])::text
   FROM instance_billing ib WHERE instance_id = $1`, client.id), client.state)
	}
	require.JSONEq(t, trials, revisionSnapshot(t, "SELECT COALESCE(jsonb_agg(to_jsonb(ct) ORDER BY ct.customer_id), '[]'::jsonb)::text FROM customer_trial ct"))
	var pendingPrice string
	var pendingLicense uuid.UUID
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), "SELECT pending_selection ->> 'licensePriceId', pending_license_id FROM instance_billing WHERE instance_id = $1", clients[4].id).Scan(&pendingPrice, &pendingLicense))
	require.Equal(t, annualTarget, pendingPrice)
	require.Equal(t, target, pendingLicense)
	var scheduled string
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), "SELECT scheduled_license_price_id::text FROM instance_billing WHERE instance_id = $1", clients[2].id).Scan(&scheduled))
	require.Equal(t, annualTarget, scheduled)
}

func TestCapabilityRevisionResumesMoreThanOneClientBatch(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	sold := newSold(t, flatFee("0", "MONTHLY"))
	capabilityDefinitions(t, sold.version.Slug)
	customer := newCustomer(t, "batch")
	for i := range 201 {
		newInstance(t, fmt.Sprintf("batch-%d", i), customer.ID, sold.version.ID)
	}
	plan := database.CapabilityRevisionPlan{OrganizationID: testDb.DefaultData.OrganizationID,
		Families: []database.CapabilityRevisionFamily{{FamilyID: sold.version.FamilyID, Vouchers: new(true), Addons: new(true)}}}
	require.NoError(t, database.RunMigrations(testDb.ConnectionString, plan))
	var remaining, migrated int
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), "SELECT count(*) FROM instance WHERE license_id = $1", sold.version.ID).Scan(&remaining))
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), "SELECT count(*) FROM instance WHERE license_id = (SELECT target_license_id FROM license_capability_revision WHERE source_license_id = $1)", sold.version.ID).Scan(&migrated))
	require.Zero(t, remaining)
	require.Equal(t, 202, migrated)
}

func TestCapabilityRevisionCreatesMissingDefinitionsThroughExistingRunner(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	sold := newSold(t, flatFee("0", "MONTHLY"))
	plan := database.CapabilityRevisionPlan{OrganizationID: testDb.DefaultData.OrganizationID,
		Families: []database.CapabilityRevisionFamily{{FamilyID: sold.version.FamilyID, Vouchers: new(false), Addons: new(false)}}}
	require.NoError(t, database.RunMigrations(testDb.ConnectionString, plan))
	var grants int
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT count(*) FROM license_entitlement le JOIN entitlement e ON e.id = le.entitlement_id
  WHERE le.license_id = (SELECT target_license_id FROM license_capability_revision WHERE source_license_id = $1)
   AND e.organization_id = $2 AND e.slug IN ('vouchers','addons') AND e.type = 'BOOLEAN' AND le.value = '{"type":"boolean","value":false}'`, sold.version.ID, plan.OrganizationID).Scan(&grants))
	require.Equal(t, 2, grants, "absent grants are not explicit Starter false grants")
}

func TestCapabilityRevisionRefusesWrongDefinitionBeforeAnyContractWrites(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	sold := newSold(t, flatFee("0", "MONTHLY"))
	commonfixture.AssertJSONResponse[map[string]any](t, call(t, "POST", "/api/entitlements", map[string]any{
		"name": "Existing config", "slug": "addons", "description": "Existing config", "type": "CONFIG",
	}), fiber.StatusCreated)
	before := revisionSnapshot(t, "SELECT to_jsonb(f)::text FROM license_family f WHERE id = $1", sold.version.FamilyID)
	plan := database.CapabilityRevisionPlan{OrganizationID: testDb.DefaultData.OrganizationID,
		Families: []database.CapabilityRevisionFamily{{FamilyID: sold.version.FamilyID, Vouchers: new(true), Addons: new(true)}}}
	require.ErrorContains(t, database.RunMigrations(testDb.ConnectionString, plan), "existing definitions cannot be replaced")
	require.JSONEq(t, before, revisionSnapshot(t, "SELECT to_jsonb(f)::text FROM license_family f WHERE id = $1", sold.version.FamilyID))
	var definitions int
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), "SELECT count(*) FROM entitlement WHERE organization_id = $1 AND slug IN ('vouchers','addons')", plan.OrganizationID).Scan(&definitions))
	require.Equal(t, 1, definitions, "the other definition must not be created before a wrong type is refused")
}

func TestCapabilityRevisionPreservesArchivedSourceLifecycleAndHolder(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	sold := newSold(t, flatFee("0", "MONTHLY"))
	capabilityDefinitions(t, sold.version.Slug)
	_, err := testServer.Dependencies.DB.Exec(t.Context(), "UPDATE license SET is_default = false, lifecycle_state = 'ARCHIVED' WHERE id = $1", sold.version.ID)
	require.NoError(t, err)
	before := revisionSnapshot(t, "SELECT license_capability_contract($1,$2)::text", testDb.DefaultData.OrganizationID, sold.version.ID)
	plan := database.CapabilityRevisionPlan{OrganizationID: testDb.DefaultData.OrganizationID,
		Families: []database.CapabilityRevisionFamily{{FamilyID: sold.version.FamilyID, Vouchers: new(true), Addons: new(true)}}}
	require.NoError(t, database.RunMigrations(testDb.ConnectionString, plan))
	var target uuid.UUID
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), "SELECT license_id FROM instance WHERE id = $1", sold.instance.ID).Scan(&target))
	require.NotEqual(t, sold.version.ID, target)
	require.JSONEq(t, before, revisionSnapshot(t, "SELECT license_capability_contract($1,$2)::text", plan.OrganizationID, target))
}

func TestCapabilityRevisionKeepsHeterogeneousSameFamilyContractsSeparate(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	old := newSold(t, flatFee("2900", "MONTHLY"))
	capabilityDefinitions(t, old.version.Slug)
	newEntitlement(t, "seats", 0)
	grant(t, old.version.Slug, "seats", 30, 25)
	current := commonfixture.AssertJSONResponse[licenseschema.License](t, call(t, "POST", "/api/licenses", map[string]any{
		"name": "Pro current", "description": "Different sold terms", "type": "PAID", "familyId": old.version.FamilyID,
		"isDefault": true, "lifecycleState": "PUBLISHED",
	}), fiber.StatusCreated)
	grant(t, current.Slug, "seats", 70, 10)
	for _, slug := range []string{"vouchers", "addons"} {
		response := call(t, "POST", "/api/licenses/"+current.Slug+"/entitlements", map[string]any{
			"entitlementSlug": slug, "value": map[string]any{"type": "boolean", "value": false},
		})
		require.Contains(t, []int{fiber.StatusOK, fiber.StatusCreated, fiber.StatusNoContent}, response.StatusCode)
	}
	price := createPrice(t, current.Slug, flatFee("4900", "MONTHLY"))
	customer := newCustomer(t, "current")
	instance := newInstance(t, "Current contract", customer.ID, current.ID)
	subscribe(t, old.instance.Slug, map[string]any{"basePriceId": old.monthly.ID})
	subscribe(t, instance.Slug, map[string]any{"basePriceId": price.ID})
	oldContract := revisionSnapshot(t, "SELECT license_capability_contract($1,$2)::text", testDb.DefaultData.OrganizationID, old.version.ID)
	currentContract := revisionSnapshot(t, "SELECT license_capability_contract($1,$2)::text", testDb.DefaultData.OrganizationID, current.ID)
	plan := database.CapabilityRevisionPlan{OrganizationID: testDb.DefaultData.OrganizationID,
		Families: []database.CapabilityRevisionFamily{{FamilyID: old.version.FamilyID, Vouchers: new(true), Addons: new(true)}}}
	require.NoError(t, database.RunMigrations(testDb.ConnectionString, plan))
	var oldTarget, currentTarget uuid.UUID
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), "SELECT license_id FROM instance WHERE id=$1", old.instance.ID).Scan(&oldTarget))
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), "SELECT license_id FROM instance WHERE id=$1", instance.ID).Scan(&currentTarget))
	require.NotEqual(t, oldTarget, currentTarget, "different contracts must not collapse onto the latest contract")
	require.JSONEq(t, oldContract, revisionSnapshot(t, "SELECT license_capability_contract($1,$2)::text", plan.OrganizationID, oldTarget))
	require.JSONEq(t, currentContract, revisionSnapshot(t, "SELECT license_capability_contract($1,$2)::text", plan.OrganizationID, currentTarget))
	var defaultID uuid.UUID
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), "SELECT id FROM license WHERE family_id=$1 AND is_default", old.version.FamilyID).Scan(&defaultID))
	require.Equal(t, currentTarget, defaultID, "historical successors must not become the current offer")
}
