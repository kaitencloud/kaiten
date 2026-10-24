package targetingfacts

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/modules/customers/infrastructure/db"
)

func at(t time.Time) pgtype.Timestamp {
	return pgtype.Timestamp{Time: t, InfinityModifier: pgtype.Finite, Valid: true}
}

// TestCurrentUsage: the OFREP used fact resolves the current window as the
// gauge reads do (§6.1 rule 2, V31-57, S03-072).
func TestCurrentUsage(t *testing.T) {
	month, calendar := db.EntitlementResetPeriodMONTH, db.EntitlementResetAnchorCALENDAR
	now := time.Date(2026, 10, 24, 9, 0, 0, 0, time.UTC)
	stored := []byte(`{"type":"number","value":42,"event_count":3}`)
	row := func(periodStart time.Time) db.GetTargetingFactsByCustomerSlugRow {
		return db.GetTargetingFactsByCustomerSlugRow{
			UsageValue: stored, UsagePeriodStart: at(periodStart), ResetPeriod: &month, ResetAnchor: &calendar,
			StartLicenseDate: at(time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)), Now: at(now),
		}
	}
	used := func(t *testing.T, r db.GetTargetingFactsByCustomerSlugRow) float64 {
		t.Helper()
		raw, err := currentUsage(r)
		if err != nil {
			t.Fatal(err)
		}
		var usage struct{ Value float64 }
		if err := json.Unmarshal(raw, &usage); err != nil {
			t.Fatal(err)
		}
		return usage.Value
	}

	if got := used(t, row(time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC))); got != 42 {
		t.Errorf("the current window's counter: %v, want 42", got)
	}
	if got := used(t, row(time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC))); got != 0 {
		t.Errorf("September's counter read in October: %v, want 0 until the next report rolls it over", got)
	}
	lifetime := row(time.Time{})
	lifetime.ResetPeriod, lifetime.ResetAnchor, lifetime.UsagePeriodStart = nil, nil, pgtype.Timestamp{}
	if got := used(t, lifetime); got != 42 {
		t.Errorf("a lifetime counter: %v, want 42", got)
	}
}
