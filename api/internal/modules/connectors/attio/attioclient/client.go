package attioclient

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

// ErrUniquenessConflict surfaces an Attio uniqueness_conflict that could not
// be resolved to an existing record: the record exists in Attio but the
// Kaiten entity cannot be linked automatically.
var ErrUniquenessConflict = errors.New("attio record conflicts with an existing record")

// requestTimeout bounds every Attio call: the worker processes events
// sequentially and must never hang on an unresponsive remote.
const requestTimeout = 30 * time.Second

// BaseURL is Attio's REST API, and the only address the connector sends a request
// to. An organization's settings name it too, and the connector refuses settings
// that name anything else: a URL taken from settings would let whoever can write
// them make the API call any host it can reach, internal ones included, with the
// answer coming back to them in the link's last error.
const BaseURL = "https://api.attio.com"

type APIError struct {
	StatusCode int    `json:"status_code"`
	Type       string `json:"type"`
	Code       string `json:"code"`
	Message    string `json:"message"`
}

type recordResponse struct {
	Data record `json:"data"`
}

type recordListResponse struct {
	Data []record `json:"data"`
}

type record struct {
	ID struct {
		RecordID string `json:"record_id"`
	} `json:"id"`
	WebURL string `json:"web_url"`
}

type Client struct {
	http   *jsonClient
	logger *slog.Logger
}

func New(baseURL, apiKey string, logger *slog.Logger) *Client {
	return &Client{
		http:   newJSONClient(baseURL, apiKey, requestTimeout),
		logger: logger,
	}
}

func (c *Client) CreateCompany(ctx context.Context, kaitenCustomerID, name string, sourceFields, fieldsMapping map[string]string) (recordID, webURL string, retry bool, err error) {
	c.logger.DebugContext(
		ctx, "creating attio company",
		slog.String("kaiten_customer_id", kaitenCustomerID),
		slog.String("name", name),
	)

	payload := map[string]any{
		"data": map[string]any{
			"values": companyValues(name, sourceFields, fieldsMapping),
		},
	}

	statusCode, body, err := c.request(ctx, http.MethodPost, "/v2/objects/companies/records", payload)
	if err != nil {
		return "", "", true, err
	}

	if statusCode >= http.StatusOK && statusCode < http.StatusMultipleChoices {
		record := decodeRecordResponse(body)
		recordID = record.recordID()
		if recordID == "" {
			return "", "", false, fmt.Errorf("attio companies response missing record id: %s", preview(body, 300))
		}
		return recordID, record.webURL(), false, nil
	}

	retry, err = c.classifyError(statusCode, body, "companies")
	if errors.Is(err, ErrUniquenessConflict) {
		// The company already exists (e.g. a previous run created it but the
		// link-back failed). Resolve it through the attribute carrying the
		// Kaiten customer id, when the mapping syncs one.
		return c.resolveExistingRecord(ctx, "companies", mappedField(fieldsMapping, "customer.id", ""), kaitenCustomerID, err)
	}
	return "", "", retry, err
}

func (c *Client) CreateWorkspace(ctx context.Context, workspaceID, name, companyRecordID string, sourceFields, fieldsMapping map[string]string) (recordID, webURL string, retry bool, err error) {
	if strings.TrimSpace(companyRecordID) == "" {
		return "", "", false, fmt.Errorf("attio company record id is required")
	}

	payload := map[string]any{
		"data": map[string]any{
			"values": workspaceValues(workspaceID, name, companyRecordID, sourceFields, fieldsMapping),
		},
	}

	statusCode, body, err := c.request(ctx, http.MethodPost, "/v2/objects/workspaces/records", payload)
	if err != nil {
		return "", "", true, err
	}

	if statusCode >= http.StatusOK && statusCode < http.StatusMultipleChoices {
		record := decodeRecordResponse(body)
		recordID = record.recordID()
		if recordID == "" {
			return "", "", false, fmt.Errorf("attio workspaces response missing record id: %s", preview(body, 300))
		}
		return recordID, record.webURL(), false, nil
	}

	retry, err = c.classifyError(statusCode, body, "workspaces")
	if errors.Is(err, ErrUniquenessConflict) {
		// Workspaces always sync the Kaiten instance id (default attribute
		// `workspace_id`), so the conflicting record can be looked up.
		return c.resolveExistingRecord(ctx, "workspaces", mappedField(fieldsMapping, "instance.id", "workspace_id"), workspaceID, err)
	}
	return "", "", retry, err
}

func (c *Client) UpdateCompany(ctx context.Context, recordID, name string, sourceFields, fieldsMapping map[string]string) (webURL string, retry bool, err error) {
	recordID = strings.TrimSpace(recordID)
	if recordID == "" {
		return "", false, fmt.Errorf("attio company record id is required")
	}

	payload := map[string]any{
		"data": map[string]any{
			"values": companyUpdateValues(name, sourceFields, fieldsMapping),
		},
	}

	// Domains are multi-select in Attio. PUT replaces their current values,
	// while PATCH would append the new domain and retain stale ones.
	statusCode, body, err := c.request(ctx, http.MethodPut, "/v2/objects/companies/records/"+recordID, payload)
	if err != nil {
		return "", true, err
	}

	if statusCode >= http.StatusOK && statusCode < http.StatusMultipleChoices {
		return decodeRecordResponse(body).webURL(), false, nil
	}

	retry, err = c.classifyError(statusCode, body, "companies")
	return "", retry, err
}

func (c *Client) UpdateWorkspace(ctx context.Context, recordID, workspaceID, name, companyRecordID string, sourceFields, fieldsMapping map[string]string) (webURL string, retry bool, err error) {
	recordID = strings.TrimSpace(recordID)
	if recordID == "" {
		return "", false, fmt.Errorf("attio workspace record id is required")
	}

	companyRecordID = strings.TrimSpace(companyRecordID)
	if companyRecordID == "" {
		return "", false, fmt.Errorf("attio company record id is required")
	}

	payload := map[string]any{
		"data": map[string]any{
			"values": workspaceValues(workspaceID, name, companyRecordID, sourceFields, fieldsMapping),
		},
	}

	statusCode, body, err := c.request(ctx, http.MethodPatch, "/v2/objects/workspaces/records/"+recordID, payload)
	if err != nil {
		return "", true, err
	}

	if statusCode >= http.StatusOK && statusCode < http.StatusMultipleChoices {
		return decodeRecordResponse(body).webURL(), false, nil
	}

	retry, err = c.classifyError(statusCode, body, "workspaces")
	return "", retry, err
}

// resolveExistingRecord recovers from a uniqueness conflict by querying the
// record that already carries the Kaiten identifier, so the entity gets
// linked to it instead of staying unsynced. Returns conflictErr when no
// match attribute is mapped or no record matches: the caller then surfaces
// the conflict instead of silently dropping the event.
func (c *Client) resolveExistingRecord(ctx context.Context, object, matchAttribute, matchValue string, conflictErr error) (recordID, webURL string, retry bool, err error) {
	matchAttribute = strings.TrimSpace(matchAttribute)
	matchValue = strings.TrimSpace(matchValue)
	if matchAttribute == "" || matchValue == "" {
		return "", "", false, conflictErr
	}

	payload := map[string]any{
		"filter": map[string]any{matchAttribute: matchValue},
		"limit":  1,
	}

	statusCode, body, err := c.request(ctx, http.MethodPost, "/v2/objects/"+object+"/records/query", payload)
	if err != nil {
		return "", "", true, err
	}
	if statusCode < http.StatusOK || statusCode >= http.StatusMultipleChoices {
		retry, err = c.classifyError(statusCode, body, object)
		return "", "", retry, err
	}

	record := decodeRecordListResponse(body)
	recordID = record.recordID()
	if recordID == "" {
		return "", "", false, conflictErr
	}

	c.logger.InfoContext(
		ctx, "attio record already exists, linking existing record",
		slog.String("object", object),
		slog.String("match_attribute", matchAttribute),
		slog.String("record_id", recordID),
	)
	return recordID, record.webURL(), false, nil
}

func (c *Client) request(ctx context.Context, method, path string, payload any) (int, []byte, error) {
	return c.http.Do(ctx, method, path, payload)
}

func (c *Client) classifyError(statusCode int, body []byte, objectType string) (bool, error) {
	var apiErr APIError
	if err := json.Unmarshal(body, &apiErr); err == nil && apiErr.Code != "" {
		switch apiErr.Code {
		case "uniqueness_conflict":
			return false, fmt.Errorf("attio %s uniqueness conflict: %s: %w", objectType, apiErr.Message, ErrUniquenessConflict)
		case "missing_value":
			return false, fmt.Errorf("attio %s missing required value: %s", objectType, apiErr.Message)
		}
	}

	// Rate limits and request timeouts are transient: dropping the event
	// would lose the sync, so they must be retried like server errors.
	if statusCode == http.StatusTooManyRequests ||
		statusCode == http.StatusRequestTimeout ||
		statusCode >= http.StatusInternalServerError {
		return true, fmt.Errorf("attio %s request failed with %d: %s", objectType, statusCode, string(body))
	}

	return false, fmt.Errorf("attio %s request failed with %d: %s", objectType, statusCode, string(body))
}

func decodeRecordResponse(body []byte) record {
	var response recordResponse
	if err := json.Unmarshal(body, &response); err != nil {
		return record{}
	}
	return response.Data
}

func decodeRecordListResponse(body []byte) record {
	var response recordListResponse
	if err := json.Unmarshal(body, &response); err != nil || len(response.Data) == 0 {
		return record{}
	}
	return response.Data[0]
}

func (r record) recordID() string {
	return strings.TrimSpace(r.ID.RecordID)
}

func (r record) webURL() string {
	return strings.TrimSpace(r.WebURL)
}

func preview(raw []byte, n int) string {
	if len(raw) <= n {
		return string(raw)
	}
	return string(raw[:n]) + "..."
}

func companyValues(name string, sourceFields, fieldsMapping map[string]string) map[string]any {
	return buildCompanyValues(name, sourceFields, fieldsMapping, false)
}

func companyUpdateValues(name string, sourceFields, fieldsMapping map[string]string) map[string]any {
	return buildCompanyValues(name, sourceFields, fieldsMapping, true)
}

func buildCompanyValues(name string, sourceFields, fieldsMapping map[string]string, overwrite bool) map[string]any {
	values := map[string]any{}

	setMappedTextValue(values, mappedField(fieldsMapping, "customer.name", "name"), name)

	// The customer domain syncs to Attio's built-in `domains` attribute by
	// default, which is domain-typed and rejects the text value format.
	domainField := mappedField(fieldsMapping, "customer.domain", "domains")
	domainValue := strings.TrimSpace(sourceFields["customer.domain"])
	if domainField != "" && domainValue != "" {
		if domainField == "domains" {
			values[domainField] = []map[string]string{{"domain": domainValue}}
		} else {
			setMappedTextValue(values, domainField, domainValue)
		}
	} else if domainField != "" && overwrite {
		// An empty array explicitly clears the previous Attio value on PUT.
		values[domainField] = []map[string]string{}
	}

	setMappedAdditionalTextValues(values, sourceFields, fieldsMapping, map[string]struct{}{
		normalizeFieldKey("customer.name"):   {},
		normalizeFieldKey("customer.domain"): {},
	})

	return values
}

func workspaceValues(workspaceID, name, companyRecordID string, sourceFields, fieldsMapping map[string]string) map[string]any {
	values := map[string]any{}

	setMappedTextValue(values, mappedField(fieldsMapping, "instance.id", "workspace_id"), workspaceID)
	setMappedTextValue(values, mappedField(fieldsMapping, "instance.name", "name"), name)

	companyField := mappedField(fieldsMapping, "instance.customerExternalId", "company")
	if companyField != "" {
		values[companyField] = []map[string]string{{
			"target_object":    "companies",
			"target_record_id": strings.TrimSpace(companyRecordID),
		}}
	}

	setMappedAdditionalTextValues(values, sourceFields, fieldsMapping, map[string]struct{}{
		normalizeFieldKey("instance.id"):                 {},
		normalizeFieldKey("instance.name"):               {},
		normalizeFieldKey("instance.customerExternalId"): {},
	})

	return values
}

func setMappedTextValue(values map[string]any, fieldName, rawValue string) {
	fieldName = strings.TrimSpace(fieldName)
	rawValue = strings.TrimSpace(rawValue)
	if fieldName == "" || rawValue == "" {
		return
	}

	values[fieldName] = []map[string]string{{"value": rawValue}}
}

func setMappedAdditionalTextValues(values map[string]any, sourceFields, fieldsMapping map[string]string, skipNormalizedSource map[string]struct{}) {
	if len(sourceFields) == 0 || len(fieldsMapping) == 0 {
		return
	}

	sourceByNormalized := make(map[string]string, len(sourceFields))
	for sourceKey, sourceValue := range sourceFields {
		normalizedSourceKey := normalizeFieldKey(sourceKey)
		if normalizedSourceKey == "" {
			continue
		}
		sourceValue = strings.TrimSpace(sourceValue)
		if sourceValue == "" {
			continue
		}
		sourceByNormalized[normalizedSourceKey] = sourceValue
	}

	for sourceKey, targetField := range fieldsMapping {
		normalizedSourceKey := normalizeFieldKey(sourceKey)
		if normalizedSourceKey == "" {
			continue
		}
		if _, shouldSkip := skipNormalizedSource[normalizedSourceKey]; shouldSkip {
			continue
		}

		targetField = strings.TrimSpace(targetField)
		if targetField == "" {
			continue
		}

		sourceValue, ok := sourceByNormalized[normalizedSourceKey]
		if !ok {
			continue
		}

		if _, alreadySet := values[targetField]; alreadySet {
			continue
		}

		values[targetField] = []map[string]string{{"value": sourceValue}}
	}
}

// FieldMapped reports whether a source field has a non-empty Attio attribute
// configured in the mapping. The worker uses it to skip enrichment lookups for
// fields nobody mapped.
func FieldMapped(fieldsMapping map[string]string, sourceField string) bool {
	return mappedField(fieldsMapping, sourceField, "") != ""
}

func mappedField(fieldsMapping map[string]string, sourceField, fallback string) string {
	normalizedSourceField := normalizeFieldKey(sourceField)
	for configuredSourceField, targetField := range fieldsMapping {
		if normalizeFieldKey(configuredSourceField) != normalizedSourceField {
			continue
		}
		targetField = strings.TrimSpace(targetField)
		if targetField != "" {
			return targetField
		}
	}

	return strings.TrimSpace(fallback)
}

func normalizeFieldKey(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "" {
		return ""
	}

	var builder strings.Builder
	builder.Grow(len(value))
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			builder.WriteRune(r)
		}
	}

	return builder.String()
}
