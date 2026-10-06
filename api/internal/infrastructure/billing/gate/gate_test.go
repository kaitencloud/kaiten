package gate

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"

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
