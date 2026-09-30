package commonfixture

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	outboxdb "github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox/db"
)

// ListOutboxEvents returns every outbox event recorded for organizationID.
// The outbox table is cross-cutting infrastructure (see
// internal/infrastructure/outbox), not owned by any one business module, so
// tests across every module share this helper instead of each importing
// outbox's generated db package directly.
func ListOutboxEvents(t *testing.T, pool *pgxpool.Pool, organizationID uuid.UUID) []outboxdb.OutboxEvent {
	t.Helper()
	events, err := outboxdb.New(pool).ListOutboxEvents(context.Background(), organizationID)
	require.NoError(t, err)
	return events
}

// RowSnapshot runs a query expected to yield a single JSON document --
// typically `SELECT to_jsonb(x) FROM <table> x WHERE ...` -- and returns it
// verbatim. Tenant-isolation tests snapshot a NEIGHBOURING organization's
// row before and after a write performed by another organization and
// require the two to be identical: asserting only that the acting tenant's
// row changed does not catch a WHERE clause that matched both tenants at
// once, which is exactly how an unscoped write goes unnoticed.
func RowSnapshot(t *testing.T, pool *pgxpool.Pool, query string, args ...any) string {
	t.Helper()
	var snapshot []byte
	require.NoError(t, pool.QueryRow(context.Background(), query, args...).Scan(&snapshot))
	return string(snapshot)
}

func NewJSONRequest(t *testing.T, method, url string, payload any, headers ...map[string]string) *http.Request {
	t.Helper()

	var bodyReader *bytes.Reader
	if payload != nil {
		bodyBytes, err := json.Marshal(payload)
		require.NoError(t, err)
		bodyReader = bytes.NewReader(bodyBytes)

		logBodyOnFailure(t, "Request body", bodyBytes)
	} else {
		bodyReader = bytes.NewReader(nil)
	}

	req := httptest.NewRequest(method, url, bodyReader)
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	// Add optional headers
	for _, headerMap := range headers {
		for key, value := range headerMap {
			req.Header.Set(key, value)
		}
	}

	return req
}

func AssertJSONResponse[T any](t *testing.T, resp *http.Response, expectedStatus int) T {
	t.Helper()
	bodyBytes, err := io.ReadAll(resp.Body)
	require.NoError(t, err, "Failed to read response body")

	logBodyOnFailure(t, fmt.Sprintf("Response body (status %d, %d bytes)", resp.StatusCode, len(bodyBytes)), bodyBytes)

	require.Equal(t, expectedStatus, resp.StatusCode)

	// Decode into the typed result
	var result T
	if err := json.Unmarshal(bodyBytes, &result); err != nil {
		t.Fatalf("Failed to decode JSON response: %v", err)
	}

	return result
}

// logBodyOnFailure defers the dump of an HTTP body to the end of the test and
// emits it only if the test failed. These bodies carry secrets -- creating a
// service-account token returns its plaintext ksh_ value exactly once, in the
// creation response -- so logging them unconditionally would put live-shaped
// credentials in the CI log of every green run.
func logBodyOnFailure(t *testing.T, label string, body []byte) {
	t.Helper()
	t.Cleanup(func() {
		if !t.Failed() {
			return
		}
		var prettyJSON bytes.Buffer
		if err := json.Indent(&prettyJSON, body, "", "  "); err != nil {
			t.Logf("%s (not JSON):\n%s", label, body)
			return
		}
		t.Logf("%s:\n%s", label, prettyJSON.String())
	})
}

func MustCloseBody(t *testing.T, body io.Closer) {
	t.Helper()
	require.NoError(t, body.Close())
}
