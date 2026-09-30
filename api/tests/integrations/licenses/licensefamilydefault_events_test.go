package licenses_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	licenseEvents "github.com/kaitencloud/kaiten/api/internal/modules/licenses/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// TestFamilyDefaultHandover_AnnouncesTheVersionThatLostIt pins that moving a
// family's default is announced on both sides. The version losing the flag is
// changed as much as the one gaining it -- a catalogue keyed on isDefault has
// to hear about both -- so it gets a new updated_at and a LICENSE_UPDATED of
// its own, in the same transaction as the write that moved the default.
func TestFamilyDefaultHandover_AnnouncesTheVersionThatLostIt(t *testing.T) {
	t.Run("CreatingANewDefault", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		previous := createLicenseOverHTTP(t, map[string]any{
			"name": "Handover", "slug": "handover", "description": "v1", "type": "PAID", "isDefault": true,
		})
		backdate(t, previous.Slug)
		seen := outboxEventIDs(t)

		created := createLicenseOverHTTP(t, map[string]any{
			"name": "Handover", "familySlug": "handover", "description": "v2", "type": "PAID", "isDefault": true,
		})

		events := licenseEventsSince(t, seen)
		require.Len(t, events, 2)
		require.Equal(t, announced{licenseEvents.LicenseUpdated.Name, previous.Slug, false}, events[previous.Slug])
		require.Equal(t, announced{licenseEvents.LicenseCreated.Name, created.Slug, true}, events[created.Slug])
		requireTouched(t, previous.Slug)
	})

	t.Run("UpdatingAnotherVersionIntoTheDefault", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		previous := createLicenseOverHTTP(t, map[string]any{
			"name": "Handover", "slug": "handover", "description": "v1", "type": "PAID", "isDefault": true,
		})
		next := createLicenseOverHTTP(t, map[string]any{
			"name": "Handover", "familySlug": "handover", "description": "v2", "type": "PAID", "isDefault": false,
		})
		backdate(t, previous.Slug)
		seen := outboxEventIDs(t)

		updateLicenseOverHTTP(t, next.Slug, map[string]any{
			"name": next.Name, "description": next.Description, "type": next.Type, "isDefault": true,
		})

		events := licenseEventsSince(t, seen)
		require.Len(t, events, 2)
		require.Equal(t, announced{licenseEvents.LicenseUpdated.Name, previous.Slug, false}, events[previous.Slug])
		require.Equal(t, announced{licenseEvents.LicenseUpdated.Name, next.Slug, true}, events[next.Slug])
		requireTouched(t, previous.Slug)
	})

	// The version already holding the default keeps it: nothing moved, so
	// nothing else is announced.
	t.Run("RestatingTheDefaultAnnouncesOnlyTheUpdate", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		current := createLicenseOverHTTP(t, map[string]any{
			"name": "Handover", "slug": "handover", "description": "v1", "type": "PAID", "isDefault": true,
		})
		seen := outboxEventIDs(t)

		updateLicenseOverHTTP(t, current.Slug, map[string]any{
			"name": current.Name, "description": "v1, reworded", "type": current.Type, "isDefault": true,
		})

		events := licenseEventsSince(t, seen)
		require.Len(t, events, 1)
		require.Equal(t, announced{licenseEvents.LicenseUpdated.Name, current.Slug, true}, events[current.Slug])
	})

	t.Run("AFamilyWithoutADefaultHasNothingToAnnounce", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		createLicenseOverHTTP(t, map[string]any{
			"name": "Handover", "slug": "handover", "description": "v1", "type": "PAID", "isDefault": false,
		})
		seen := outboxEventIDs(t)

		created := createLicenseOverHTTP(t, map[string]any{
			"name": "Handover", "familySlug": "handover", "description": "v2", "type": "PAID", "isDefault": true,
		})

		events := licenseEventsSince(t, seen)
		require.Len(t, events, 1)
		require.Equal(t, announced{licenseEvents.LicenseCreated.Name, created.Slug, true}, events[created.Slug])
	})
}

// TestFamilyDefaultHandover_ARefusedClaimMovesNothing covers the rollback the
// handover depends on. Clearing the previous default runs before the write
// that claims it, and a draft may not be a default, so that write fails on
// license_default_must_be_published_check after the clear has happened. The
// transaction has to take the clear and its LICENSE_UPDATED back with it: the
// family keeps its default, untouched, and nothing is announced.
func TestFamilyDefaultHandover_ARefusedClaimMovesNothing(t *testing.T) {
	t.Run("CreatingADraftDefault", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		current := createLicenseOverHTTP(t, map[string]any{
			"name": "Handover", "slug": "handover", "description": "v1", "type": "PAID", "isDefault": true,
		})
		backdate(t, current.Slug)
		seen := outboxEventIDs(t)

		problem := sendLicenseWrite(t, http.MethodPost, "/api/licenses", map[string]any{
			"name": "Handover", "familySlug": "handover", "description": "v2", "type": "PAID",
			"isDefault": true, "lifecycleState": "DRAFT",
		}, fiber.StatusConflict)

		require.Equal(t, "CreateLicense.DefaultMustBePublished", problem.Code)
		requireUntouchedDefault(t, current.Slug, seen)
		require.Equal(t, 1, countDefaultsInFamily(t, current.Slug))
		require.Equal(t, int32(1), getFamily(t, "handover", "").VersionCount, "the draft was not written")
	})

	t.Run("UpdatingADraftIntoTheDefault", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		current := createLicenseOverHTTP(t, map[string]any{
			"name": "Handover", "slug": "handover", "description": "v1", "type": "PAID", "isDefault": true,
		})
		draft := createLicenseOverHTTP(t, map[string]any{
			"name": "Handover", "familySlug": "handover", "description": "v2", "type": "PAID",
			"isDefault": false, "lifecycleState": "DRAFT",
		})
		backdate(t, current.Slug)
		seen := outboxEventIDs(t)

		problem := sendLicenseWrite(t, http.MethodPut, "/api/licenses/"+draft.Slug, map[string]any{
			"name": draft.Name, "description": draft.Description, "type": draft.Type, "isDefault": true,
		}, fiber.StatusConflict)

		require.Equal(t, "UpdateLicense.DefaultMustBePublished", problem.Code)
		requireUntouchedDefault(t, current.Slug, seen)
		require.False(t, isDefault(t, draft.Slug))
	})
}

// announced is what a test compares of one license event: its name, and the
// version and default flag its payload carries.
type announced struct {
	Name      string
	Slug      string
	IsDefault bool
}

func createLicenseOverHTTP(t *testing.T, body map[string]any) *schema.License {
	t.Helper()
	req := commonfixture.NewJSONRequest(t, http.MethodPost, "/api/licenses", body)
	resp, err := testServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)
	return commonfixture.AssertJSONResponse[*schema.License](t, resp, fiber.StatusCreated)
}

func updateLicenseOverHTTP(t *testing.T, slug string, body map[string]any) {
	t.Helper()
	req := commonfixture.NewJSONRequest(t, http.MethodPut, "/api/licenses/"+slug, body)
	resp, err := testServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)
	require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
}

func outboxEventIDs(t *testing.T) map[uuid.UUID]struct{} {
	t.Helper()
	ids := make(map[uuid.UUID]struct{})
	for _, event := range commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID) {
		ids[event.ID] = struct{}{}
	}
	return ids
}

// licenseEventsSince returns the version events recorded after seen was taken,
// keyed by the version their payload carries. Events written in one transaction
// share their timestamp, so their order is not part of the contract.
func licenseEventsSince(t *testing.T, seen map[uuid.UUID]struct{}) map[string]announced {
	t.Helper()
	events := make(map[string]announced)
	for _, event := range commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID) {
		// The family's own events carry the family, not a version; they are
		// pinned in licensefamily_events_test.go.
		if _, old := seen[event.ID]; old || isFamilyEvent(event.EventName) {
			continue
		}
		var data schema.License
		require.NoError(t, json.Unmarshal(event.Data, &data))
		require.NotContains(t, events, data.Slug, "one event per version per write")
		events[data.Slug] = announced{Name: event.EventName, Slug: data.Slug, IsDefault: data.IsDefault}
	}
	return events
}

// backdate moves a version's updated_at into the past, so that a write
// touching it is visible even when it lands in the same millisecond.
func backdate(t *testing.T, slug string) {
	t.Helper()
	_, err := testServer.Dependencies.DB.Exec(t.Context(),
		`UPDATE license SET updated_at = '2020-01-01' WHERE slug = $1 AND organization_id = $2`,
		slug, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
}

func requireTouched(t *testing.T, slug string) {
	t.Helper()
	var touched bool
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(),
		`SELECT updated_at > '2020-01-02' FROM license WHERE slug = $1 AND organization_id = $2`,
		slug, testDb.DefaultData.OrganizationID).Scan(&touched))
	require.True(t, touched, "the version that lost the default must get a new updated_at")
}

// sendLicenseWrite sends a write expected to be refused with wantStatus and
// returns the problem.
func sendLicenseWrite(t *testing.T, method, url string, body map[string]any, wantStatus int) kaitenerrors.Problem {
	t.Helper()
	req := commonfixture.NewJSONRequest(t, method, url, body)
	resp, err := testServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)
	return commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, resp, wantStatus)
}

// requireUntouchedDefault checks that a refused write left slug the family's
// default, with the updated_at backdate gave it, and recorded no event.
func requireUntouchedDefault(t *testing.T, slug string, seen map[uuid.UUID]struct{}) {
	t.Helper()
	require.True(t, isDefault(t, slug), "the family must keep its default")

	var untouched bool
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(),
		`SELECT updated_at = '2020-01-01' FROM license WHERE slug = $1 AND organization_id = $2`,
		slug, testDb.DefaultData.OrganizationID).Scan(&untouched))
	require.True(t, untouched, "the rolled-back clear must not leave a new updated_at behind")

	require.Empty(t, licenseEventsSince(t, seen), "a refused write announces nothing")
}
