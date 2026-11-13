package getpubliccatalog

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/gate"
	"github.com/kaitencloud/kaiten/api/pkg/dogfooding"
)

type addonCapability struct {
	granted bool
	err     error
	calls   []string
}

func (a *addonCapability) Entitled(_ context.Context, _ uuid.UUID, slug string) (bool, error) {
	a.calls = append(a.calls, slug)
	return a.granted, a.err
}

func TestPublicCatalogueOffersAddonsOnlyWithAKnownGrant(t *testing.T) {
	for _, tc := range []struct {
		name    string
		granted bool
		err     error
	}{
		{"granted", true, nil}, {"denied", false, nil}, {"unknown", false, errors.New("licensing unavailable")},
	} {
		t.Run(tc.name, func(t *testing.T) {
			source := &addonCapability{granted: tc.granted, err: tc.err}
			u := NewUseCase(Deps{Gate: gate.New(true, source)})
			org := uuid.New()
			require.False(t, u.offersAddons(t.Context(), org, false))
			require.Empty(t, source.calls, "an omitted add-on catalogue checked its grant")
			require.Equal(t, tc.granted && tc.err == nil, u.offersAddons(t.Context(), org, true))
			require.Equal(t, []string{dogfooding.AddonsEntitlementSlug}, source.calls)
		})
	}
	u := NewUseCase(Deps{Gate: gate.New(true, nil)})
	require.True(t, u.offersAddons(t.Context(), uuid.New(), true), "self-hosted offers add-ons")
}
