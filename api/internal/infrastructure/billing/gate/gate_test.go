package gate

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/pkg/dogfooding"
)

type fakeEntitlements struct {
	entitled bool
	err      error
	asked    string
}

func (f *fakeEntitlements) Entitled(_ context.Context, _ uuid.UUID, slug string) (bool, error) {
	f.asked = slug
	return f.entitled, f.err
}

func TestRequire(t *testing.T) {
	cases := []struct {
		name     string
		enabled  bool
		checker  *fakeEntitlements
		wantCode string
	}{
		{"disabled deployment", false, &fakeEntitlements{entitled: true}, CodeDisabled},
		{"entitled", true, &fakeEntitlements{entitled: true}, ""},
		{"not entitled", true, &fakeEntitlements{entitled: false}, CodeNotEntitled},
		{"licensing authority unreachable", true, &fakeEntitlements{err: errors.New("timeout")}, CodeEntitlementCheckUnavailable},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := New(tc.enabled, tc.checker).Require(t.Context(), uuid.New())
			switch {
			case tc.wantCode == "" && err != nil:
				t.Fatalf("Require() = %v, want nil", err)
			case tc.wantCode != "" && apierrors.GetCode(err) != tc.wantCode:
				t.Fatalf("Require() code = %q (%v), want %q", apierrors.GetCode(err), err, tc.wantCode)
			}
			if tc.enabled && tc.checker.asked != dogfooding.BillingEntitlementSlug {
				t.Errorf("asked about %q, want the billing entitlement", tc.checker.asked)
			}
		})
	}
}

func TestSelfHostedIsAlwaysEntitled(t *testing.T) {
	if err := New(true, nil).Require(t.Context(), uuid.New()); err != nil {
		t.Fatalf("Require() = %v, want nil without a licensing authority", err)
	}
}

type countingEntitlements struct {
	entitled bool
	err      error
	calls    int
}

func (c *countingEntitlements) Entitled(context.Context, uuid.UUID, string) (bool, error) {
	c.calls++
	return c.entitled, c.err
}

// §13.1: the gate trusts an answer for its TTL, and while the licensing
// authority cannot be reached the last answer stands; only an organization
// never answered for is refused 503.
func TestRequireCachesTheLicensingAuthoritysAnswer(t *testing.T) {
	now := time.Date(2026, 10, 9, 12, 0, 0, 0, time.UTC)
	source := &countingEntitlements{entitled: true}
	g := NewCached(true, source, time.Minute)
	g.answers.now = func() time.Time { return now }
	org := uuid.New()

	require.NoError(t, g.Require(t.Context(), org))
	require.NoError(t, g.Require(t.Context(), org))
	require.Equal(t, 1, source.calls, "trusted for a minute")

	now = now.Add(2 * time.Minute)
	source.entitled = false
	require.Equal(t, CodeNotEntitled, apierrors.GetCode(g.Require(t.Context(), org)), "asked again after the TTL")
	require.Equal(t, 2, source.calls)

	now = now.Add(2 * time.Minute)
	source.err = errors.New("KbK is down")
	require.Equal(t, CodeNotEntitled, apierrors.GetCode(g.Require(t.Context(), org)), "the last answer stands")
	require.Equal(t, CodeEntitlementCheckUnavailable, apierrors.GetCode(g.Require(t.Context(), uuid.New())),
		"nothing known of another organization")

	now = now.Add(25 * time.Minute)
	require.Equal(t, CodeEntitlementCheckUnavailable, apierrors.GetCode(g.Require(t.Context(), org)),
		"an answer older than 24 TTLs is forgotten")
}
