package usageledger

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
)

type fakeReader struct {
	value json.RawMessage
	err   error
}

func (f fakeReader) ConfigValue(context.Context, uuid.UUID, string) (json.RawMessage, error) {
	return f.value, f.err
}

func TestWindowMonths(t *testing.T) {
	settings := Settings{RetentionMonths: 18}
	cases := []struct {
		name       string
		reader     fakeReader
		wantMonths int
		wantSource retentionSource
	}{
		{"licence grants 3", fakeReader{value: json.RawMessage(`{"months": 3}`)}, 3, sourceLicence},
		{"no licensing authority: the configuration", fakeReader{err: services.ErrNoLicensingAuthority}, 18, sourceConfig},
		{"authority unreachable", fakeReader{err: errors.New("timeout")}, 0, sourceUnknown},
		{"not granted", fakeReader{}, 0, sourceUnknown},
		{"zero months", fakeReader{value: json.RawMessage(`{"months": 0}`)}, 0, sourceUnknown},
		{"negative", fakeReader{value: json.RawMessage(`{"months": -6}`)}, 0, sourceUnknown},
		{"fractional", fakeReader{value: json.RawMessage(`{"months": 2.5}`)}, 0, sourceUnknown},
		{"a string", fakeReader{value: json.RawMessage(`{"months": "6"}`)}, 0, sourceUnknown},
		{"missing", fakeReader{value: json.RawMessage(`{"days": 90}`)}, 0, sourceUnknown},
		{"not an object", fakeReader{value: json.RawMessage(`6`)}, 0, sourceUnknown},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			months, source := windowMonths(t.Context(), tc.reader, settings, uuid.New())
			if months != tc.wantMonths || source != tc.wantSource {
				t.Errorf("windowMonths() = %d, %s; want %d, %s", months, source, tc.wantMonths, tc.wantSource)
			}
		})
	}
}

func TestDropCeilingMonths(t *testing.T) {
	cases := []struct {
		retention, max int
		want           int
		wantOK         bool
	}{
		{18, 18, 18, true},
		{24, 18, 24, true}, // a longer self-hosted window is never cut short
		{6, 18, 18, true},
		{0, 18, 0, false}, // keep forever
		{18, 0, 0, false},
	}
	for _, tc := range cases {
		got, ok := Settings{RetentionMonths: tc.retention, MaxRetentionMonths: tc.max}.dropCeilingMonths()
		if got != tc.want || ok != tc.wantOK {
			t.Errorf("dropCeilingMonths(%d, %d) = %d, %v; want %d, %v", tc.retention, tc.max, got, ok, tc.want, tc.wantOK)
		}
	}
}

func TestCutoffNeverEntersTheIdempotencyHorizon(t *testing.T) {
	now := time.Date(2026, 5, 31, 12, 0, 0, 0, time.UTC)
	settings := Settings{IdempotencyWindow: 35 * 24 * time.Hour}

	if got, want := settings.cutoff(now, 3), time.Date(2026, 2, 28, 12, 0, 0, 0, time.UTC); !got.Equal(want) {
		t.Errorf("cutoff(3 months) = %v, want %v (calendar months, clamped)", got, want)
	}
	if got, want := settings.cutoff(now, 1), now.Add(-35*24*time.Hour); !got.Equal(want) {
		t.Errorf("cutoff(1 month) = %v, want the 35-day horizon %v", got, want)
	}
}

func TestRetentionStart(t *testing.T) {
	now := time.Date(2026, 10, 5, 12, 0, 0, 0, time.UTC)
	settings := Settings{RetentionMonths: 18, MaxRetentionMonths: 18, IdempotencyWindow: 35 * 24 * time.Hour}

	cases := []struct {
		name   string
		reader services.EntitlementConfig
		want   *time.Time
	}{
		{"licence grants 3 months", fakeReader{value: json.RawMessage(`{"months": 3}`)}, ptrTime(time.Date(2026, 7, 5, 12, 0, 0, 0, time.UTC))},
		{"licence grants 1 month: the idempotency horizon wins", fakeReader{value: json.RawMessage(`{"months": 1}`)}, ptrTime(now.Add(-35 * 24 * time.Hour))},
		{"no licensing authority: the configuration", nil, ptrTime(time.Date(2025, 4, 5, 12, 0, 0, 0, time.UTC))},
		{"unknown: unrestricted", fakeReader{err: errors.New("timeout")}, nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := Retention{Reader: tc.reader, Settings: settings}.Start(t.Context(), uuid.New(), now)
			if (got == nil) != (tc.want == nil) || (got != nil && !got.Equal(*tc.want)) {
				t.Errorf("Start() = %v, want %v", got, tc.want)
			}
		})
	}

	forever := Retention{Settings: Settings{RetentionMonths: 0, IdempotencyWindow: settings.IdempotencyWindow}}
	if got := forever.Start(t.Context(), uuid.New(), now); got != nil {
		t.Errorf("Start() with history kept forever = %v, want nil", got)
	}
}

func ptrTime(t time.Time) *time.Time { return &t }
