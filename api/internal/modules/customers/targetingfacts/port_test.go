package targetingfacts

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/shopspring/decimal"

	"github.com/kaitencloud/kaiten/api/internal/modules/customers/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/catalogue"
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

type stubCombined []catalogue.Combined

func (s stubCombined) Combined(context.Context, uuid.UUID) ([]catalogue.Combined, error) {
	return s, nil
}

func TestWithCombined(t *testing.T) {
	slug := func(s string) *string { return &s }
	fact := func(entitlement, limit, used string) TargetingFact {
		f := TargetingFact{
			InstanceID: uuid.New(), LicenseSlug: "pro-v1", LicenseFamilySlug: "pro", LicenseType: "PAID", EntitlementSlug: slug(entitlement),
			LimitValue: []byte(limit),
		}
		if used != "" {
			f.UsageValue = []byte(used)
		}
		return f
	}
	credits := catalogue.Combined{ID: uuid.New(), Slug: "credits", Sources: []catalogue.CombinedSource{
		{Slug: "firecrawl-credits", Weight: decimal.RequireFromString("0.4")},
		{Slug: "ai-credits", Weight: decimal.RequireFromString("0.6")},
	}}
	numbers := func(t *testing.T, f TargetingFact) (limit, used float64, events int32) {
		t.Helper()
		var l struct{ Value float64 }
		var u struct {
			Value      float64
			EventCount int32 `json:"event_count"`
		}
		if err := json.Unmarshal(f.LimitValue, &l); err != nil {
			t.Fatal(err)
		}
		if err := json.Unmarshal(f.UsageValue, &u); err != nil {
			t.Fatal(err)
		}
		return l.Value, u.Value, u.EventCount
	}

	t.Run("the sum of the granted sources is one more fact, of the same instance", func(t *testing.T) {
		facts := []TargetingFact{
			fact("ai-credits", `{"type":"number","value":1000}`, `{"type":"number","value":100,"event_count":2}`),
			fact("firecrawl-credits", `{"type":"number","value":1000}`, `{"type":"number","value":300,"event_count":3}`),
			fact("seats", `{"type":"number","value":10}`, ""),
		}

		got, err := (&port{combined: stubCombined{credits}}).withCombined(t.Context(), uuid.New(), facts)
		if err != nil {
			t.Fatal(err)
		}

		if len(got) != 4 {
			t.Fatalf("%d facts, want the three rows and the combined entitlement's", len(got))
		}
		combined := got[3]
		if combined.EntitlementSlug == nil || *combined.EntitlementSlug != "credits" {
			t.Fatalf("EntitlementSlug = %v, want credits", combined.EntitlementSlug)
		}
		if combined.InstanceID != facts[0].InstanceID || combined.LicenseSlug != "pro-v1" || combined.LicenseFamilySlug != "pro" || combined.LicenseType != "PAID" {
			t.Errorf("the fact does not describe the instance and licence of the others: %+v", combined)
		}
		if limit, used, events := numbers(t, combined); limit != 1000 || used != 180 || events != 5 {
			t.Errorf("reads %v of %v after %d events, want 180 of 1000 after 5", used, limit, events)
		}
	})

	t.Run("a source without usage counts for none, and one that is not granted is not summed", func(t *testing.T) {
		got, err := (&port{combined: stubCombined{credits}}).withCombined(t.Context(), uuid.New(),
			[]TargetingFact{fact("ai-credits", `{"type":"number","value":1000}`, "")})
		if err != nil {
			t.Fatal(err)
		}
		if limit, used, _ := numbers(t, got[len(got)-1]); limit != 600 || used != 0 {
			t.Errorf("reads %v of %v, want 0 of 600", used, limit)
		}
	})

	t.Run("a source the query does not return is not granted, an AI pool while AI is off included", func(t *testing.T) {
		facts := []TargetingFact{fact("seats", `{"type":"number","value":10}`, "")}

		got, err := (&port{combined: stubCombined{credits}}).withCombined(t.Context(), uuid.New(), facts)
		if err != nil {
			t.Fatal(err)
		}
		if len(got) != 1 {
			t.Errorf("%d facts, want the one row: no source is granted, so there is no combined entitlement", len(got))
		}
	})

	t.Run("one unlimited source makes the sum unlimited", func(t *testing.T) {
		got, err := (&port{combined: stubCombined{credits}}).withCombined(t.Context(), uuid.New(), []TargetingFact{
			fact("firecrawl-credits", `{"type":"number","value":1000}`, `{"type":"number","value":300,"event_count":3}`),
			fact("ai-credits", `{"type":"number","value":-1}`, `{"type":"number","value":100,"event_count":2}`),
		})
		if err != nil {
			t.Fatal(err)
		}
		if limit, used, _ := numbers(t, got[len(got)-1]); limit != -1 || used != 180 {
			t.Errorf("reads %v of %v, want 180 of -1", used, limit)
		}
	})

	t.Run("an instance with no entitlement row has no facts to add to", func(t *testing.T) {
		got, err := (&port{combined: stubCombined{credits}}).withCombined(t.Context(), uuid.New(), nil)
		if err != nil || len(got) != 0 {
			t.Errorf("withCombined(nil) = %v, %v", got, err)
		}
	})
}
