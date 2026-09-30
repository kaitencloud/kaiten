package attioclient

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCreateCompany_UsesFieldMappingForPayloadValues(t *testing.T) {
	var capturedPayload map[string]any

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("expected POST request, got %s", r.Method)
		}
		if r.URL.Path != "/v2/objects/companies/records" {
			t.Fatalf("unexpected request path: %s", r.URL.Path)
		}

		rawBody, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("read request body: %v", err)
		}
		defer r.Body.Close()

		if err := json.Unmarshal(rawBody, &capturedPayload); err != nil {
			t.Fatalf("decode request body: %v", err)
		}

		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"data":{"id":{"record_id":"rec_123"}}}`))
	}))
	defer server.Close()

	client := New(server.URL, "attio-key", slog.New(slog.NewTextHandler(io.Discard, nil)))

	_, _, retry, err := client.CreateCompany(
		context.Background(),
		"cust_1",
		"Acme Corp",
		map[string]string{
			"customer.id":   "cust_1",
			"customer.slug": "acme",
			"customer.name": "Acme Corp",
		},
		map[string]string{
			"customer.name": "company_name",
			"customer.id":   "kaiten_customer_id",
		},
	)
	if err != nil {
		t.Fatalf("expected request to succeed, got error: %v", err)
	}
	if retry {
		t.Fatalf("expected retry=false on successful request")
	}

	values := valuesFromPayload(t, capturedPayload)

	if _, exists := values["name"]; exists {
		t.Fatalf("expected default name field to be remapped when fields mapping is provided")
	}
	if _, exists := values["company_name"]; !exists {
		t.Fatalf("expected mapped company_name field in payload values")
	}
	if _, exists := values["kaiten_customer_id"]; !exists {
		t.Fatalf("expected mapped kaiten_customer_id field in payload values")
	}
}

func valuesFromPayload(t *testing.T, payload map[string]any) map[string]any {
	t.Helper()

	data, ok := payload["data"].(map[string]any)
	if !ok {
		t.Fatalf("payload missing data object")
	}

	values, ok := data["values"].(map[string]any)
	if !ok {
		// The decoder may use map[string]interface{} aliases through nested conversions.
		raw, err := json.Marshal(data["values"])
		if err != nil {
			t.Fatalf("marshal payload values for coercion: %v", err)
		}
		coerced := map[string]any{}
		if err := json.NewDecoder(bytes.NewReader(raw)).Decode(&coerced); err != nil {
			t.Fatalf("coerce payload values: %v", err)
		}
		return coerced
	}

	return values
}

func createCompanyAgainstStatus(t *testing.T, statusCode int, responseBody string) (retry bool, err error) {
	t.Helper()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(statusCode)
		_, _ = w.Write([]byte(responseBody))
	}))
	t.Cleanup(server.Close)

	client := New(server.URL, "attio-key", slog.New(slog.NewTextHandler(io.Discard, nil)))
	_, _, retry, err = client.CreateCompany(context.Background(), "cust_1", "Acme Corp", nil, nil)
	return retry, err
}

func TestCreateCompany_RetriesOnTransientStatuses(t *testing.T) {
	for _, statusCode := range []int{
		http.StatusRequestTimeout,
		http.StatusTooManyRequests,
		http.StatusInternalServerError,
		http.StatusBadGateway,
		http.StatusServiceUnavailable,
	} {
		retry, err := createCompanyAgainstStatus(t, statusCode, `{"type":"error","code":"transient","message":"try again"}`)
		if err == nil {
			t.Fatalf("status %d: expected an error", statusCode)
		}
		if !retry {
			t.Fatalf("status %d: expected retry=true for a transient failure", statusCode)
		}
	}
}

func TestCreateCompany_DoesNotRetryOnClientErrors(t *testing.T) {
	for _, statusCode := range []int{
		http.StatusBadRequest,
		http.StatusUnauthorized,
		http.StatusForbidden,
		http.StatusNotFound,
	} {
		retry, err := createCompanyAgainstStatus(t, statusCode, `{"type":"error","code":"invalid_request","message":"nope"}`)
		if err == nil {
			t.Fatalf("status %d: expected an error", statusCode)
		}
		if retry {
			t.Fatalf("status %d: expected retry=false for a non-transient client error", statusCode)
		}
	}
}

const uniquenessConflictBody = `{"status_code":400,"type":"invalid_request_error","code":"uniqueness_conflict","message":"record already exists"}`

func TestCreateCompany_UniquenessConflictWithoutIDMappingIsAnError(t *testing.T) {
	// No customer.id mapping: the conflicting record cannot be looked up, so
	// the conflict must surface instead of silently dropping the event.
	retry, err := createCompanyAgainstStatus(t, http.StatusBadRequest, uniquenessConflictBody)
	if !errors.Is(err, ErrUniquenessConflict) {
		t.Fatalf("expected ErrUniquenessConflict, got: %v", err)
	}
	if retry {
		t.Fatalf("expected retry=false on an unresolved uniqueness conflict")
	}
}

func TestCreateCompany_UniquenessConflictResolvesExistingRecord(t *testing.T) {
	var capturedFilter map[string]any

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v2/objects/companies/records":
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(uniquenessConflictBody))
		case "/v2/objects/companies/records/query":
			var payload struct {
				Filter map[string]any `json:"filter"`
			}
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				t.Errorf("decode query payload: %v", err)
			}
			capturedFilter = payload.Filter
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"data":[{"id":{"record_id":"rec_existing"},"web_url":"https://app.attio.com/w/acme","values":{"record_id":"rec_decoy","web_url":"https://example.invalid/decoy"}}]}`))
		default:
			t.Errorf("unexpected attio request: %s %s", r.Method, r.URL.Path)
		}
	}))
	t.Cleanup(server.Close)

	client := New(server.URL, "attio-key", slog.New(slog.NewTextHandler(io.Discard, nil)))
	recordID, webURL, retry, err := client.CreateCompany(
		context.Background(),
		"cust_1",
		"Acme Corp",
		map[string]string{"customer.id": "cust_1"},
		map[string]string{"customer.id": "kaiten_customer_id"},
	)
	if err != nil {
		t.Fatalf("expected conflict to resolve to the existing record, got: %v", err)
	}
	if retry {
		t.Fatalf("expected retry=false after resolving the conflict")
	}
	if recordID != "rec_existing" {
		t.Fatalf("expected existing record id, got %q", recordID)
	}
	if webURL != "https://app.attio.com/w/acme" {
		t.Fatalf("expected existing record web url, got %q", webURL)
	}
	if capturedFilter["kaiten_customer_id"] != "cust_1" {
		t.Fatalf("expected query filtered on the mapped customer id attribute, got %v", capturedFilter)
	}
}

func TestCreateCompany_UniquenessConflictWithNoMatchingRecordIsAnError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v2/objects/companies/records":
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(uniquenessConflictBody))
		case "/v2/objects/companies/records/query":
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"data":[]}`))
		default:
			t.Errorf("unexpected attio request: %s %s", r.Method, r.URL.Path)
		}
	}))
	t.Cleanup(server.Close)

	client := New(server.URL, "attio-key", slog.New(slog.NewTextHandler(io.Discard, nil)))
	_, _, retry, err := client.CreateCompany(
		context.Background(),
		"cust_1",
		"Acme Corp",
		nil,
		map[string]string{"customer.id": "kaiten_customer_id"},
	)
	if !errors.Is(err, ErrUniquenessConflict) {
		t.Fatalf("expected ErrUniquenessConflict when no record matches, got: %v", err)
	}
	if retry {
		t.Fatalf("expected retry=false when no record matches")
	}
}

func TestCreateWorkspace_UniquenessConflictResolvesViaDefaultWorkspaceID(t *testing.T) {
	var capturedFilter map[string]any

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v2/objects/workspaces/records":
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(uniquenessConflictBody))
		case "/v2/objects/workspaces/records/query":
			var payload struct {
				Filter map[string]any `json:"filter"`
			}
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				t.Errorf("decode query payload: %v", err)
			}
			capturedFilter = payload.Filter
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"data":[{"id":{"record_id":"ws_existing"},"web_url":"https://app.attio.com/w/acme-prod","values":{"record_id":"ws_decoy","web_url":"https://example.invalid/decoy"}}]}`))
		default:
			t.Errorf("unexpected attio request: %s %s", r.Method, r.URL.Path)
		}
	}))
	t.Cleanup(server.Close)

	client := New(server.URL, "attio-key", slog.New(slog.NewTextHandler(io.Discard, nil)))
	recordID, webURL, retry, err := client.CreateWorkspace(context.Background(), "inst_1", "Acme Production", "rec_company", nil, nil)
	if err != nil {
		t.Fatalf("expected conflict to resolve to the existing workspace, got: %v", err)
	}
	if retry {
		t.Fatalf("expected retry=false after resolving the conflict")
	}
	if recordID != "ws_existing" {
		t.Fatalf("expected existing workspace id, got %q", recordID)
	}
	if webURL != "https://app.attio.com/w/acme-prod" {
		t.Fatalf("expected existing workspace web url, got %q", webURL)
	}
	// Without an explicit instance.id mapping the default `workspace_id`
	// attribute carries the Kaiten instance id.
	if capturedFilter["workspace_id"] != "inst_1" {
		t.Fatalf("expected query filtered on workspace_id, got %v", capturedFilter)
	}
}

func TestCreateCompany_UsesTypedRecordFields(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{
			"data": {
				"id": {"record_id": "rec_canonical"},
				"web_url": "https://app.attio.com/w/acme",
				"values": {
					"record_id": "rec_decoy",
					"web_url": "https://example.invalid/decoy"
				}
			}
		}`))
	}))
	t.Cleanup(server.Close)

	client := New(server.URL, "attio-key", slog.New(slog.NewTextHandler(io.Discard, nil)))
	recordID, webURL, retry, err := client.CreateCompany(context.Background(), "cust_1", "Acme Corp", nil, nil)
	if err != nil {
		t.Fatalf("CreateCompany() error = %v", err)
	}
	if retry {
		t.Fatal("expected retry=false")
	}
	if recordID != "rec_canonical" {
		t.Fatalf("recordID = %q, want rec_canonical", recordID)
	}
	if webURL != "https://app.attio.com/w/acme" {
		t.Fatalf("webURL = %q, want canonical Attio URL", webURL)
	}
}

func TestCreateCompany_RejectsNestedRecordIDWithoutCanonicalID(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"data":{"values":{"record_id":"rec_decoy"}}}`))
	}))
	t.Cleanup(server.Close)

	client := New(server.URL, "attio-key", slog.New(slog.NewTextHandler(io.Discard, nil)))
	_, _, retry, err := client.CreateCompany(context.Background(), "cust_1", "Acme Corp", nil, nil)
	if err == nil {
		t.Fatal("expected a missing record id error")
	}
	if retry {
		t.Fatal("expected retry=false for a malformed successful response")
	}
}

func TestUpdateCompany_AllowsMissingWebURL(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut {
			t.Fatalf("expected PUT request, got %s", r.Method)
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"data":{"id":{"record_id":"rec_existing"}}}`))
	}))
	t.Cleanup(server.Close)

	client := New(server.URL, "attio-key", slog.New(slog.NewTextHandler(io.Discard, nil)))
	webURL, retry, err := client.UpdateCompany(context.Background(), "rec_existing", "Acme Corp", nil, nil)
	if err != nil {
		t.Fatalf("UpdateCompany() error = %v", err)
	}
	if retry {
		t.Fatal("expected retry=false")
	}
	if webURL != "" {
		t.Fatalf("webURL = %q, want empty", webURL)
	}
}

func TestUpdateCompany_ReplacesDomain(t *testing.T) {
	var capturedPayload map[string]any

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut {
			t.Fatalf("expected PUT request, got %s", r.Method)
		}
		if r.URL.Path != "/v2/objects/companies/records/rec_existing" {
			t.Fatalf("unexpected request path: %s", r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&capturedPayload); err != nil {
			t.Fatalf("decode request body: %v", err)
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"data":{"id":{"record_id":"rec_existing"}}}`))
	}))
	t.Cleanup(server.Close)

	client := New(server.URL, "attio-key", slog.New(slog.NewTextHandler(io.Discard, nil)))
	_, retry, err := client.UpdateCompany(
		context.Background(),
		"rec_existing",
		"Acme Corp",
		map[string]string{"customer.domain": "acme.eu"},
		nil,
	)
	if err != nil {
		t.Fatalf("expected request to succeed, got error: %v", err)
	}
	if retry {
		t.Fatal("expected retry=false")
	}

	values := valuesFromPayload(t, capturedPayload)
	domains, ok := values["domains"].([]any)
	if !ok || len(domains) != 1 {
		t.Fatalf("expected a single domains value, got %#v", values["domains"])
	}
	entry, ok := domains[0].(map[string]any)
	if !ok || entry["domain"] != "acme.eu" {
		t.Fatalf("expected {domain: acme.eu}, got %#v", domains[0])
	}
}

func TestUpdateCompany_ClearsDomain(t *testing.T) {
	var capturedPayload map[string]any

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&capturedPayload); err != nil {
			t.Fatalf("decode request body: %v", err)
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"data":{"id":{"record_id":"rec_existing"}}}`))
	}))
	t.Cleanup(server.Close)

	client := New(server.URL, "attio-key", slog.New(slog.NewTextHandler(io.Discard, nil)))
	_, retry, err := client.UpdateCompany(
		context.Background(),
		"rec_existing",
		"Acme Corp",
		map[string]string{"customer.domain": ""},
		nil,
	)
	if err != nil {
		t.Fatalf("expected request to succeed, got error: %v", err)
	}
	if retry {
		t.Fatal("expected retry=false")
	}

	values := valuesFromPayload(t, capturedPayload)
	domains, ok := values["domains"].([]any)
	if !ok || len(domains) != 0 {
		t.Fatalf("expected an empty domains array, got %#v", values["domains"])
	}
}

func TestCreateCompany_SyncsDomainToAttioDomainsAttribute(t *testing.T) {
	var capturedPayload map[string]any

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rawBody, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("read request body: %v", err)
		}
		defer r.Body.Close()
		if err := json.Unmarshal(rawBody, &capturedPayload); err != nil {
			t.Fatalf("decode request body: %v", err)
		}
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"data":{"id":{"record_id":"rec_123"}}}`))
	}))
	defer server.Close()

	client := New(server.URL, "attio-key", slog.New(slog.NewTextHandler(io.Discard, nil)))

	_, _, _, err := client.CreateCompany(
		context.Background(),
		"cust_1",
		"Acme Corp",
		map[string]string{
			"customer.name":   "Acme Corp",
			"customer.domain": "acme.com",
		},
		nil,
	)
	if err != nil {
		t.Fatalf("expected request to succeed, got error: %v", err)
	}

	values := valuesFromPayload(t, capturedPayload)
	domains, ok := values["domains"].([]any)
	if !ok || len(domains) != 1 {
		t.Fatalf("expected a single domains value, got %#v", values["domains"])
	}
	entry, ok := domains[0].(map[string]any)
	if !ok || entry["domain"] != "acme.com" {
		t.Fatalf("expected domain-typed value {domain: acme.com}, got %#v", domains[0])
	}
	if _, exists := entry["value"]; exists {
		t.Fatalf("domains attribute must not use the text value format: %#v", entry)
	}
}

func TestCreateCompany_DomainMappedToCustomAttributeUsesTextFormat(t *testing.T) {
	var capturedPayload map[string]any

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rawBody, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("read request body: %v", err)
		}
		defer r.Body.Close()
		if err := json.Unmarshal(rawBody, &capturedPayload); err != nil {
			t.Fatalf("decode request body: %v", err)
		}
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"data":{"id":{"record_id":"rec_123"}}}`))
	}))
	defer server.Close()

	client := New(server.URL, "attio-key", slog.New(slog.NewTextHandler(io.Discard, nil)))

	_, _, _, err := client.CreateCompany(
		context.Background(),
		"cust_1",
		"Acme Corp",
		map[string]string{
			"customer.name":   "Acme Corp",
			"customer.domain": "acme.com",
		},
		map[string]string{"customer.domain": "kaiten_domain"},
	)
	if err != nil {
		t.Fatalf("expected request to succeed, got error: %v", err)
	}

	values := valuesFromPayload(t, capturedPayload)
	if _, exists := values["domains"]; exists {
		t.Fatalf("expected the default domains attribute to be remapped, got %#v", values["domains"])
	}
	textValues, ok := values["kaiten_domain"].([]any)
	if !ok || len(textValues) != 1 {
		t.Fatalf("expected a single kaiten_domain value, got %#v", values["kaiten_domain"])
	}
	entry, ok := textValues[0].(map[string]any)
	if !ok || entry["value"] != "acme.com" {
		t.Fatalf("expected text value format for custom attribute, got %#v", textValues[0])
	}
}

func TestCreateCompany_OmitsDomainsWhenCustomerHasNoDomain(t *testing.T) {
	var capturedPayload map[string]any

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rawBody, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("read request body: %v", err)
		}
		defer r.Body.Close()
		if err := json.Unmarshal(rawBody, &capturedPayload); err != nil {
			t.Fatalf("decode request body: %v", err)
		}
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"data":{"id":{"record_id":"rec_123"}}}`))
	}))
	defer server.Close()

	client := New(server.URL, "attio-key", slog.New(slog.NewTextHandler(io.Discard, nil)))

	_, _, _, err := client.CreateCompany(
		context.Background(),
		"cust_1",
		"Acme Corp",
		map[string]string{
			"customer.name":   "Acme Corp",
			"customer.domain": "",
		},
		nil,
	)
	if err != nil {
		t.Fatalf("expected request to succeed, got error: %v", err)
	}

	values := valuesFromPayload(t, capturedPayload)
	if _, exists := values["domains"]; exists {
		t.Fatalf("expected no domains value for an empty domain, got %#v", values["domains"])
	}
}
