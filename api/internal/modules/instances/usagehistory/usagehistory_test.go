package usagehistory

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

func TestResolveRange(t *testing.T) {
	now := time.Date(2026, 10, 5, 12, 0, 0, 0, time.UTC)
	start := time.Date(2026, 7, 5, 12, 0, 0, 0, time.UTC) // a 3-month retention
	at := func(t time.Time) *time.Time { return &t }

	cases := []struct {
		name           string
		from, to       *time.Time
		retentionStart *time.Time
		maxSpan        time.Duration
		want           Range
		wantCode       string
	}{
		{name: "defaults: the last 30 days", want: Range{now.Add(-DefaultSpan), now}},
		{
			name: "default from follows an explicit to", to: at(now.Add(-24 * time.Hour)),
			want: Range{now.Add(-24*time.Hour - DefaultSpan), now.Add(-24 * time.Hour)},
		},
		{
			name: "default from moves up to the retention start", to: at(start.Add(10 * 24 * time.Hour)), retentionStart: &start,
			want: Range{start, start.Add(10 * 24 * time.Hour)},
		},
		{name: "explicit from at the retention start", from: &start, retentionStart: &start, want: Range{start, now}},
		{
			name: "explicit from 1 ms before the retention start", from: at(start.Add(-time.Millisecond)), retentionStart: &start,
			wantCode: "Op.OutsideRetention",
		},
		{
			name: "a range ending before the retention start", to: at(start.Add(-time.Hour)), retentionStart: &start,
			wantCode: "Op.OutsideRetention",
		},
		{name: "from equal to", from: at(now.Add(-time.Hour)), to: at(now.Add(-time.Hour)), wantCode: "Op.InvalidRange"},
		{name: "from after to", from: at(now), to: at(now.Add(-time.Hour)), wantCode: "Op.InvalidRange"},
		{
			name: "exactly the maximum span", from: at(now.Add(-31 * 24 * time.Hour)), maxSpan: 31 * 24 * time.Hour,
			want: Range{now.Add(-31 * 24 * time.Hour), now},
		},
		{
			name: "1 ms over the maximum span", from: at(now.Add(-31*24*time.Hour - time.Millisecond)), maxSpan: 31 * 24 * time.Hour,
			wantCode: "Op.RangeTooLarge",
		},
		{
			name: "offsets are read as instants", from: at(time.Date(2026, 10, 5, 13, 0, 0, 0, time.FixedZone("CEST", 2*3600))),
			want: Range{time.Date(2026, 10, 5, 11, 0, 0, 0, time.UTC), now},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := ResolveRange("Op", tc.from, tc.to, now, tc.retentionStart, tc.maxSpan)
			if tc.wantCode != "" {
				if apierrors.GetCode(err) != tc.wantCode {
					t.Fatalf("ResolveRange() error = %v, want code %s", err, tc.wantCode)
				}
				return
			}
			if err != nil {
				t.Fatalf("ResolveRange() error = %v", err)
			}
			if !got.From.Equal(tc.want.From) || !got.To.Equal(tc.want.To) {
				t.Errorf("ResolveRange() = [%v, %v), want [%v, %v)", got.From, got.To, tc.want.From, tc.want.To)
			}
		})
	}
}

func TestOutsideRetentionNamesTheStart(t *testing.T) {
	start := time.Date(2026, 7, 5, 12, 0, 0, 0, time.UTC)
	from := start.Add(-time.Hour)
	_, err := ResolveRange("ListUsageReports", &from, nil, start.AddDate(0, 3, 0), &start, 0)

	var appErr *apierrors.Error
	if !errorAs(err, &appErr) || len(appErr.Errors) != 1 {
		t.Fatalf("error = %#v, want one errors entry", err)
	}
	if got := appErr.Errors[0].Value; got != "2026-07-05T12:00:00.000Z" {
		t.Errorf("errors[0].value = %v, want the retention start", got)
	}
	if !strings.Contains(appErr.Message, "2026-07-05T12:00:00.000Z") {
		t.Errorf("message %q does not name the retention start", appErr.Message)
	}
}

func TestParseFormat(t *testing.T) {
	for value, want := range map[string]Format{"": FormatCSV, "csv": FormatCSV, "json": FormatJSON} {
		if got, err := ParseFormat("Op", value); err != nil || got != want {
			t.Errorf("ParseFormat(%q) = %q, %v; want %q", value, got, err, want)
		}
	}
	for _, value := range []string{"ndjson", "xml", "CSV"} {
		if _, err := ParseFormat("Op", value); apierrors.GetCode(err) != "Op.InvalidFormat" {
			t.Errorf("ParseFormat(%q) error = %v, want Op.InvalidFormat", value, err)
		}
	}
}

func sampleReport() UsageReport {
	windowStart := time.Date(2025, 10, 1, 0, 0, 0, 0, time.UTC)
	windowEnd := windowStart.AddDate(0, 1, 0)
	limit, percent, txn := "1000", int16(50), "-cmd"
	return UsageReport{
		InstanceID:        uuid.MustParse("11111111-1111-1111-1111-111111111111"),
		EntitlementID:     uuid.MustParse("22222222-2222-2222-2222-222222222222"),
		ReportSeq:         1,
		ReportedAt:        time.Date(2025, 10, 10, 8, 0, 0, 0, time.UTC),
		Behavior:          "append",
		AggregationMethod: "SUM",
		ReportedValue:     "600",
		ValueBefore:       "0",
		ValueAfter:        "600",
		Delta:             "600",
		OverageDelta:      "0",
		EventCountAfter:   1,
		WindowStart:       &windowStart,
		WindowEnd:         &windowEnd,
		LimitValue:        &limit,
		OveragePercent:    &percent,
		LicenseID:         uuid.MustParse("33333333-3333-3333-3333-333333333333"),
		TransactionID:     &txn,
		Properties:        map[string]any{"note": `a,b"c`, "tokens": json.Number("12")},
		organizationID:    uuid.MustParse("44444444-4444-4444-4444-444444444444"),
	}
}

func pagesOf(pages ...[]UsageReport) func(context.Context) ([]UsageReport, bool, error) {
	i := 0
	return func(context.Context) ([]UsageReport, bool, error) {
		page := pages[i]
		i++
		return page, i < len(pages), nil
	}
}

func TestCSVExport(t *testing.T) {
	unlimited := sampleReport()
	unlimited.ReportSeq, unlimited.LimitValue, unlimited.OveragePercent = 2, nil, nil
	unlimited.WindowStart, unlimited.WindowEnd, unlimited.TransactionID, unlimited.Properties = nil, nil, nil, nil

	export := &Export{Format: FormatCSV, next: pagesOf([]UsageReport{sampleReport()}, []UsageReport{unlimited})}
	var buf bytes.Buffer
	if err := export.Write(t.Context(), &buf); err != nil {
		t.Fatal(err)
	}

	lines := strings.Split(buf.String(), "\n")
	want := []string{
		"organization_id,instance_id,entitlement_id,report_seq,reported_at,behavior,aggregation_method,reported_value,value_before,value_after,delta,overage_delta,event_count_after,window_start,window_end,limit_value,overage_percent,license_id,transaction_id,properties",
		`44444444-4444-4444-4444-444444444444,11111111-1111-1111-1111-111111111111,22222222-2222-2222-2222-222222222222,1,2025-10-10T08:00:00.000Z,append,SUM,600,0,600,600,0,1,2025-10-01T00:00:00.000Z,2025-11-01T00:00:00.000Z,1000,50,33333333-3333-3333-3333-333333333333,'-cmd,"{""note"":""a,b\""c"",""tokens"":12}"`,
		`44444444-4444-4444-4444-444444444444,11111111-1111-1111-1111-111111111111,22222222-2222-2222-2222-222222222222,2,2025-10-10T08:00:00.000Z,append,SUM,600,0,600,600,0,1,,,,,33333333-3333-3333-3333-333333333333,,`,
		"",
	}
	if len(lines) != len(want) {
		t.Fatalf("CSV has %d lines, want %d:\n%s", len(lines), len(want), buf.String())
	}
	for i := range want {
		if lines[i] != want[i] {
			t.Errorf("line %d:\n got %s\nwant %s", i, lines[i], want[i])
		}
	}
}

func TestNDJSONExportIsTheListShape(t *testing.T) {
	report := sampleReport()
	export := &Export{Format: FormatJSON, next: pagesOf([]UsageReport{report, report})}
	var buf bytes.Buffer
	if err := export.Write(t.Context(), &buf); err != nil {
		t.Fatal(err)
	}

	lines := strings.Split(strings.TrimSuffix(buf.String(), "\n"), "\n")
	if len(lines) != 2 {
		t.Fatalf("NDJSON has %d lines, want 2:\n%s", len(lines), buf.String())
	}
	listed, err := json.Marshal(report)
	if err != nil {
		t.Fatal(err)
	}
	if lines[0] != string(listed) {
		t.Errorf("NDJSON line:\n got %s\nwant %s", lines[0], listed)
	}
	if strings.Contains(lines[0], "organizationId") {
		t.Error("the organization id is a CSV column only")
	}
}

func TestTextCell(t *testing.T) {
	for in, want := range map[string]string{
		"=SUM(A1)": "'=SUM(A1)", "+1": "'+1", "-cmd": "'-cmd", "@x": "'@x",
		"evt-1": "evt-1", "": "", "{}": "{}",
	} {
		if got := textCell(in); got != want {
			t.Errorf("textCell(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestFilename(t *testing.T) {
	r := Range{From: time.Date(2025, 10, 1, 0, 0, 0, 0, time.UTC), To: time.Date(2025, 12, 1, 0, 0, 0, 0, time.UTC)}
	if got := filename("usage-acme-tokens", r, FormatCSV); got != "usage-acme-tokens-20251001-20251201.csv" {
		t.Errorf("filename() = %q", got)
	}
	if got := filename("usage", r, FormatJSON); got != "usage-20251001-20251201.ndjson" {
		t.Errorf("filename() = %q", got)
	}
}

func errorAs(err error, target **apierrors.Error) bool {
	return errors.As(err, target)
}
