package auditretention

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"

	infradogfooding "github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/sweep"
	"github.com/kaitencloud/kaiten/api/pkg/dogfooding"
)

// retentionSource says where an organization's window came from, or why it has
// none. Only sourceLicence and sourceConfig ever lead to a purge.
type retentionSource string

const (
	sourceLicence retentionSource = "licence"
	sourceConfig  retentionSource = "config"
	// sourceUnknown: the licensing authority could not be read.
	sourceUnknown retentionSource = "unknown"
	// sourceMalformed: it answered something that is not a retention.
	sourceMalformed retentionSource = "malformed"
	// sourceNotGranted: it answered, and the licence does not grant the term.
	sourceNotGranted retentionSource = "not_granted"
)

const (
	// maxDays bounds a window to a hundred years: anything larger is not a
	// retention anybody configured.
	maxDays = 36500
	// minRetentionDays is the shortest window any source can state: nothing
	// younger than this can be expired, whatever the organization's window is.
	minRetentionDays = 1
	// listingWindowTimeout bounds the lookup a request makes before listing the
	// trail. A slower licensing deployment shows the whole trail rather than
	// holding up the page.
	listingWindowTimeout = 2 * time.Second
)

// configRead is one of the two reads of services.EntitlementConfig.
type configRead func(ctx context.Context, organizationID uuid.UUID, entitlementSlug string) (json.RawMessage, error)

// windowDays is how many days of audit trail organizationID keeps: its
// licence's audit-retention term, or the configured default when no licensing
// authority governs it. 0 means forever, and is what every source that names no
// window answers.
func windowDays(ctx context.Context, read configRead, settings Settings, organizationID uuid.UUID) (int, retentionSource) {
	raw, err := read(ctx, organizationID, dogfooding.AuditRetentionEntitlementSlug)
	if errors.Is(err, services.ErrNoLicensingAuthority) {
		return settings.RetentionDays, sourceConfig
	}
	if err != nil {
		return 0, sourceUnknown
	}
	if raw == nil {
		return 0, sourceNotGranted
	}
	days, ok := parseRetention(raw)
	if !ok {
		infradogfooding.ConfigValueInvalid(ctx, dogfooding.AuditRetentionEntitlementSlug)
		return 0, sourceMalformed
	}
	return days, sourceLicence
}

// parseRetention reads {"days": N} with N a whole number from 1 to maxDays.
func parseRetention(raw json.RawMessage) (int, bool) {
	return sweep.ParseRetentionTerm(raw, "days", maxDays)
}

// cutoff is the instant before which an organization keeping days of trail
// loses its entries.
func cutoff(now time.Time, days int) time.Time {
	return now.AddDate(0, 0, -days)
}

// Retention is the logical side of retention, which the audit trail's list
// reads apply on top of the entries the sweep has not purged yet: a backlog
// still draining is not served past the term the licence states.
//
// The zero value restricts nothing.
type Retention struct {
	Reader   services.EntitlementConfig
	Settings Settings
}

// NewRetention is the Retention of a deployment. One that switched retention
// off runs no sweep, and keeps every entry readable too.
func NewRetention(reader services.EntitlementConfig, enabled bool, days int) Retention {
	if !enabled {
		return Retention{}
	}
	return Retention{Reader: reader, Settings: Settings{RetentionDays: days}}
}

// Clamp is the lower bound of a listing asked to start at after: the later of
// after and the start of organizationID's window.
//
// Unlike the sweep it uses the tolerant read, for two reasons: it runs on a
// request's path, and hiding an entry is reversible where deleting one is not.
// An organization whose retention cannot be read keeps its whole trail visible.
func (r Retention) Clamp(ctx context.Context, organizationID uuid.UUID, now time.Time, after *time.Time) *time.Time {
	readCtx, cancel := context.WithTimeout(ctx, listingWindowTimeout)
	defer cancel()
	reader := services.EntitlementConfigOrNone(r.Reader)
	days, _ := windowDays(readCtx, reader.ConfigValue, r.Settings, organizationID)
	if days == 0 {
		return after
	}
	start := cutoff(now, days)
	if after != nil && after.After(start) {
		return after
	}
	return &start
}
