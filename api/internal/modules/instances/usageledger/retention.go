package usageledger

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"

	infradogfooding "github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	"github.com/kaitencloud/kaiten/api/pkg/dogfooding"
)

// Settings is how long the journal is kept, from the deployment's configuration.
type Settings struct {
	// RetentionMonths is an organization's window when no licensing authority
	// answers for it; 0 keeps its history forever.
	RetentionMonths int
	// MaxRetentionMonths is the ceiling past which whole partitions are dropped;
	// 0 disables dropping.
	MaxRetentionMonths int
	// IdempotencyWindow is the transactionId horizon. No row younger than it is
	// ever purged, whatever the retention: a key's row must outlive the key.
	IdempotencyWindow time.Duration
}

// dropCeilingMonths is how old, in months, a partition must be to be dropped
// whole, and false when dropping is disabled: 0 in either setting keeps the
// rows, so that "keep forever" is honoured. Never below RetentionMonths, so a
// self-hosted window longer than the ceiling is not cut short.
func (s Settings) dropCeilingMonths() (int, bool) {
	if s.RetentionMonths == 0 || s.MaxRetentionMonths == 0 {
		return 0, false
	}
	return max(s.MaxRetentionMonths, s.RetentionMonths), true
}

// cutoff is the instant before which an organization keeping months of history
// loses its rows: months calendar months back, and never inside the
// idempotency horizon.
func (s Settings) cutoff(now time.Time, months int) time.Time {
	byMonths := period.AddMonths(now, -months)
	if horizon := now.Add(-s.IdempotencyWindow); horizon.Before(byMonths) {
		return horizon
	}
	return byMonths
}

// retentionSource says where an organization's window came from.
type retentionSource string

const (
	sourceLicence retentionSource = "licence"
	sourceConfig  retentionSource = "config"
	// sourceUnknown: the licensing authority could not be read and nothing was
	// read before, or answered something malformed. Nothing is purged for the
	// organization on its account.
	sourceUnknown retentionSource = "unknown"
)

// windowMonths is how many months of history organizationID keeps: its
// licence's usage-history-retention entitlement, or the configured default
// when no licensing authority governs it. 0 means forever.
func windowMonths(ctx context.Context, reader services.EntitlementConfig, settings Settings, organizationID uuid.UUID) (int, retentionSource) {
	raw, err := reader.ConfigValue(ctx, organizationID, dogfooding.UsageHistoryRetentionEntitlementSlug)
	if errors.Is(err, services.ErrNoLicensingAuthority) {
		return settings.RetentionMonths, sourceConfig
	}
	if err != nil || raw == nil {
		return 0, sourceUnknown
	}
	months, ok := parseRetention(raw)
	if !ok {
		infradogfooding.ConfigValueInvalid(ctx, dogfooding.UsageHistoryRetentionEntitlementSlug)
		return 0, sourceUnknown
	}
	return months, sourceLicence
}

// parseRetention reads {"months": N} with N a whole number of at least 1.
// Anything else is not a retention anybody configured.
func parseRetention(raw json.RawMessage) (int, bool) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value map[string]any
	if err := decoder.Decode(&value); err != nil {
		return 0, false
	}
	// A json.Number only for a JSON number: a quoted "6" decodes as a string.
	number, ok := value["months"].(json.Number)
	if !ok {
		return 0, false
	}
	months, err := number.Int64()
	if err != nil || months < 1 || months > 1200 {
		return 0, false
	}
	return int(months), true
}

// Retention answers how far back an organization's usage history can be read:
// the logical side of retention, which the history reads apply on top of the
// rows the daily pass has not purged yet.
type Retention struct {
	Reader   services.EntitlementConfig
	Settings Settings
}

// Start is the oldest instant organizationID's usage history can be read from
// at now: its window back from now, and never later than the idempotency
// horizon. Nil when nothing restricts the read: the history is kept forever,
// or the organization's retention cannot be read right now -- the same
// organizations the daily pass leaves alone.
// Months is the organization's usage history window in months, 0 when it
// keeps everything; false when it cannot be told.
func (r Retention) Months(ctx context.Context, organizationID uuid.UUID) (int, bool) {
	months, source := windowMonths(ctx, services.EntitlementConfigOrNone(r.Reader), r.Settings, organizationID)
	return months, source != sourceUnknown
}

func (r Retention) Start(ctx context.Context, organizationID uuid.UUID, now time.Time) *time.Time {
	months, source := windowMonths(ctx, services.EntitlementConfigOrNone(r.Reader), r.Settings, organizationID)
	if source == sourceUnknown || months == 0 {
		return nil
	}
	start := r.Settings.cutoff(now, months)
	return &start
}
