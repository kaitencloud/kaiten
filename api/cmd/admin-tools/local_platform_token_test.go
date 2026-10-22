package main

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	identityschema "github.com/kaitencloud/kaiten/api/internal/modules/identity/schema"
)

type localTokenFixture struct {
	id     uuid.UUID
	valid  bool
	rows   []identityschema.PlatformToken
	err    error
	listed bool
}

func (f *localTokenFixture) ValidatePlatformToken(context.Context, string) (uuid.UUID, []string, bool) {
	return f.id, nil, f.valid
}
func (f *localTokenFixture) ListPlatformTokens(context.Context) ([]identityschema.PlatformToken, error) {
	f.listed = true
	return f.rows, f.err
}

func TestLocalPlatformTokenPolicy(t *testing.T) {
	id := uuid.New()
	row := identityschema.PlatformToken{ID: id, Name: "local", Scopes: []string{"write:tokens", "read:organizations"}}
	for _, test := range []struct {
		name   string
		change func(*identityschema.PlatformToken)
	}{
		{"name", func(row *identityschema.PlatformToken) { row.Name = "other" }},
		{"scopes", func(row *identityschema.PlatformToken) { row.Scopes = []string{"*"} }},
		{"expiry", func(row *identityschema.PlatformToken) { at := time.Now().Add(time.Hour); row.ExpiresAt = &at }},
		{"revocation", func(row *identityschema.PlatformToken) { at := time.Now(); row.RevokedAt = &at }},
		{"identity", func(row *identityschema.PlatformToken) { row.ID = uuid.New() }},
	} {
		t.Run(test.name, func(t *testing.T) {
			changed := row
			test.change(&changed)
			fixture := &localTokenFixture{id: id, valid: true, rows: []identityschema.PlatformToken{changed}}
			require.ErrorContains(t, validateLocalPlatformToken(context.Background(), fixture, "synthetic", "local", row.Scopes), "no rotation performed")
		})
	}
	fixture := &localTokenFixture{id: id, valid: true, rows: []identityschema.PlatformToken{row}}
	require.NoError(t, validateLocalPlatformToken(context.Background(), fixture, "synthetic", " local ", []string{"read:organizations", "write:tokens", "write:tokens"}))
}

func TestLocalPlatformTokenValidationFailsClosed(t *testing.T) {
	// Identity intentionally masks DB failures as false. That result never mints,
	// writes, revokes or even reads inventory; the only operation here is validation.
	fixture := &localTokenFixture{valid: false}
	require.ErrorContains(t, validateLocalPlatformToken(context.Background(), fixture, "synthetic", "local", []string{"read:tokens"}), "no rotation performed")
	require.False(t, fixture.listed)
	outage := errors.New("synthetic database unavailable")
	fixture = &localTokenFixture{valid: true, err: outage}
	require.ErrorIs(t, validateLocalPlatformToken(context.Background(), fixture, "synthetic", "local", []string{"read:tokens"}), outage)
}
