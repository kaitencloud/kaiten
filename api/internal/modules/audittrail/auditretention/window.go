package auditretention

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"

	"github.com/google/uuid"

	infradogfooding "github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/pkg/dogfooding"
)

// retentionSource says where an organization's window came from.
type retentionSource string

const (
	sourceLicence retentionSource = "licence"
	sourceConfig  retentionSource = "config"
	// sourceUnknown: the licensing authority could not be read, does not grant
	// the term, or answered something malformed. Nothing is purged for the
	// organization on its account.
	sourceUnknown retentionSource = "unknown"
)

// maxDays bounds a window to a hundred years: anything larger is not a
// retention anybody configured.
const maxDays = 36500

// windowDays is how many days of audit trail organizationID keeps: its
// licence's audit-retention term, or the configured default when no licensing
// authority governs it. 0 means forever.
func windowDays(ctx context.Context, reader services.EntitlementConfig, settings Settings, organizationID uuid.UUID) (int, retentionSource) {
	raw, err := reader.ConfigValue(ctx, organizationID, dogfooding.AuditRetentionEntitlementSlug)
	if errors.Is(err, services.ErrNoLicensingAuthority) {
		return settings.RetentionDays, sourceConfig
	}
	if err != nil || raw == nil {
		return 0, sourceUnknown
	}
	days, ok := parseRetention(raw)
	if !ok {
		infradogfooding.ConfigValueInvalid(ctx, dogfooding.AuditRetentionEntitlementSlug)
		return 0, sourceUnknown
	}
	return days, sourceLicence
}

// parseRetention reads {"days": N} with N a whole number from 1 to maxDays.
// Anything else is not a retention anybody configured.
func parseRetention(raw json.RawMessage) (int, bool) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value map[string]any
	if err := decoder.Decode(&value); err != nil {
		return 0, false
	}
	// A json.Number only for a JSON number: a quoted "30" decodes as a string.
	number, ok := value["days"].(json.Number)
	if !ok {
		return 0, false
	}
	days, err := number.Int64()
	if err != nil || days < 1 || days > maxDays {
		return 0, false
	}
	return int(days), true
}
