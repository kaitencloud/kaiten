package auditretention

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
)

func TestParseRetention(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		raw  string
		days int
		ok   bool
	}{
		{name: "whole days", raw: `{"days": 90}`, days: 90, ok: true},
		{name: "one day", raw: `{"days": 1}`, days: 1, ok: true},
		{name: "a century", raw: `{"days": 36500}`, days: 36500, ok: true},
		{name: "zero is not a window", raw: `{"days": 0}`},
		{name: "negative", raw: `{"days": -7}`},
		{name: "above a century", raw: `{"days": 36501}`},
		{name: "fractional", raw: `{"days": 1.5}`},
		{name: "quoted number", raw: `{"days": "30"}`},
		{name: "wrong key", raw: `{"months": 3}`},
		{name: "not an object", raw: `30`},
		{name: "empty", raw: ``},
		{name: "garbage", raw: `{`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			days, ok := parseRetention(json.RawMessage(tc.raw))
			assert.Equal(t, tc.ok, ok)
			assert.Equal(t, tc.days, days)
		})
	}
}

type stubReader struct {
	raw json.RawMessage
	err error
}

func (s stubReader) ConfigValue(context.Context, uuid.UUID, string) (json.RawMessage, error) {
	return s.raw, s.err
}

func (s stubReader) LiveConfigValue(context.Context, uuid.UUID, string) (json.RawMessage, error) {
	return s.raw, s.err
}

func TestWindowDays(t *testing.T) {
	t.Parallel()
	org := uuid.New()
	settings := Settings{RetentionDays: 7}

	cases := []struct {
		name   string
		reader stubReader
		days   int
		source retentionSource
	}{
		{name: "the licence's term wins", reader: stubReader{raw: json.RawMessage(`{"days": 30}`)}, days: 30, source: sourceLicence},
		{name: "no licensing authority reads the deployment's setting", reader: stubReader{err: services.ErrNoLicensingAuthority}, days: 7, source: sourceConfig},
		{name: "an error keeps the entries", reader: stubReader{err: errors.New("timeout")}, source: sourceUnknown},
		{name: "a licence that does not grant the term keeps the entries", reader: stubReader{}, source: sourceNotGranted},
		{name: "a malformed term keeps the entries", reader: stubReader{raw: json.RawMessage(`{"days": "soon"}`)}, source: sourceMalformed},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			days, source := windowDays(t.Context(), tc.reader.LiveConfigValue, settings, org)
			require.Equal(t, tc.source, source)
			assert.Equal(t, tc.days, days)
		})
	}

	t.Run("no licensing authority and no setting keeps forever", func(t *testing.T) {
		t.Parallel()
		days, source := windowDays(t.Context(), services.NoLicensingAuthority{}.LiveConfigValue, Settings{}, org)
		require.Equal(t, sourceConfig, source)
		assert.Equal(t, 0, days)
	})
}

func TestRetentionClamp(t *testing.T) {
	t.Parallel()
	org := uuid.New()
	now := time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)
	start := now.AddDate(0, 0, -30)
	earlier := start.AddDate(0, 0, -5)
	later := start.AddDate(0, 0, 5)
	thirtyDays := stubReader{raw: json.RawMessage(`{"days": 30}`)}

	cases := []struct {
		name      string
		retention Retention
		after     *time.Time
		want      *time.Time
	}{
		{name: "no bound asked starts at the window", retention: Retention{Reader: thirtyDays}, want: &start},
		{name: "a bound before the window starts at the window", retention: Retention{Reader: thirtyDays}, after: &earlier, want: &start},
		{name: "a bound inside the window is kept", retention: Retention{Reader: thirtyDays}, after: &later, want: &later},
		{name: "the zero value restricts nothing", retention: Retention{}, after: &earlier, want: &earlier},
		{name: "keep-forever restricts nothing", retention: NewRetention(services.NoLicensingAuthority{}, true, 0)},
		{name: "retention switched off restricts nothing", retention: NewRetention(thirtyDays, false, 30)},
		{name: "an unreadable retention restricts nothing", retention: Retention{Reader: stubReader{err: errors.New("timeout")}}},
		{name: "an ungranted term restricts nothing", retention: Retention{Reader: stubReader{}}},
		{name: "the deployment's setting applies without an authority", retention: NewRetention(nil, true, 30), want: &start},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			assert.Equal(t, tc.want, tc.retention.Clamp(t.Context(), org, now, tc.after))
		})
	}
}
