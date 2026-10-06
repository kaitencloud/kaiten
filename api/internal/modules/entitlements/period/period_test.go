package period

import (
	"testing"
	"time"
)

func mustParse(t *testing.T, s string) time.Time {
	t.Helper()
	tm, err := time.Parse(time.RFC3339Nano, s)
	if err != nil {
		t.Fatalf("mustParse(%q): %v", s, err)
	}
	return tm
}

func TestCurrent_Calendar(t *testing.T) {
	cases := []struct {
		name        string
		resetPeriod ResetPeriod
		now         string
		wantStart   string
		wantEnd     string
	}{
		{"hour mid-window", Hour, "2026-03-15T14:37:22Z", "2026-03-15T14:00:00Z", "2026-03-15T15:00:00Z"},
		{"hour on boundary belongs to new window", Hour, "2026-03-15T14:00:00Z", "2026-03-15T14:00:00Z", "2026-03-15T15:00:00Z"},
		{"hour just before boundary belongs to old window", Hour, "2026-03-15T13:59:59.999999999Z", "2026-03-15T13:00:00Z", "2026-03-15T14:00:00Z"},

		{"day mid-window", Day, "2026-03-15T14:37:22Z", "2026-03-15T00:00:00Z", "2026-03-16T00:00:00Z"},
		{"day on boundary belongs to new window", Day, "2026-03-16T00:00:00Z", "2026-03-16T00:00:00Z", "2026-03-17T00:00:00Z"},

		// 2026-03-18 is a Wednesday; the ISO week's Monday is 2026-03-16.
		{"week mid-window", Week, "2026-03-18T10:00:00Z", "2026-03-16T00:00:00Z", "2026-03-23T00:00:00Z"},
		{"week on Monday boundary belongs to new window", Week, "2026-03-23T00:00:00Z", "2026-03-23T00:00:00Z", "2026-03-30T00:00:00Z"},
		// 2026-03-15 is a Sunday, the last day of the prior ISO week.
		{"week Sunday belongs to prior window", Week, "2026-03-15T23:59:59Z", "2026-03-09T00:00:00Z", "2026-03-16T00:00:00Z"},

		{"month mid-window", Month, "2026-03-15T10:00:00Z", "2026-03-01T00:00:00Z", "2026-04-01T00:00:00Z"},
		{"month on boundary belongs to new window", Month, "2026-04-01T00:00:00Z", "2026-04-01T00:00:00Z", "2026-05-01T00:00:00Z"},

		{"year mid-window", Year, "2026-06-15T10:00:00Z", "2026-01-01T00:00:00Z", "2027-01-01T00:00:00Z"},
		{"year on boundary belongs to new window", Year, "2027-01-01T00:00:00Z", "2027-01-01T00:00:00Z", "2028-01-01T00:00:00Z"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			now := mustParse(t, tc.now)
			got, err := Current(now, tc.resetPeriod, Calendar, time.Time{})
			if err != nil {
				t.Fatalf("Current() error = %v", err)
			}
			wantStart := mustParse(t, tc.wantStart)
			wantEnd := mustParse(t, tc.wantEnd)
			if !got.Start.Equal(wantStart) || !got.End.Equal(wantEnd) {
				t.Errorf("Current(%s) = [%s, %s), want [%s, %s)", tc.now, got.Start, got.End, wantStart, wantEnd)
			}
			if loc := got.Start.Location(); loc != time.UTC {
				t.Errorf("Start location = %v, want UTC", loc)
			}
		})
	}
}

func TestCurrent_LicenseStart(t *testing.T) {
	cases := []struct {
		name         string
		resetPeriod  ResetPeriod
		licenseStart string
		now          string
		wantStart    string
		wantEnd      string
	}{
		{"hour at anchor", Hour, "2026-01-15T10:23:00Z", "2026-01-15T10:23:00Z", "2026-01-15T10:23:00Z", "2026-01-15T11:23:00Z"},
		{"hour n=2", Hour, "2026-01-15T10:23:00Z", "2026-01-15T12:53:00Z", "2026-01-15T12:23:00Z", "2026-01-15T13:23:00Z"},
		{"hour negative index (now before anchor)", Hour, "2026-01-15T10:23:00Z", "2026-01-15T09:53:00Z", "2026-01-15T09:23:00Z", "2026-01-15T10:23:00Z"},

		{"day n=1", Day, "2026-01-15T10:00:00Z", "2026-01-16T11:00:00Z", "2026-01-16T10:00:00Z", "2026-01-17T10:00:00Z"},

		{"week n=1", Week, "2026-01-15T10:00:00Z", "2026-01-25T10:00:00Z", "2026-01-22T10:00:00Z", "2026-01-29T10:00:00Z"},

		// anchor day 31 must clamp into shorter months, and revert to 31 once the
		// target month is long enough again -- clamping is per-window, not sticky.
		{"month n=0 anchor day 31", Month, "2026-01-31T00:00:00Z", "2026-02-15T00:00:00Z", "2026-01-31T00:00:00Z", "2026-02-28T00:00:00Z"},
		{"month n=1 boundary, Feb clamped to 28", Month, "2026-01-31T00:00:00Z", "2026-02-28T00:00:00Z", "2026-02-28T00:00:00Z", "2026-03-31T00:00:00Z"},
		{"month n=1 reverts to day 31 in March", Month, "2026-01-31T00:00:00Z", "2026-03-20T00:00:00Z", "2026-02-28T00:00:00Z", "2026-03-31T00:00:00Z"},
		{"month n=2 April clamped to 30", Month, "2026-01-31T00:00:00Z", "2026-04-15T00:00:00Z", "2026-03-31T00:00:00Z", "2026-04-30T00:00:00Z"},
		{"month negative index (now before anchor)", Month, "2026-06-15T10:00:00Z", "2026-05-20T00:00:00Z", "2026-05-15T10:00:00Z", "2026-06-15T10:00:00Z"},

		// anchor Feb 29 (leap year) must clamp into non-leap years, and revert
		// once the target year is leap again.
		{"year n=1 non-leap clamps to Feb 28", Year, "2024-02-29T00:00:00Z", "2025-06-01T00:00:00Z", "2025-02-28T00:00:00Z", "2026-02-28T00:00:00Z"},
		{"year n=3 still clamped (2027 not leap)", Year, "2024-02-29T00:00:00Z", "2028-01-01T00:00:00Z", "2027-02-28T00:00:00Z", "2028-02-29T00:00:00Z"},
		{"year n=4 reverts to Feb 29 (2028 leap)", Year, "2024-02-29T00:00:00Z", "2028-03-01T00:00:00Z", "2028-02-29T00:00:00Z", "2029-02-28T00:00:00Z"},
		{"year negative index (now before anchor)", Year, "2024-02-29T00:00:00Z", "2023-06-01T00:00:00Z", "2023-02-28T00:00:00Z", "2024-02-29T00:00:00Z"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			now := mustParse(t, tc.now)
			licenseStart := mustParse(t, tc.licenseStart)
			got, err := Current(now, tc.resetPeriod, LicenseStart, licenseStart)
			if err != nil {
				t.Fatalf("Current() error = %v", err)
			}
			wantStart := mustParse(t, tc.wantStart)
			wantEnd := mustParse(t, tc.wantEnd)
			if !got.Start.Equal(wantStart) || !got.End.Equal(wantEnd) {
				t.Errorf("Current(%s) = [%s, %s), want [%s, %s)", tc.now, got.Start, got.End, wantStart, wantEnd)
			}
		})
	}
}

func TestNext_Contiguity(t *testing.T) {
	cases := []struct {
		name         string
		resetPeriod  ResetPeriod
		resetAnchor  ResetAnchor
		licenseStart string
		now          string
	}{
		{"calendar hour", Hour, Calendar, "", "2026-03-15T14:37:22Z"},
		{"calendar day", Day, Calendar, "", "2026-03-15T14:37:22Z"},
		{"calendar week", Week, Calendar, "", "2026-03-18T10:00:00Z"},
		{"calendar month", Month, Calendar, "", "2026-03-15T10:00:00Z"},
		{"calendar year", Year, Calendar, "", "2026-06-15T10:00:00Z"},
		{"license_start hour", Hour, LicenseStart, "2026-01-15T10:23:00Z", "2026-01-15T12:53:00Z"},
		{"license_start month clamped", Month, LicenseStart, "2026-01-31T00:00:00Z", "2026-02-15T00:00:00Z"},
		{"license_start year clamped", Year, LicenseStart, "2024-02-29T00:00:00Z", "2025-06-01T00:00:00Z"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			now := mustParse(t, tc.now)
			var licenseStart time.Time
			if tc.licenseStart != "" {
				licenseStart = mustParse(t, tc.licenseStart)
			}

			current, err := Current(now, tc.resetPeriod, tc.resetAnchor, licenseStart)
			if err != nil {
				t.Fatalf("Current() error = %v", err)
			}
			next, err := Next(current, tc.resetPeriod, tc.resetAnchor, licenseStart)
			if err != nil {
				t.Fatalf("Next() error = %v", err)
			}

			if !next.Start.Equal(current.End) {
				t.Errorf("Next(w).Start = %s, want %s (== w.End)", next.Start, current.End)
			}

			// The window computed for a timestamp exactly at current.End must
			// equal Next(current): windows are contiguous, no gaps or overlaps.
			atBoundary, err := Current(current.End, tc.resetPeriod, tc.resetAnchor, licenseStart)
			if err != nil {
				t.Fatalf("Current(w.End) error = %v", err)
			}
			if !atBoundary.Start.Equal(next.Start) || !atBoundary.End.Equal(next.End) {
				t.Errorf("Current(w.End) = [%s,%s), want Next(w) = [%s,%s)", atBoundary.Start, atBoundary.End, next.Start, next.End)
			}

			// Walking backwards must land exactly on the window before current.
			prevCandidate := current.Start.Add(-time.Nanosecond)
			previous, err := Current(prevCandidate, tc.resetPeriod, tc.resetAnchor, licenseStart)
			if err != nil {
				t.Fatalf("Current(w.Start - 1ns) error = %v", err)
			}
			if !previous.End.Equal(current.Start) {
				t.Errorf("Current(w.Start - 1ns).End = %s, want %s (== w.Start)", previous.End, current.Start)
			}
		})
	}
}

func TestResetPeriod_Valid(t *testing.T) {
	cases := []struct {
		period ResetPeriod
		want   bool
	}{
		{Hour, true},
		{Day, true},
		{Week, true},
		{Month, true},
		{Year, true},
		{ResetPeriod(""), false},
		{ResetPeriod("DECADE"), false},
		{ResetPeriod("hour"), false},
	}
	for _, tc := range cases {
		t.Run(string(tc.period), func(t *testing.T) {
			if got := tc.period.Valid(); got != tc.want {
				t.Errorf("ResetPeriod(%q).Valid() = %v, want %v", tc.period, got, tc.want)
			}
		})
	}
}

func TestResetAnchor_Valid(t *testing.T) {
	cases := []struct {
		anchor ResetAnchor
		want   bool
	}{
		{Calendar, true},
		{LicenseStart, true},
		{ResetAnchor(""), false},
		{ResetAnchor("SOLSTICE"), false},
		{ResetAnchor("calendar"), false},
	}
	for _, tc := range cases {
		t.Run(string(tc.anchor), func(t *testing.T) {
			if got := tc.anchor.Valid(); got != tc.want {
				t.Errorf("ResetAnchor(%q).Valid() = %v, want %v", tc.anchor, got, tc.want)
			}
		})
	}
}

func TestCurrent_Errors(t *testing.T) {
	now := mustParse(t, "2026-01-01T00:00:00Z")

	if _, err := Current(now, ResetPeriod("DECADE"), Calendar, time.Time{}); err == nil {
		t.Error("Current() with unsupported reset period: want error, got nil")
	}

	if _, err := Current(now, Month, ResetAnchor("SOLSTICE"), time.Time{}); err == nil {
		t.Error("Current() with unsupported reset anchor: want error, got nil")
	}
}

func TestResolveCurrent(t *testing.T) {
	now := mustParse(t, "2026-10-05T10:30:00Z")
	licenseStart := mustParse(t, "2026-01-01T00:20:00Z")
	ptr := func(s string) *time.Time {
		tm := mustParse(t, s)
		return &tm
	}

	cases := []struct {
		name            string
		stored          *time.Time
		resetAnchor     ResetAnchor
		wantStart       string
		wantEnd         string
		wantStoredAhead bool
	}{
		{"no stored row", nil, Calendar, "2026-10-05T10:00:00Z", "2026-10-05T11:00:00Z", false},
		{"stored window is the current one", ptr("2026-10-05T10:00:00Z"), Calendar, "2026-10-05T10:00:00Z", "2026-10-05T11:00:00Z", false},
		{"stored window is behind", ptr("2026-10-05T07:00:00Z"), Calendar, "2026-10-05T10:00:00Z", "2026-10-05T11:00:00Z", false},
		{"stored window is one ahead", ptr("2026-10-05T11:00:00Z"), Calendar, "2026-10-05T11:00:00Z", "2026-10-05T12:00:00Z", true},
		{"stored window is far ahead", ptr("2026-10-06T03:00:00Z"), Calendar, "2026-10-06T03:00:00Z", "2026-10-06T04:00:00Z", true},
		{"stored window ahead under LICENSE_START", ptr("2026-10-05T11:20:00Z"), LicenseStart, "2026-10-05T11:20:00Z", "2026-10-05T12:20:00Z", true},
		// 11:00 is a boundary of the calendar phase, not of the license
		// phase (:20): the anchor moved since the row was written, which
		// the report path closes as a phase shift.
		{"stored start ahead but off this phase", ptr("2026-10-05T11:00:00Z"), LicenseStart, "2026-10-05T10:20:00Z", "2026-10-05T11:20:00Z", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, storedAhead, err := ResolveCurrent(now, tc.stored, Hour, tc.resetAnchor, licenseStart)
			if err != nil {
				t.Fatalf("ResolveCurrent() error = %v", err)
			}
			if !got.Start.Equal(mustParse(t, tc.wantStart)) || !got.End.Equal(mustParse(t, tc.wantEnd)) {
				t.Errorf("ResolveCurrent() = [%v, %v), want [%v, %v)", got.Start, got.End, tc.wantStart, tc.wantEnd)
			}
			if storedAhead != tc.wantStoredAhead {
				t.Errorf("storedAhead = %v, want %v", storedAhead, tc.wantStoredAhead)
			}
		})
	}
}

func TestAddMonths(t *testing.T) {
	cases := []struct {
		from string
		n    int
		want string
	}{
		{"2026-05-31T10:00:00Z", -3, "2026-02-28T10:00:00Z"},
		{"2028-05-31T00:00:00Z", -3, "2028-02-29T00:00:00Z"},
		{"2026-01-15T00:00:00Z", -18, "2024-07-15T00:00:00Z"},
		{"2026-10-05T12:30:00Z", 12, "2027-10-05T12:30:00Z"},
	}
	for _, tc := range cases {
		if got := AddMonths(mustParse(t, tc.from), tc.n); !got.Equal(mustParse(t, tc.want)) {
			t.Errorf("AddMonths(%s, %d) = %v, want %s", tc.from, tc.n, got, tc.want)
		}
	}
}
