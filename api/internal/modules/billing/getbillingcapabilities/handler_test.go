package getbillingcapabilities

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/gate"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/ports"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/pkg/dogfooding"
)

type member struct{ user currentuser.User }

func (m member) GetUser(context.Context) (*currentuser.User, error) { return &m.user, nil }

type history struct{ ports.UsageSource }

func (history) RetentionWindow(context.Context, uuid.UUID) (int, string) { return 0, "ENV" }

type licensing struct {
	fail     string
	vouchers bool
}

func (l *licensing) Entitled(_ context.Context, _ uuid.UUID, slug string) (bool, error) {
	if slug == l.fail {
		return false, errors.New("authority unavailable")
	}
	if slug == dogfooding.VouchersEntitlementSlug {
		return l.vouchers, nil
	}
	return true, nil
}

func TestCapabilitiesDistinguishUnknownGrantFromDenial(t *testing.T) {
	m := member{currentuser.User{ID: uuid.New(), OrganizationID: uuid.New()}}
	source := &licensing{vouchers: true}
	g := gate.NewCached(true, source, time.Minute)
	require.NoError(t, g.Require(t.Context(), m.user.OrganizationID))
	source.fail = dogfooding.VouchersEntitlementSlug
	u := NewUseCase(access.Deps{UserProvider: m, Gate: g, Usage: history{}}, time.Hour)
	got, err := u.Execute(t.Context())
	require.NoError(t, err)
	require.True(t, got.Enabled, "a capability outage does not erase billing read access")
	require.False(t, got.Features.Vouchers)
	require.True(t, got.Features.Addons)
	require.Equal(t, []string{dogfooding.VouchersEntitlementSlug}, got.FeatureCheckUnavailable)
	require.Equal(t, "Vouchers.EntitlementCheckUnavailable", apierrors.GetCode(g.RequireEntitlement(t.Context(), m.user.OrganizationID, dogfooding.VouchersEntitlementSlug, "Vouchers")))
	source.fail, source.vouchers = "", false
	got, err = u.Execute(t.Context())
	require.NoError(t, err)
	require.False(t, got.Features.Vouchers)
	require.Empty(t, got.FeatureCheckUnavailable, "retry can learn a known denial instead")
	encoded, err := json.Marshal(got)
	require.NoError(t, err)
	require.NotContains(t, string(encoded), "featureCheckUnavailable")
}

func TestColdBillingOutageRemainsRetryable(t *testing.T) {
	m := member{currentuser.User{OrganizationID: uuid.New()}}
	u := NewUseCase(access.Deps{UserProvider: m, Gate: gate.New(true, &licensing{fail: dogfooding.BillingEntitlementSlug}), Usage: history{}}, 0)
	got, err := u.Execute(t.Context())
	require.Nil(t, got)
	require.Equal(t, gate.CodeEntitlementCheckUnavailable, apierrors.GetCode(err))
}
