package instances_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	instanceEvents "github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// rawReport sends body, verbatim, as a usage report and reads the response.
func rawReport(t *testing.T, instanceSlug, entitlementSlug, body string) (*http.Response, []byte) {
	t.Helper()
	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost,
		"/api/instances/"+instanceSlug+"/entitlements/"+entitlementSlug+"/usage", strings.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := testServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)
	payload, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	return resp, payload
}

// metadataReport is a report of 1 carrying metadata, and optionally a key.
func metadataReport(metadata, transactionID string) string {
	body := `{"value":{"type":"number","value":1},"behavior":"append","metadata":` + metadata
	if transactionID != "" {
		body += `,"transactionId":"` + transactionID + `"`
	}
	return body + `}`
}

// storedProperties returns the properties of the pair's last journal row as
// jsonb text, "" when NULL.
func storedProperties(t *testing.T, instanceID, entitlementID uuid.UUID) string {
	t.Helper()
	var properties *string
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `
		SELECT properties::text FROM usage_ledger
		WHERE instance_id = $1 AND entitlement_id = $2
		ORDER BY report_seq DESC LIMIT 1`, instanceID, entitlementID).Scan(&properties))
	if properties == nil {
		return ""
	}
	return *properties
}

// propertiesEqual reports whether the pair's last row stores exactly want, as
// JSON values.
func propertiesEqual(t *testing.T, instanceID, entitlementID uuid.UUID, want string) bool {
	t.Helper()
	var equal bool
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `
		SELECT properties = $3::jsonb FROM usage_ledger
		WHERE instance_id = $1 AND entitlement_id = $2
		ORDER BY report_seq DESC LIMIT 1`, instanceID, entitlementID, want).Scan(&equal))
	return equal
}

func TestReportEntitlementUsageMetric_Metadata(t *testing.T) {
	t.Run("WhenMetadataIsAtMost4KiB_ItIsStoredOnTheRow", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000)

		// {"k":"aaa…"} encodes to exactly 4096 bytes.
		exactly := `{"k":"` + strings.Repeat("a", 4096-8) + `"}`
		resp, body := rawReport(t, instances[0].Slug, entitlement.Slug, metadataReport(exactly, ""))
		require.Equal(t, fiber.StatusOK, resp.StatusCode, "body: %s", body)
		require.Empty(t, resp.Header.Get("Kaiten-Metadata-Dropped"))
		require.True(t, propertiesEqual(t, instances[0].ID, entitlement.ID, exactly))

		resp, body = rawReport(t, instances[0].Slug, entitlement.Slug, metadataReport(`{"model":"gpt-x","tokens":{"in":12,"out":30}}`, ""))
		require.Equal(t, fiber.StatusOK, resp.StatusCode, "body: %s", body)
		require.True(t, propertiesEqual(t, instances[0].ID, entitlement.ID, `{"model":"gpt-x","tokens":{"in":12,"out":30}}`))
	})

	t.Run("WhenMetadataIsAbove4KiB_TheReportCountsWithoutIt", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000)

		tooLarge := `{"k":"` + strings.Repeat("a", 4096-7) + `"}`
		resp, body := rawReport(t, instances[0].Slug, entitlement.Slug, metadataReport(tooLarge, ""))
		require.Equal(t, fiber.StatusOK, resp.StatusCode, "body: %s", body)
		require.Equal(t, "too_large", resp.Header.Get("Kaiten-Metadata-Dropped"))

		require.Len(t, ledgerRows(t, instances[0].ID, entitlement.ID), 1, "the report counted")
		require.Empty(t, storedProperties(t, instances[0].ID, entitlement.ID), "its metadata was not stored")
	})

	t.Run("WhenThereIsNoMetadata_NothingIsStored", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000)

		resp, _ := rawReport(t, instances[0].Slug, entitlement.Slug, `{"value":{"type":"number","value":1},"behavior":"append"}`)
		require.Equal(t, fiber.StatusOK, resp.StatusCode)
		require.Empty(t, storedProperties(t, instances[0].ID, entitlement.ID))

		resp, _ = rawReport(t, instances[0].Slug, entitlement.Slug, metadataReport(`{}`, ""))
		require.Equal(t, fiber.StatusOK, resp.StatusCode)
		require.Empty(t, storedProperties(t, instances[0].ID, entitlement.ID), "an empty object is stored as NULL")

		resp, _ = rawReport(t, instances[0].Slug, entitlement.Slug, metadataReport(`"not an object"`, ""))
		require.Equal(t, fiber.StatusUnprocessableEntity, resp.StatusCode, "metadata must be an object")
		require.Len(t, ledgerRows(t, instances[0].ID, entitlement.ID), 2)
	})

	t.Run("WhenMetadataHoldsAHugeNumber_ItIsStoredRatherThanRefused", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000)

		// 1e300 is 6 bytes as sent and 301 digits as jsonb renders it. Many of
		// them in a small object must neither pass the 4 KiB rule by their
		// short spelling and then trip the column's CHECK (a 500), nor be lost.
		resp, body := rawReport(t, instances[0].Slug, entitlement.Slug, metadataReport(`{"a":1e300,"b":1e-300}`, ""))
		require.Equal(t, fiber.StatusOK, resp.StatusCode, "body: %s", body)
		require.True(t, propertiesEqual(t, instances[0].ID, entitlement.ID, `{"a":1e300,"b":1e-300}`))

		many := make([]string, 0, 20)
		for i := range 20 {
			many = append(many, `"n`+strings.Repeat("x", i)+`":1e300`)
		}
		resp, body = rawReport(t, instances[0].Slug, entitlement.Slug, metadataReport(`{`+strings.Join(many, ",")+`}`, ""))
		require.Equal(t, fiber.StatusOK, resp.StatusCode, "body: %s", body)
		require.Equal(t, "too_large", resp.Header.Get("Kaiten-Metadata-Dropped"), "20 numbers of 301 digits are above 4 KiB")
	})

	t.Run("WhenMetadataIsStored_ItStaysOutOfResponsesAndEvents", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000)

		resp, body := rawReport(t, instances[0].Slug, entitlement.Slug, metadataReport(`{"secret-ish":"canary-7f3a"}`, ""))
		require.Equal(t, fiber.StatusOK, resp.StatusCode)
		require.NotContains(t, string(body), "canary-7f3a")

		gauge := readUsage(t, instances[0].Slug, entitlement.Slug)
		raw, err := json.Marshal(gauge)
		require.NoError(t, err)
		require.NotContains(t, string(raw), "canary-7f3a")

		for _, event := range commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID) {
			require.NotContains(t, string(event.Data), "canary-7f3a", "event %s carries the metadata", event.EventName)
		}
		require.Equal(t, 1, countOutboxEvents(t, instanceEvents.EntitlementUsageReportAccepted.Name))
	})

	t.Run("WhenTheReportIsRejected_ItsMetadataIsStoredNowhere", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 0)

		resp, _ := rawReport(t, instances[0].Slug, entitlement.Slug, metadataReport(`{"why":"canary-rejected"}`, ""))
		require.Equal(t, fiber.StatusConflict, resp.StatusCode)
		require.Empty(t, ledgerRows(t, instances[0].ID, entitlement.ID))
		for _, event := range commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID) {
			require.NotContains(t, string(event.Data), "canary-rejected")
		}
	})

	t.Run("WhenAReportIsReplayed_ItsMetadataIsIgnored", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000)

		resp, _ := rawReport(t, instances[0].Slug, entitlement.Slug, metadataReport(`{"attempt":1}`, "evt-meta"))
		require.Equal(t, fiber.StatusOK, resp.StatusCode)

		resp, _ = rawReport(t, instances[0].Slug, entitlement.Slug, metadataReport(`{"attempt":2}`, "evt-meta"))
		require.Equal(t, "true", resp.Header.Get("Idempotent-Replayed"), "metadata is not part of the comparison")
		require.True(t, propertiesEqual(t, instances[0].ID, entitlement.ID, `{"attempt":1}`))

		// A report whose metadata was dropped replays without the header.
		tooLarge := `{"k":"` + strings.Repeat("a", 4096) + `"}`
		resp, _ = rawReport(t, instances[0].Slug, entitlement.Slug, metadataReport(tooLarge, "evt-big"))
		require.Equal(t, "too_large", resp.Header.Get("Kaiten-Metadata-Dropped"))
		resp, _ = rawReport(t, instances[0].Slug, entitlement.Slug, metadataReport(tooLarge, "evt-big"))
		require.Equal(t, "true", resp.Header.Get("Idempotent-Replayed"))
		require.Empty(t, resp.Header.Get("Kaiten-Metadata-Dropped"), "a replay never carries the header")
	})
}
