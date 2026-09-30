package licenses_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	licenseEvents "github.com/kaitencloud/kaiten/api/internal/modules/licenses/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// TestLicenseFamilyEvents pins the three family events. A family is
// announced when its first version opens it, whenever it comes to serve
// another version or none, and when its last version takes it away -- and a
// write that leaves the version it serves where it was announces nothing, so
// the audit trail records the product's moves without an echo of every
// version write.
func TestLicenseFamilyEvents(t *testing.T) {
	t.Run("AFirstVersionOpensTheFamily", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		seen := outboxEventIDs(t)

		createLicenseOverHTTP(t, familyVersion("pro", ""))

		require.Equal(t, []familyEvent{
			{licenseEvents.LicenseFamilyCreated.Name, "pro", "pro", 1},
		}, familyEventsSince(t, seen))
	})

	t.Run("ADraftFirstVersionOpensAFamilyServingNothing", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		seen := outboxEventIDs(t)

		draft := familyVersion("pro", "")
		draft["lifecycleState"] = "DRAFT"
		createLicenseOverHTTP(t, draft)

		require.Equal(t, []familyEvent{
			{licenseEvents.LicenseFamilyCreated.Name, "pro", "", 1},
		}, familyEventsSince(t, seen))
	})

	t.Run("ANewerPublishedVersionMovesTheFamily", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		createLicenseOverHTTP(t, familyVersion("pro", ""))
		seen := outboxEventIDs(t)

		createLicenseOverHTTP(t, familyVersion("", "pro"))

		require.Equal(t, []familyEvent{
			{licenseEvents.LicenseFamilyUpdated.Name, "pro", "pro-v2", 2},
		}, familyEventsSince(t, seen))
	})

	t.Run("ADraftVersionLeavesTheFamilyWhereItWas", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		createLicenseOverHTTP(t, familyVersion("pro", ""))
		seen := outboxEventIDs(t)

		draft := familyVersion("", "pro")
		draft["lifecycleState"] = "DRAFT"
		createLicenseOverHTTP(t, draft)

		require.Empty(t, familyEventsSince(t, seen))
	})

	t.Run("TakingAndGivingUpTheDefault", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		v1 := createLicenseOverHTTP(t, familyVersion("pro", ""))
		v2 := createLicenseOverHTTP(t, familyVersion("", "pro"))

		// v2 serves as the highest published version; v1 taking the default
		// moves the family back to it.
		seen := outboxEventIDs(t)
		setDefault(t, v1, true)
		require.Equal(t, []familyEvent{
			{licenseEvents.LicenseFamilyUpdated.Name, "pro", v1.Slug, 2},
		}, familyEventsSince(t, seen))

		// Restating the default, or renaming the version the family serves,
		// moves nothing.
		seen = outboxEventIDs(t)
		setDefault(t, v1, true)
		updateLicenseOverHTTP(t, v1.Slug, map[string]any{
			"name": "Pro renamed", "description": v1.Description, "type": v1.Type, "isDefault": true,
		})
		require.Empty(t, familyEventsSince(t, seen))

		// Giving the default up hands the family back to its highest
		// published version.
		seen = outboxEventIDs(t)
		setDefault(t, v1, false)
		require.Equal(t, []familyEvent{
			{licenseEvents.LicenseFamilyUpdated.Name, "pro", v2.Slug, 2},
		}, familyEventsSince(t, seen))
	})

	t.Run("TransitionsMoveTheFamily", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		v1 := createLicenseOverHTTP(t, familyVersion("pro", ""))
		v2 := createLicenseOverHTTP(t, familyVersion("", "pro"))
		draft := familyVersion("", "pro")
		draft["lifecycleState"] = "DRAFT"
		v3 := createLicenseOverHTTP(t, draft)

		moves := []struct {
			op      string
			slug    string
			serving string
		}{
			{"archive", v2.Slug, v1.Slug},
			{"unarchive", v2.Slug, v2.Slug},
			{"publish", v3.Slug, v3.Slug},
		}
		for _, move := range moves {
			seen := outboxEventIDs(t)
			transition[schema.License](t, move.slug, move.op, fiber.StatusOK)
			require.Equal(t, []familyEvent{
				{licenseEvents.LicenseFamilyUpdated.Name, "pro", move.serving, 3},
			}, familyEventsSince(t, seen), "%s %s", move.op, move.slug)
		}

		// Archiving a version the family does not serve moves nothing.
		seen := outboxEventIDs(t)
		transition[schema.License](t, v1.Slug, "archive", fiber.StatusOK)
		require.Empty(t, familyEventsSince(t, seen))
	})

	t.Run("ArchivingTheOnlyPublishedVersionLeavesTheFamilyServingNothing", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		v1 := createLicenseOverHTTP(t, familyVersion("pro", ""))
		seen := outboxEventIDs(t)

		transition[schema.License](t, v1.Slug, "archive", fiber.StatusOK)

		require.Equal(t, []familyEvent{
			{licenseEvents.LicenseFamilyUpdated.Name, "pro", "", 1},
		}, familyEventsSince(t, seen))
	})

	t.Run("DeletingVersions", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		v1 := createLicenseOverHTTP(t, familyVersion("pro", ""))
		v2 := createLicenseOverHTTP(t, familyVersion("", "pro"))
		v3 := createLicenseOverHTTP(t, familyVersion("", "pro"))

		// A version the family does not serve goes quietly.
		seen := outboxEventIDs(t)
		deleteLicenseOverHTTP(t, v2.Slug)
		require.Empty(t, familyEventsSince(t, seen))

		// The version it serves goes, and the family falls back.
		seen = outboxEventIDs(t)
		deleteLicenseOverHTTP(t, v3.Slug)
		require.Equal(t, []familyEvent{
			{licenseEvents.LicenseFamilyUpdated.Name, "pro", v1.Slug, 1},
		}, familyEventsSince(t, seen))

		// The last version takes the family, which is announced as it stood.
		seen = outboxEventIDs(t)
		deleteLicenseOverHTTP(t, v1.Slug)
		require.Equal(t, []familyEvent{
			{licenseEvents.LicenseFamilyDeleted.Name, "pro", v1.Slug, 1},
		}, familyEventsSince(t, seen))
	})
}

// familyEvent is one family event as a subscriber reads it: which event, the
// family it names, the slug of the version the family serves in it ("" for
// none), and how many versions the family has.
type familyEvent struct {
	Name         string
	Family       string
	Serving      string
	VersionCount int32
}

func isFamilyEvent(name string) bool {
	switch name {
	case licenseEvents.LicenseFamilyCreated.Name,
		licenseEvents.LicenseFamilyUpdated.Name,
		licenseEvents.LicenseFamilyDeleted.Name:
		return true
	}
	return false
}

// familyEventsSince returns the family events recorded after seen was taken.
func familyEventsSince(t *testing.T, seen map[uuid.UUID]struct{}) []familyEvent {
	t.Helper()
	var found []familyEvent
	for _, event := range commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID) {
		if _, old := seen[event.ID]; old || !isFamilyEvent(event.EventName) {
			continue
		}
		var view schema.LicenseFamilyView
		require.NoError(t, json.Unmarshal(event.Data, &view))
		serving := ""
		if view.CurrentVersion != nil {
			serving = view.CurrentVersion.Slug
		}
		found = append(found, familyEvent{event.EventName, view.Slug, serving, view.VersionCount})
	}
	return found
}

// familyVersion is a create body: a new family slugged slug, or a new version
// of the family slugged familySlug.
func familyVersion(slug, familySlug string) map[string]any {
	body := map[string]any{"name": "Pro", "description": "a version", "type": "PAID", "isDefault": false}
	if slug != "" {
		body["slug"] = slug
	}
	if familySlug != "" {
		body["familySlug"] = familySlug
	}
	return body
}

func setDefault(t *testing.T, license *schema.License, isDefault bool) {
	t.Helper()
	updateLicenseOverHTTP(t, license.Slug, map[string]any{
		"name": license.Name, "description": license.Description, "type": license.Type, "isDefault": isDefault,
	})
}

func deleteLicenseOverHTTP(t *testing.T, slug string) {
	t.Helper()
	req := httptest.NewRequest(http.MethodDelete, "/api/licenses/"+slug, nil)
	resp, err := testServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)
	require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
}
