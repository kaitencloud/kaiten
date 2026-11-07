package auditretention

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

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

func TestWindowDays(t *testing.T) {
	t.Parallel()
	org := uuid.New()

	t.Run("the licence's term wins", func(t *testing.T) {
		t.Parallel()
		days, source := windowDays(t.Context(), stubReader{raw: json.RawMessage(`{"days": 30}`)}, Settings{RetentionDays: 7}, org)
		require.Equal(t, sourceLicence, source)
		assert.Equal(t, 30, days)
	})

	t.Run("no licensing authority reads the deployment's setting", func(t *testing.T) {
		t.Parallel()
		days, source := windowDays(t.Context(), stubReader{err: services.ErrNoLicensingAuthority}, Settings{RetentionDays: 7}, org)
		require.Equal(t, sourceConfig, source)
		assert.Equal(t, 7, days)
	})

	t.Run("no licensing authority and no setting keeps forever", func(t *testing.T) {
		t.Parallel()
		days, source := windowDays(t.Context(), services.NoLicensingAuthority{}, Settings{}, org)
		require.Equal(t, sourceConfig, source)
		assert.Equal(t, 0, days)
	})

	t.Run("an error keeps the entries", func(t *testing.T) {
		t.Parallel()
		_, source := windowDays(t.Context(), stubReader{err: errors.New("timeout")}, Settings{RetentionDays: 7}, org)
		assert.Equal(t, sourceUnknown, source)
	})

	t.Run("a licence that does not grant the term keeps the entries", func(t *testing.T) {
		t.Parallel()
		_, source := windowDays(t.Context(), stubReader{}, Settings{RetentionDays: 7}, org)
		assert.Equal(t, sourceUnknown, source)
	})

	t.Run("a malformed term keeps the entries", func(t *testing.T) {
		t.Parallel()
		_, source := windowDays(t.Context(), stubReader{raw: json.RawMessage(`{"days": "soon"}`)}, Settings{RetentionDays: 7}, org)
		assert.Equal(t, sourceUnknown, source)
	})
}
