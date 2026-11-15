package usageledger

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/config"
	infradogfooding "github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/sweep"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	"github.com/kaitencloud/kaiten/api/pkg/dogfooding"
)

// SettingsFrom is the journal's retention as a deployment configures it.
func SettingsFrom(cfg config.CoreConfig) Settings {
	return Settings{
		RetentionMonths:    cfg.UsageLedger.RetentionMonths,
		MaxRetentionMonths: cfg.UsageLedger.MaxRetentionMonths,
		IdempotencyWindow:  cfg.Usage.IdempotencyWindow,
	}
}

// NewRetention is the Retention a deployment's configuration states: the
// window the history's own reads and the daily pass apply.
func NewRetention(reader services.EntitlementConfig, cfg config.CoreConfig) Retention {
	return Retention{Reader: reader, Settings: SettingsFrom(cfg)}
}

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
	// sourceUnknown: the licensing authority could not be read, or answered
	// something malformed. Nothing is purged for the organization on its account.
	sourceUnknown retentionSource = "unknown"
)

// configRead is one of the two reads of services.EntitlementConfig: the live
// one for a purge, which cannot be undone, and the tolerant one for a read.
type configRead func(ctx context.Context, organizationID uuid.UUID, entitlementSlug string) (json.RawMessage, error)

// windowMonths is how many months of history organizationID keeps: its
// licence's usage-history-retention entitlement, or the configured default
// when no licensing authority governs it. 0 means forever.
func windowMonths(ctx context.Context, read configRead, settings Settings, organizationID uuid.UUID) (int, retentionSource) {
	raw, err := read(ctx, organizationID, dogfooding.UsageHistoryRetentionEntitlementSlug)
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

// parseRetention reads {"months": N} with N a whole number from 1 to 1200.
func parseRetention(raw json.RawMessage) (int, bool) {
	return sweep.ParseRetentionTerm(raw, "months", 1200)
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
// Window is the organization's usage history window in months, 0 when it
// keeps everything, and where it comes from as the contract spells it: KBK
// (its licence or an add-on), ENV (the deployment's setting, with no
// licensing authority) or UNKNOWN, with 0 months (§18.4 rule 5, V31-11).
func (r Retention) Window(ctx context.Context, organizationID uuid.UUID) (int, string) {
	months, source := windowMonths(ctx, services.EntitlementConfigOrNone(r.Reader).ConfigValue, r.Settings, organizationID)
	switch source {
	case sourceLicence:
		return months, "KBK"
	case sourceConfig:
		return months, "ENV"
	default:
		return 0, "UNKNOWN"
	}
}

func (r Retention) Start(ctx context.Context, organizationID uuid.UUID, now time.Time) *time.Time {
	months, source := windowMonths(ctx, services.EntitlementConfigOrNone(r.Reader).ConfigValue, r.Settings, organizationID)
	if source == sourceUnknown || months == 0 {
		return nil
	}
	start := r.Settings.cutoff(now, months)
	return &start
}
