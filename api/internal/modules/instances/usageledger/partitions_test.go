package usageledger

import (
	"testing"
	"time"
)

func TestPlannedMonths(t *testing.T) {
	months := plannedMonths(time.Date(2026, 12, 31, 23, 59, 59, 0, time.UTC))
	if len(months) != 14 {
		t.Fatalf("len = %d, want 14", len(months))
	}
	if got := partitionName(months[0]); got != "usage_ledger_p2026_11" {
		t.Errorf("first = %s, want the previous month", got)
	}
	if got := partitionName(months[1]); got != "usage_ledger_p2026_12" {
		t.Errorf("second = %s, want the current month", got)
	}
	if got := partitionName(months[13]); got != "usage_ledger_p2027_12" {
		t.Errorf("last = %s, want twelve months ahead across the year end", got)
	}
}

func TestParsePartitionName(t *testing.T) {
	month, ok := parsePartitionName("usage_ledger_p2028_02")
	if !ok || !month.Equal(time.Date(2028, 2, 1, 0, 0, 0, 0, time.UTC)) {
		t.Errorf("parsePartitionName(usage_ledger_p2028_02) = %v, %v", month, ok)
	}
	for _, name := range []string{"usage_ledger_p2028_13", "usage_ledger_p2028_2", "usage_ledger", "other_p2028_02", "usage_ledger_p2028_02_old"} {
		if _, ok := parsePartitionName(name); ok {
			t.Errorf("parsePartitionName(%q) accepted a name that is not a partition's", name)
		}
	}
}

func TestMonthsAheadOf(t *testing.T) {
	now := time.Date(2026, 10, 5, 0, 0, 0, 0, time.UTC)
	full := plannedMonths(now)
	if got := monthsAheadOf(now, full); got != 12 {
		t.Errorf("full runway = %d, want 12", got)
	}
	// A hole in month +3 ends the runway there, whatever comes after it.
	holed := append(append([]time.Time{}, full[:4]...), full[5:]...)
	if got := monthsAheadOf(now, holed); got != 2 {
		t.Errorf("runway with month +3 missing = %d, want 2", got)
	}
}
